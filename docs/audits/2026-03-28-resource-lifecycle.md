# Audit: Resource Lifecycle & Memory Safety — 2026-03-28

**Scope:** Memory leaks, subscription cleanup, destroy completeness, closure retention,
event listener balance, adapter/enhancer resource management, test coverage for cleanup paths.

**Prior audit status:** All items from previous audits resolved except one low-priority
medium item (`select()` overhead from 2025-03-27 #8).

---

## Findings

### High

#### 1. Bucket adapter: subscription created after final `isDestroyed` guard

**File:** `src/adapters/bucket.ts:214–236`

The last `isDestroyed` check is at line 214. Lines 216–236 run synchronously after it,
so there is no race in current code. However, the `delegateUnsub` assignment at line 232
sits 18 lines after the guard with no further check. If a future refactor introduces an
`await` between them, the subscription would be created after `destroy()` sets
`isDestroyed = true`, and `destroy()` would have already called `delegateUnsub?.()` (which
was still `undefined` at that point). The subscription would then leak.

Add a redundant `isDestroyed` guard immediately before the subscription assignment to
make the code robust against future async changes:

```typescript
// line 231
if (isDestroyed) return

delegateUnsub = delegate.subscribe((value) => {
```

- [ ] Add `isDestroyed` guard before `delegateUnsub` assignment in bucket adapter

---

#### 2. `withWatch` enhancer: failed subscription prevents retry

**File:** `src/enhancers/watch.ts:46–62`

`ensureSubscription()` sets `initialized = true` (line 49) **before** calling
`instance.subscribe()` (line 53). If `subscribe()` throws, `initialized` remains `true`
and `unsubscribe` remains `undefined`. Every subsequent `watch()` call invokes
`ensureSubscription()`, which returns early at line 47 (`initialized` is truthy),
so watchers are registered but never receive notifications.

```typescript
function ensureSubscription() {
    if (unsubscribe || initialized) return

    initialized = true          // ← set before try
    prev = instance.get()
    unsubscribe = instance.subscribe(...)  // ← can throw
}
```

Move `initialized = true` after the subscription succeeds, or reset it in a catch:

```typescript
function ensureSubscription() {
    if (unsubscribe) return

    prev = instance.get()

    unsubscribe = instance.subscribe((next) => { ... })
}
```

The `initialized` flag is unnecessary — checking `unsubscribe` alone is sufficient.

- [ ] Fix `ensureSubscription` in `withWatch` to not block retry on subscription failure

---

### Medium

#### 3. `effect()`: unsubscribers array retains dead references after `stop()`

**File:** `src/effect.ts:98–131`

After `stop()` calls each unsubscriber, the array still holds references to the
(now-dead) unsubscribe functions. These keep the functions and their closures alive until
the caller drops the `{ stop }` handle. Adding `unsubscribers.length = 0` after the loop
(like `computed` already does at line 267) releases them immediately.

```typescript
try {
    for (let i = 0; i < depLen; i++) {
        unsubscribers[i]()
    }
    unsubscribers.length = 0  // ← add this
} finally {
```

- [ ] Clear `unsubscribers` array in `effect.stop()`

---

#### 4. `collection`: watcher state not nullified after destroy

**File:** `src/collection.ts:294–302`

`destroy()` clears the watchers Map and calls `unsubscribe`, but doesn't null out the
references. The `watchers` map and `prevItems` array remain reachable through the
collection closure until the collection itself is GC'd. This is consistent with how
`withWatch` handles it (sets `watchers = undefined`, `unsubscribe = undefined`), but
collection doesn't follow the same pattern.

```typescript
col.destroy = () => {
    try {
        watchers?.clear()
        watchers = undefined       // ← add
        unsubscribe?.()
        unsubscribe = undefined    // ← add
        prevItems = undefined!     // ← add
    } finally {
        baseDestroy.call(col)
    }
}
```

- [ ] Null out `watchers`, `unsubscribe`, and `prevItems` in collection `destroy()`

---

### Low

#### 5. `previous()`: no error handling if `source.subscribe()` throws during init

**File:** `src/previous.ts:68`

If `source.subscribe()` throws on line 68, the `listeners` object and other locals are
allocated but never cleaned up. This is unlikely in practice (subscribe on a valid
instance shouldn't throw), but every other primitive guards this path.

- [ ] Wrap `previous()` subscription in try/catch with cleanup

---

## Areas Verified Clean

The following areas were inspected and found to have correct cleanup:

| Area | Notes |
|------|-------|
| **Storage adapter** (`src/adapters/storage.ts`) | `window.removeEventListener('storage', ...)` called in `destroy()` (line 229–231) |
| **URL adapter** (`src/adapters/url.ts`) | `popstate` listener removed in `destroy()` |
| **Sync adapter** (`src/adapters/sync.ts`) | `BroadcastChannel.close()` in try/catch, adapter cleanup in `finally` |
| **Memory adapter** (`src/adapters/memory.ts`) | Minimal — no external resources |
| **Server adapter** (`src/adapters/server.ts`) | No persistent subscriptions |
| **Computed** (`src/computed.ts`) | `unsubscribers.length = 0` + `listenerSet.clear()` in `destroy()` |
| **Batch** (`src/batch.ts`) | `WeakMap` for dedup — entries cleaned by GC when keys are collected |
| **Registry** (`src/registry.ts`) | `destroyAll()` collects values before iterating; `unregisterByKey` removes entries |
| **withHistory** (`src/enhancers/history.ts`) | Past/future arrays cleared, subscription unsubscribed, base destroy called |
| **DevTools** (`src/devtools/index.ts`) | Original callbacks restored, Redux DevTools disconnected, logger disabled |
| **Redux DevTools** (`src/devtools/redux-devtools.ts`) | Unsubscribe + nullify on disconnect |
| **React hook** (`src/react/index.ts`) | `useSyncExternalStore` handles subscribe/unsubscribe lifecycle |
| **Vue hook** (`src/vue/index.ts`) | `onScopeDispose(unsub)` ensures cleanup |

---

## Test Coverage Gaps for Cleanup Paths

The test suite covers core destroy paths well. Notable gaps:

| Gap | Priority |
|------|----------|
| No test for `withWatch` subscription failure + retry | High (matches finding #2) |
| No test verifying `window.removeEventListener` balance in storage adapter | Medium |
| No test for bucket adapter destroy during async init (between guards) | Medium |
| No large-scale create/destroy stress test (1000+ instances) | Low |
| No test for `previous()` when `source.subscribe()` throws | Low |

---

## Summary

Resource lifecycle is in **good condition**. The codebase follows consistent patterns:
`try/finally` in destroy methods, `isDestroyed` guards, proper event listener removal,
and lazy allocation. The five findings are hardening improvements, not active bugs in
current usage. The highest-value fix is #2 (`withWatch` retry), which could silently
break watchers if a subscription error occurs.

### Recommendation for next focus area

Given that **data integrity**, **error handling**, **API design**, and now **resource
lifecycle** have all been audited, the next most impactful area to invest in is:

**Performance & benchmarking** — the library has strong performance-critical architecture
(MemoryStateImpl fast path, single-listener optimization, batch dedup), but:

- Only one benchmark file exists (`benchmarks/internal.bench.ts`)
- No CI-enforced performance regression detection
- The `select()` overhead item (2025-03-27 #8) remains open
- Computed multi-listener scaling is unverified
- No benchmarks for adapter read/write hot paths or collection mutation throughput

A performance audit would validate existing optimizations, identify new opportunities,
and establish baselines to prevent regressions.
