# Audit: Persistence, Collection & Lifecycle — 2026-03-28

**Library version:** 1.3.4
**Scope:** Storage event handling, cross-tab sync, collection watcher iteration,
destroy lifecycle cleanup guarantees, registry mutation during destruction.

**Prior audits reviewed:** All files in `docs/audits/`. Areas covered: data integrity,
error handling, edge cases & correctness, framework bindings & DevTools.

---

## Findings

### Medium

#### 1. Storage adapter doesn't notify when another tab clears storage

**File:** `src/adapters/storage.ts:189–200`

When another tab calls `localStorage.clear()`, a `StorageEvent` fires with `event.key === null`.
The adapter's event handler exits early because `event.key !== key` is true:

```typescript
function onStorageEvent(event: StorageEvent): void {
    if (event.storageArea !== storage || event.key !== key) return
    //                                   ^^^^^^^^^^^^^^^^ exits for clear()

    cachedRaw = undefined
    cachedValue = undefined
    cacheValid = false

    lastNotifiedValue = read()

    notify(notifyListeners)
}
```

The cache is never invalidated and subscribers are never notified. The next `get()` call
reads the correct default (storage is empty), but reactive subscribers miss the transition.

**Impact:** Loss of reactivity when storage is fully cleared in another tab (e.g., cross-tab
logout, cache clearing). Subscribers stay stale until the next direct `set()` call.

- [ ] Handle `event.key === null` (storage clear) in storage event handler

---

#### 2. Collection watcher notification iterates live Map/Set without snapshotting

**File:** `src/collection.ts:117–182`

Three locations iterate the watcher Map and listener Sets without snapshotting. If a listener
calls `.watch()` or unsubscribes during notification, it mutates the live data structures:

**Location 1 — length changed (lines 119–122):**
```typescript
for (const [, listeners] of w) {       // ← Live Map
    for (const listener of listeners) { // ← Live Set
        safeCall(listener, next)
    }
}
```

**Location 2 — non-object items (lines 147–150):** Same pattern.

**Location 3 — specific keys changed (lines 173–180):**
```typescript
for (const watchKey of changedKeys) {
    const listeners = w.get(watchKey)
    if (listeners) {
        for (const listener of listeners) { // ← Live Set
            safeCall(listener, next)
        }
    }
}
```

Contrast with `notifyWatchers()` in `src/watchers.ts:41–69` which correctly snapshots both
the Map entries and listener Sets with `Array.from()`.

**Impact:** A listener that unsubscribes itself during notification can cause other listeners
to be skipped. A listener that adds a new watcher during notification can cause that watcher
to fire in the same cycle.

- [ ] Snapshot watcher Map and listener Sets in collection watch notification

---

### Low

#### 3. `previous()` destroy doesn't use try/finally for cleanup guarantee

**File:** `src/previous.ts:123–133`

```typescript
destroy() {
    if (isDestroyed) return
    isDestroyed = true
    unsubscribe?.()        // ← If this throws...
    listeners.clear()      // ← ...these are skipped
    lazyDestroyed.resolve()
}
```

Unlike `StateImpl.destroy()` which wraps cleanup in try/finally, `previous()` leaves
`listeners.clear()` and `lazyDestroyed.resolve()` unprotected. If `unsubscribe()` throws,
the `destroyed` promise never resolves.

- [ ] Wrap `previous()` cleanup in try/finally

---

#### 4. `destroyAll()` can clear instances created during the destroy loop

**File:** `src/registry.ts:97–108`

```typescript
export function destroyAll(): void {
    const instances = [...registry.values()]

    for (const instance of instances) {
        if (!instance.isDestroyed) {
            instance.destroy()  // ← Could trigger listeners that create new instances
        }
    }

    registry.clear()  // ← Also clears any instances created during the loop
}
```

If a destroy notification triggers creation of new state instances (e.g., via `onDestroy`
callback or a subscriber), those new instances are registered to the Map during the loop
but then removed by `registry.clear()`, leaving them orphaned (alive but unregistered).

- [ ] Clear registry before destroying instances, or re-check after loop

---

## Areas Verified Clean

| Area | Notes |
|------|-------|
| **Effect cleanup idempotency** (`effect.ts:110`) | `isStopped` guard prevents double cleanup |
| **Sync adapter destroy guard** (`sync.ts:40`) | `isDestroyed` prevents processing messages after close |
| **Bucket delegate swap** (`bucket.ts:184`) | New delegate subscription after swap, no gap |
| **Computed/select destroyed subscribe** | Both return shared NOOP, consistent |
| **Storage event listener cleanup** (`storage.ts:230`) | `removeEventListener` in finally block always executes |
| **URL adapter popstate cleanup** (`url.ts:145`) | `removeEventListener` in finally block always executes |
| **Effect unsubscriber cleanup** (`effect.ts:120`) | Array cleared after loop completes |
| **Batch generation deduplication** (`batch.ts`) | WeakMap + generation counter correctly prevents double notification |

---

## Test Coverage Gaps

| Gap | Priority | Related Finding |
|------|----------|----------------|
| Storage clear from another tab (`event.key === null`) | Medium | Finding #1 |
| Collection watcher subscribe/unsubscribe during notification | Medium | Finding #2 |
| `previous()` destroy when unsubscribe throws | Low | Finding #3 |
| `destroyAll()` with destroy triggering new state creation | Low | Finding #4 |

---

## Summary

Two medium-priority findings and two low-priority defensive improvements:

1. **Storage clear event** — cross-tab `localStorage.clear()` doesn't notify subscribers
2. **Collection watcher iteration** — live Map/Set iteration without snapshotting
3. **`previous()` cleanup** — missing try/finally protection
4. **`destroyAll()` ordering** — instances created during destroy loop get orphaned

Findings #1 and #2 are the actionable correctness issues. #3 and #4 are defensive hardening.
