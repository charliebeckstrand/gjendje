# Audit: Edge Cases & Correctness — 2026-03-28

**Library version:** 1.3.4
**Scope:** Subscription edge cases, notification correctness, serialization pipeline gaps,
defensive coding, and test coverage for under-tested paths.

**Prior audits reviewed:** All files in `docs/audits/`. All prior items are resolved except the
`select()` overhead cross-reference in `2026-03-28-error-handling.md` (already patched in
`2025-03-27.md` #8 — stale cross-reference only).

---

## Findings

### High

#### 1. Custom serializer bypasses migration chain

**File:** `src/adapters/storage.ts:54–79`

When a custom `serialize` option is provided, the `parse()` function calls `serialize.parse(raw)`
directly and only runs `validate`. The migration chain (`readAndMigrate()`) is never called. A
user who configures both `serialize` (custom serializer) and `migrate` (migration functions) will
have migrations silently skipped on reads from storage.

```typescript
function parse(raw: string): T {
    if (serialize) {
        const value = serialize.parse(raw)
        // Only validate runs — migrate, version envelope unwrapping, all skipped
        if (options.validate && !options.validate(value)) { ... }
        return value as T  // ← No migration
    }
    return readAndMigrate(raw, options, key, options.scope, () => backupRawData(raw))
}
```

The comment on line 58 says "validate and migrate are still honoured" but only validate is
actually called in this branch.

**Impact:** Users combining custom serializers with versioned migrations get no migration on
read. Data written with an older version is served as-is, potentially with an outdated shape.

**Fix:** After custom serializer parse + validate, run the migration chain if `options.migrate`
is defined and `options.version` is set. This requires the custom serializer to preserve or
handle the version envelope, or the migration to be run on the unwrapped data.

- [ ] Route custom serializer path through migration chain when `migrate` is configured

---

#### 2. Computed/select `singleListener` fast path stale after unsubscribe-during-notify

**File:** `src/computed.ts:130–138`, `src/select.ts:111–119`

Both `computed` and `select` use a `singleListener` optimization: when exactly one listener
exists, they call it directly without iterating the Set. However, if that listener unsubscribes
itself during its own notification callback, the Set becomes empty but `singleListener` still
holds the reference for the duration of that notification:

```typescript
const notifyListeners = () => {
    if (isDestroyed) return
    const prev = cached
    const value = recompute()
    if (value === prev) return

    if (singleListener !== undefined) {
        safeCall(singleListener, value, instanceKey, 'memory')
        return  // ← Exits immediately, no issue for single listener
    }

    for (const l of listenerSet) {
        safeCall(l, value, instanceKey, 'memory')
    }
}
```

This is actually **safe** in the single-listener case because `safeCall` wraps in try/catch
and the function returns immediately after. However, the `subscribe()` return function updates
`singleListener` via `listenerCount` tracking:

```typescript
return () => {
    listenerSet.delete(listener)
    listenerCount--
    if (listenerCount === 1) {
        singleListener = listenerSet.values().next().value
    } else {
        singleListener = undefined
    }
}
```

If listener A unsubscribes during notification and `listenerCount` drops to 1, `singleListener`
is set to the next remaining listener. If listener A then does something that triggers another
notification in the same flush cycle, the new `singleListener` is called — this is correct.

**But:** if a listener subscribes a *new* listener during notification and then unsubscribes
itself, `listenerCount` stays at 1, and `singleListener` points to the new listener. The new
listener was already added to `listenerSet` and may have been iterated in the `for...of` loop
(if we were in the multi-listener path). This can cause **double notification** of the new
listener in the same cycle.

**Impact:** Edge case — only triggers when subscribe + unsubscribe happen inside a notification
callback with exactly the right listener count transitions. Low probability but violates
at-most-once notification guarantee.

- [ ] Add `isNotifying` guard or snapshot listener list before iterating in computed/select

---

### Medium

#### 3. `notifyWatchers` iterates live Map — subscribe during notify can fire new watcher immediately

**File:** `src/watchers.ts:47–57`

When `notifyWatchers` iterates the watchers Map with `for...of`, a listener that calls
`watch()` during notification adds a new entry to the Map. Per ES6 Map iteration semantics,
newly added keys **are** visited if they haven't been reached yet. This means a watcher
registered during notification can fire in the same notification cycle it was created:

```typescript
for (const [watchKey, listeners] of watchers) {
    // If a listener calls watch('newKey', fn), and 'newKey' sorts after
    // current position in insertion order, fn will fire in this same loop
    const prevVal = prevObj?.[watchKey]
    const nextVal = nextObj?.[watchKey]
    if (!Object.is(prevVal, nextVal)) {
        for (const listener of listeners) {
            safeCall(listener, nextVal)
        }
    }
}
```

Similarly, adding a listener to an **existing** key's Set during iteration of that Set will
cause the new listener to fire in the same `for (const listener of listeners)` loop.

**Impact:** Unexpected double-firing of newly registered watchers. Affects both `withWatch`
enhancer and `StateImpl.watch()` / `collection.watch()`.

- [ ] Snapshot watcher entries before iterating in `notifyWatchers`

---

#### 4. `batch()` flush notification errors only logged, not routed through `onError`

**File:** `src/batch.ts:99–107`

During batch flush, notification errors are caught and logged to `console.error` but never
routed through the global `onError` pipeline:

```typescript
try {
    if (fn) fn()
} catch (err) {
    console.error('[gjendje] Notification threw:', err)
}
```

This is inconsistent with the rest of the library where listener/subscriber errors are routed
through `reportError()` (e.g., `safeCall` in `listeners.ts:17–22`, effect callbacks in
`effect.ts:92–94`).

The same issue exists in the best-effort delivery path at line 81.

**Impact:** Users relying on centralized `onError` monitoring miss batch notification failures.

- [ ] Route batch flush notification errors through `reportError`

---

#### 5. Stale `select()` cross-reference in error-handling audit

**File:** `docs/audits/2026-03-28-error-handling.md:188`

The error-handling audit lists `select()` overhead (#8) as unchecked `[ ]`, but the original
audit (`2025-03-27.md:71`) has it marked `[x]` as patched with the standalone implementation.

- [ ] Update stale cross-reference to `[x]`

---

### Low

#### 6. `computed`/`select` subscribe returns different no-op functions when destroyed

**File:** `src/computed.ts:236`, `src/select.ts:170`

When `isDestroyed` is true, `computed.subscribe()` returns the shared `NOOP` constant, but
`select.subscribe()` returns a new `() => {}` arrow function each time. This is functionally
equivalent but inconsistent, and `select` creates unnecessary garbage:

```typescript
// computed.ts:236
if (isDestroyed) return NOOP

// select.ts:170
if (isDestroyed) return () => {}
```

- [ ] Use shared `NOOP` in `select.subscribe()` for consistency

---

#### 7. URL adapter `cachedSearch` format inconsistency

**File:** `src/adapters/url.ts:91`

The `write()` function sets `cachedSearch = search ? '?' + search : ''`, prepending `?` to
match `window.location.search` format. But `read()` compares against `window.location.search`
directly (which includes `?`). If `URLSearchParams.toString()` ever produces a string where
the parameter ordering differs from the browser's internal representation, the cache will miss
unnecessarily. Currently safe because the library only appends/modifies one parameter, but
fragile if the URL has other parameters added by external code between read and write.

- [ ] Consider reading `window.location.search` after `pushState/replaceState` for cache

---

## Areas Verified Clean

| Area | Notes |
|------|-------|
| **Batch deduplication** (`batch.ts`) | `lastGen` WeakMap + generation counter correctly prevents duplicate notifications within a flush cycle |
| **Diamond dependency** (`computed.ts:128`) | `value === prev` identity check correctly deduplicates in batched context |
| **Set iteration safety** (`listeners.ts:81`) | Unsubscribe during `for...of` on Set is safe per ES6 spec — deleted items are skipped |
| **Effect stop idempotency** (`effect.ts:111`) | `isStopped` guard prevents double cleanup |
| **Previous value tracking** (`previous.ts`) | Correct under batch semantics — single notification per batch ensures no missed values |
| **Interceptor rejection** (`core.ts`) | Both StateImpl and MemoryStateImpl correctly abort set/reset when interceptor returns undefined/Promise |
| **Storage adapter cross-tab sync** (`storage.ts:188`) | Single-threaded JS ensures no true race between `onStorageEvent` and `write` |
| **Sync adapter destroy guard** (`sync.ts:40`) | `isDestroyed` check prevents processing of messages queued before `channel.close()` |

---

## Test Coverage Gaps

| Gap | Priority | Related Finding |
|------|----------|----------------|
| Subscribe + unsubscribe during computed notification | High | Finding #2 |
| Watch registration during `notifyWatchers` iteration | High | Finding #3 |
| Custom serializer + migrate + version combined | High | Finding #1 |
| Batch flush error routing to `onError` | Medium | Finding #4 |
| Computed with 0 dependencies | Low | — |
| `select` destroyed subscribe returns non-NOOP | Low | Finding #6 |

---

## Summary

The codebase is in **strong condition** after 5 prior audits. No critical bugs were found.
The highest-impact finding is #1 (custom serializer bypasses migrations), which is a real
functional gap — users combining `serialize` + `migrate` get silently broken migrations.
Findings #2 and #3 are subscribe-during-notify edge cases that violate at-most-once
guarantees in narrow scenarios. Finding #4 is a consistency gap in error reporting.

### Recommendation for next work

1. **Fix finding #1** — custom serializer migration bypass (highest user-facing impact)
2. **Fix finding #3** — snapshot watcher entries before iterating (defensive, prevents subtle bugs)
3. **Fix finding #4** — batch flush error routing (consistency)
4. **Add tests** for findings #1–#4
5. **Fix findings #5–#7** — minor cleanup
