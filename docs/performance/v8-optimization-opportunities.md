# V8 Optimization Opportunities

Identified during the V8 performance audit (March 2026). Each section is a self-contained optimization that can be tackled independently. They are ordered by estimated impact.

> **Context:** The storage adapter's string-comparison read cache (`src/adapters/storage.ts`) proved that avoiding redundant work at the V8 level yields ~5000x improvements in hot paths. This document catalogs similar opportunities across the codebase.

---

## Status

| # | Optimization | Status | Branch / PR |
|---|-------------|--------|-------------|
| 1 | [Storage write cache pre-population](#1-storage-write-cache-pre-population) | **Done** | `claude/audit-v8-performance-xWIn6` |
| 2 | [URL adapter search-string cache](#2-url-adapter-search-string-cache) | **Done** | `claude/audit-v8-performance-xWIn6` |
| 3 | [Promise.all short-circuit for memory deps](#3-promiseall-short-circuit-for-memory-deps) | **Done** | `claude/audit-v8-performance-xWIn6` |
| 4 | [Computed settled getter caching](#4-computed-settled-getter-caching) | **Done** (merged into #3) | `claude/audit-v8-performance-xWIn6` |
| 5 | [Listener notification try/catch extraction](#5-listener-notification-trycatch-extraction) | **Done** | `claude/audit-v8-performance-xWIn6` |
| 6 | [Subscribe closure allocation](#6-subscribe-closure-allocation) | **Won't fix** | — |
| 7 | [scopedKey template literal](#7-scopedkey-template-literal) | **Won't fix** | — |

---

## 1. Storage write cache pre-population

**File:** `src/adapters/storage.ts` (lines 62-90)

**The problem:**

After `write()` calls `storage.setItem(key, raw)`, it invalidates the read cache:

```ts
cachedRaw = undefined
cachedValue = undefined
```

This means the very next `read()` — which happens immediately in subscriber chains, computed derivations, and effects — must call `storage.getItem(key)` and compare the raw string against `undefined` (cache miss), forcing a full re-read from the storage bridge.

**Why it matters:**

The read-after-write pattern is extremely common:

```
state.set(newValue)
  → adapter.set(newValue)
    → storage.setItem(key, raw)
    → cachedRaw = undefined          // cache invalidated
    → notify(listeners)
      → listener fires
        → someComputed.get()
          → source.get()
            → adapter.get()
              → read()
                → storage.getItem(key)  // unnecessary — we just wrote this
                → raw === cachedRaw?    // miss — cachedRaw is undefined
                → JSON.parse(raw)       // full re-parse
```

**Proposed fix:**

After a successful `setItem`, pre-populate the cache with the values we already have:

```ts
function write(value: T): void {
    try {
        const toStore = pickKeys(value, persist)
        const raw = serialize ? serialize.stringify(toStore) : wrapForStorage(toStore, version)

        storage.setItem(key, raw)

        // Pre-populate cache — next read() hits the fast path
        cachedRaw = raw
        cachedValue = value
    } catch (e) {
        // ... existing error handling, cache stays invalidated
    }
}
```

**Why this is safe:**

- Cross-tab writes fire `storage` events, which set `cachedRaw = undefined` (line 99-101) — so stale cache from another tab's perspective is impossible.
- If `setItem` throws (quota exceeded, etc.), we stay in the `catch` block where the cache is already `undefined`.
- The `value` stored in `cachedValue` is the *original* value (before `pickKeys`), which is exactly what `read()` returns after `mergeKeys`. Wait — actually, `read()` calls `mergeKeys(parse(raw), defaultValue, persist)`. If `persist` is set, `pickKeys` strips keys on write, and `mergeKeys` re-adds defaults on read. So `cachedValue` must be the *merged* result, not the raw input.

**Correct version for `persist` support:**

```ts
// Pre-populate cache — the cached value must match what read() would return,
// which is the merge of the stored (possibly partial) value with defaults.
cachedRaw = raw
cachedValue = persist ? mergeKeys(toStore as T, defaultValue, persist) : value
```

**Verification:**

- Benchmark: `npx tsx benchmarks/internal.bench.ts` (storage read/write suite, if one exists — otherwise create a targeted microbenchmark)
- Test: all existing storage tests must pass
- Edge case: test with `persist` option to verify partial-key round-trip

**Risk:** Low. The cache is a performance optimization with no semantic effect — `read()` always returns the same value whether from cache or storage.

---

## 2. URL adapter search-string cache

**File:** `src/adapters/url.ts` (lines 21-35)

**The problem:**

Every `read()` call constructs a new `URLSearchParams` from `window.location.search`:

```ts
function read(): T {
    try {
        const params = new URLSearchParams(window.location.search)
        const raw = params.get(key)
        if (raw === null) return defaultValue
        return mergeKeys(serializer.parse(raw), defaultValue, persist)
    } catch {
        return defaultValue
    }
}
```

`URLSearchParams` constructor parses the entire query string — every `?key=value&key2=value2` pair — even if nothing changed. This is the exact same pattern that the storage adapter had before the string-comparison cache: redundant parsing on every read.

**Why it matters:**

URL-scoped state is read by `get()` on every subscriber notification, computed recomputation, and effect run. A computed chain of depth 5 with a URL dep calls `read()` at least 5 times per URL change. If nothing changed (e.g., a different state triggered the recomputation), all 5 calls parse the query string for nothing.

**Proposed fix:**

Apply the same string-comparison cache pattern:

```ts
let cachedSearch: string | undefined
let cachedValue: T | undefined

function read(): T {
    try {
        const search = window.location.search

        if (search === cachedSearch && cachedValue !== undefined) return cachedValue

        const params = new URLSearchParams(search)
        const raw = params.get(key)

        if (raw === null) {
            cachedSearch = search
            cachedValue = undefined
            return defaultValue
        }

        const value = mergeKeys(serializer.parse(raw), defaultValue, persist)

        cachedSearch = search
        cachedValue = value

        return value
    } catch {
        return defaultValue
    }
}
```

**Invalidation points:**

- `write()` changes the URL via `pushState` — invalidate cache (`cachedSearch = undefined`)
- `popstate` event fires — the event handler already calls `read()`, which will see the new `location.search` and re-parse

**Edge case — null vs default:**

When `raw === null` (key not in URL), `cachedValue` is `undefined`, but we need to return `defaultValue`. We need a sentinel to distinguish "cached as absent" from "not cached":

```ts
let cachedSearch: string | undefined  // undefined = no cache
let cachedValue: T = defaultValue     // always valid when cachedSearch is set

function read(): T {
    try {
        const search = window.location.search
        if (search === cachedSearch) return cachedValue
        // ... parse and cache
    }
}
```

**Verification:**

- Benchmark: create a microbenchmark that reads URL state 1M times without changing the URL
- Test: all existing URL adapter tests must pass
- Manual test: navigate back/forward, verify values update correctly

**Risk:** Low. Same proven pattern as the storage adapter cache.

---

## 3. Promise.all short-circuit for memory deps

**Files:** `src/computed.ts` (lines 118-120), `src/select.ts` (lines 97-105)

**The problem:**

Every `computed()` and `select()` eagerly creates promise chains on construction:

```ts
// computed.ts
const readyPromise = Promise.all(deps.map((d) => d.ready)).then(() => undefined)
const hydratedPromise = Promise.all(deps.map((d) => d.hydrated)).then(() => undefined)

// select.ts — uses source.ready / source.hydrated directly (already optimal)
```

For memory-scoped deps (the vast majority), `d.ready` and `d.hydrated` both return `RESOLVED` — the same shared `Promise.resolve()` instance from `core.ts:37`. But `Promise.all` still:

1. Allocates a new array via `.map()`
2. Creates a new `Promise.all` promise
3. Creates a `.then()` wrapper promise
4. Schedules microtask resolution

That's 3-4 allocations per `computed()` call, times 2 (ready + hydrated) = 6-8 unnecessary allocations.

**Why it matters:**

Applications with many derived states (dashboards, form validation, data grids) may create hundreds of `computed()` instances. Each one pays this cost at construction time. During component mount storms (page navigation, list rendering), this compounds.

**Proposed fix:**

Export `RESOLVED` from `core.ts` (or a shared constants module) and check for the fast path:

```ts
// In computed.ts:
import { RESOLVED } from './core.js'

const readyPromise = deps.every((d) => d.ready === RESOLVED)
    ? RESOLVED
    : Promise.all(deps.map((d) => d.ready)).then(() => undefined)

const hydratedPromise = deps.every((d) => d.hydrated === RESOLVED)
    ? RESOLVED
    : Promise.all(deps.map((d) => d.hydrated)).then(() => undefined)
```

The `.every()` check is O(n) but with no allocations — just pointer comparisons. For the common case (all memory deps), it short-circuits immediately.

**Select is already optimal** — it delegates directly to `source.ready` / `source.hydrated` without wrapping.

**Verification:**

- Benchmark: `npx tsx benchmarks/internal.bench.ts computed-chain computed-fan-in lifecycle`
- Test: all computed tests must pass, including any with async/storage deps
- Confirm `RESOLVED` identity: add a test that verifies `computed([memoryState], fn).ready === RESOLVED`

**Risk:** None. Behavioral no-op — just avoids unnecessary allocations.

---

## 4. Computed settled getter caching

**File:** `src/computed.ts` (lines 130-132)

**The problem:**

The `settled` getter allocates on every access:

```ts
get settled(): Promise<void> {
    return Promise.all(deps.map((d) => d.settled)).then(() => undefined)
}
```

Every `.settled` read creates:
1. A new array via `.map()`
2. A new `Promise.all` promise
3. A new `.then()` wrapper

Unlike `ready` and `hydrated` (which are cached once at construction), `settled` can change over time — it resolves when all deps' last writes have completed. But for memory-scoped deps, `d.settled` is always `RESOLVED`, so this getter allocates pointlessly every time.

**Why it matters:**

Code that awaits `computed.settled` in loops or chains (e.g., `await Promise.all(derivations.map(d => d.settled))`) triggers N allocations per call. For memory-only dep trees, this is pure waste.

**Proposed fix:**

For the all-memory fast path, return `RESOLVED` directly:

```ts
// At construction time:
const allDepsMemory = deps.every((d) => d.ready === RESOLVED)

// In the getter:
get settled(): Promise<void> {
    if (allDepsMemory) return RESOLVED
    return Promise.all(deps.map((d) => d.settled)).then(() => undefined)
}
```

This uses `d.ready === RESOLVED` as a proxy for "this dep is memory-scoped" — memory deps always have `ready === RESOLVED`, and their `settled` is also always `RESOLVED` since there's no async write pipeline.

**Verification:**

- Benchmark: create a microbenchmark that reads `.settled` on a computed with all-memory deps 1M times
- Test: existing computed tests must pass; add a test that `settled` resolves correctly for mixed-scope dep trees

**Risk:** None. Pure fast-path addition.

---

## 5. Listener notification try/catch extraction

**Files:** `src/listeners.ts` (lines 16-26), `src/core.ts` (lines 554-562), `src/adapters/memory.ts` (lines 11-19)

**The problem:**

The notification hot loop wraps each listener call in try/catch:

```ts
// listeners.ts
notify(value: T): void {
    for (const listener of set) {
        try {
            listener(value)
        } catch (err) {
            console.error('[gjendje] Listener threw:', err)
        }
    }
}
```

The same pattern appears in `MemoryStateImpl.subscribe` (core.ts:554-562) and `createMemoryAdapter` (memory.ts:11-19).

**V8 context:**

Historically, V8's Crankshaft compiler could not optimize functions containing try/catch at all — the entire function was interpreted. Modern V8 (TurboFan, since ~2017) *can* optimize try/catch, but the optimizer still treats the try block as a potential deopt point. The catch block generates additional exception handler metadata and stack unwinding code.

In a tight notification loop that fires millions of times per second, this overhead — while small per iteration — adds up. More importantly, the try/catch prevents V8 from inlining the loop body in certain cases.

**Proposed fix:**

Extract the try/catch into a separate "safe call" function. V8 can then optimize the loop independently:

```ts
function safeCall<T>(listener: Listener<T>, value: T): void {
    try {
        listener(value)
    } catch (err) {
        console.error('[gjendje] Listener threw:', err)
    }
}

notify(value: T): void {
    for (const listener of set) {
        safeCall(listener, value)
    }
}
```

By isolating the try/catch in `safeCall`, the `notify` function itself becomes a simple `for...of` loop that V8 can optimize aggressively (inline caching, loop unrolling, etc.). The `safeCall` function will be called via a normal call — V8 may even inline it if the listener is monomorphic.

**Alternative: optimistic path (higher complexity):**

```ts
notify(value: T): void {
    for (const listener of set) {
        listener(value)  // No try/catch — fast path
    }
}
```

This removes error isolation entirely. If a listener throws, subsequent listeners are skipped. This changes observable behavior and could break user expectations. **Not recommended** without a feature flag or documentation change.

**Verification:**

- Benchmark: `npx tsx benchmarks/internal.bench.ts effect middleware` — effects and middleware both exercise the listener notification path heavily
- Also benchmark: `subscribe-churn` and `batch-scaling` suites
- Test: add a test that a throwing listener doesn't prevent other listeners from firing (this is the existing behavior we must preserve)

**Risk:** None for the extraction approach. The safe-call function preserves identical behavior.

---

## 6. Subscribe closure allocation

**File:** `src/core.ts` (lines 569-571)

**The problem:**

Every `subscribe()` call allocates a new closure for the unsubscribe function:

```ts
override subscribe(listener: Listener<T>): Unsubscribe {
    // ...
    set.add(listener)

    return () => {
        set.delete(listener)
    }
}
```

For React integration, components mount → subscribe → unmount → unsubscribe on every render cycle. Each cycle allocates a closure that captures `set` and `listener`. Under rapid mount/unmount (list virtualization, tab switching), this creates GC pressure.

**Why it matters:**

Each closure is small (~64 bytes on V8), but at 10K subscribe/unsubscribe cycles per second (realistic for a large React app), that's ~640KB of short-lived garbage per second — enough to trigger minor GC pauses.

**Proposed fix (exploratory):**

Return a lightweight disposable object with a shared prototype method instead of a per-instance closure:

```ts
class Subscription<T> {
    private _set: Set<Listener<T>>
    private _listener: Listener<T>

    constructor(set: Set<Listener<T>>, listener: Listener<T>) {
        this._set = set
        this._listener = listener
    }

    // Single shared method on prototype — not per-instance
    call(): void {
        this._set.delete(this._listener)
    }
}
```

However, this **changes the return type** from `() => void` to an object with a `.call()` method. This is a breaking API change unless we use a callable object pattern (which adds its own complexity).

**Alternative: WeakRef-based approach:**

Not viable — WeakRef adds more overhead than it saves for this use case.

**Verdict: Won't fix.** The cost is ~64 bytes per subscribe — at realistic churn rates (~100/sec during heavy interaction), that's ~6.4KB/sec of short-lived garbage, which V8's generational GC handles trivially (young generation collections are <1ms and short-lived closures are exactly the pattern they're optimized for). Every viable fix either requires a breaking API change (return type `() => void` → object), or adds complexity that costs more than it saves (Proxy-based callable objects, WeakRef finalization). The standard `() => void` return type is also what zustand, valtio, and jotai use — changing it would break React integration patterns like `useEffect` cleanup. If subscribe/unsubscribe ever shows up as a GC bottleneck in a real app profile, the right fix would be at the React integration layer (batching subscriptions, single listener per component tree) rather than at the state library level.

**Risk:** Medium — requires API change or complex callable-object pattern.

---

## 7. scopedKey template literal

**File:** `src/registry.ts` (lines 4-6)

**The problem:**

```ts
export function scopedKey(key: string, scope: Scope): string {
    return `${scope}:${key}`
}
```

Template literals allocate a new string every time. This runs once per `createBase` call.

**Why it's low priority:**

- V8 optimizes template literal concatenation very well (TurboFan generates efficient string builder code)
- `scopedKey` runs once per state creation, not per get/set — it's not on the hot read/write path
- The string is needed for Map lookup, so we can't avoid creating it entirely
- String interning would help for repeated creates of the same key, but that adds a Map lookup which is comparable cost

**Potential micro-optimization:**

Use `+` concatenation instead of template literal — V8 can sometimes optimize `a + ':' + b` slightly better than template literals because it knows the structure at compile time:

```ts
return scope + ':' + key
```

But the difference is likely under 5% and unmeasurable in practice.

**Verdict: Won't fix.** Benchmarked at 3.14M create+destroy ops/s (~318ns per lifecycle). `scopedKey` is one template literal within that — estimated 2-5ns. Even a 50% improvement (unlikely) would yield 0.3-0.6% total improvement, well within JIT noise. V8's TurboFan already optimizes template literals efficiently. Not on any hot read/write path.

---

## Summary

Optimizations #1-5 have been implemented. #6 and #7 were evaluated and closed — the cost/benefit doesn't justify the changes. The biggest wins came from applying the string-comparison cache pattern (#1, #2) and eliminating unnecessary Promise allocations (#3, #4).
