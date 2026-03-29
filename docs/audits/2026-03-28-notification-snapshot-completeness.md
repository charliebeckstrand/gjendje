# Audit: Notification Snapshot Completeness — 2026-03-28

**Library version:** 1.3.4
**Scope:** Comprehensive review of all notification/iteration paths for snapshot
safety. Verified every location where a Set or Map of listeners/handlers is iterated
during notifications.

**Prior audits reviewed:** All files in `docs/audits/`. Snapshot safety was previously
applied to computed, select, watchers, and collection — but the core state notification
paths were not checked.

---

## Findings

### Medium

#### 1. `MemoryStateImpl` subscriber notification iterates live Set

**File:** `src/core.ts:671–675`

The `notifyFn` closure created in `MemoryStateImpl.subscribe()` iterated the `listeners`
Set directly without snapshotting:

```typescript
c.notifyFn = () => {
    for (const l of listeners) {
        safeCall(l, c.current, key, scope)
    }
}
```

This is the hot path for all memory-scoped state (the default scope). If a subscriber
calls `subscribe()` or unsubscribes during notification, the live Set iteration can
skip or double-fire listeners.

**Impact:** Subscribe/unsubscribe during notification can corrupt the iteration for
the most commonly used state scope.

- [x] Snapshot `listeners` Set before iterating in `notifyFn`

---

#### 2. `createListeners.notify()` iterates live Set

**File:** `src/listeners.ts:80–83`

The shared `createListeners` utility (used by storage, URL, bucket, sync, and server
adapters, plus `previous()`) iterated its listener Set without snapshotting:

```typescript
notify(value: T): void {
    for (const listener of set) {
        safeCall(listener, value, key, scope)
    }
}
```

For persistent state (`local`, `session`, `url`, `bucket`), `StateImpl.subscribe()`
delegates directly to the adapter's `listeners.subscribe()`. So end-user subscribers
are stored in this Set and affected by the live iteration.

**Impact:** Same as Finding #1 but for all persistent-scoped state.

- [x] Snapshot `set` before iterating in `createListeners.notify()`

---

#### 3. `onChange` handler iteration in `StateImpl` and `MemoryStateImpl`

**File:** `src/core.ts:247–251, 645–649, 746–750`

Three locations iterate the `changeHandlers` Set without snapshotting. `onChange` is
a public API — users register handlers via `instance.onChange(fn)`.

- `StateImpl._notifyChange` (line 247) — persistent state
- `MemoryStateImpl.set` (line 645) — memory state set path
- `MemoryStateImpl.reset` (line 746) — memory state reset path

**Impact:** An `onChange` handler that registers or unregisters other handlers during
notification can corrupt the iteration.

- [x] Snapshot `changeHandlers` Set before iterating in all three locations

---

## Areas Verified Clean (Snapshot Status)

| Location | File | Status |
|----------|------|--------|
| `computed` listener notification | `src/computed.ts:138` | Snapshotted (prior audit) |
| `select` listener notification | `src/select.ts:121` | Snapshotted (prior audit) |
| `notifyWatchers` Map + Sets | `src/watchers.ts:52` | Snapshotted (prior audit) |
| Collection watcher 3 paths | `src/collection.ts:119,151,185` | Snapshotted (prior audit) |
| `MemoryStateImpl` subscriber `notifyFn` | `src/core.ts:673` | **Fixed this audit** |
| `createListeners.notify` | `src/listeners.ts:82` | **Fixed this audit** |
| `StateImpl._notifyChange` changeHandlers | `src/core.ts:249` | **Fixed this audit** |
| `MemoryStateImpl` set changeHandlers | `src/core.ts:649` | **Fixed this audit** |
| `MemoryStateImpl` reset changeHandlers | `src/core.ts:757` | **Fixed this audit** |
| `computed` singleListener fast path | `src/computed.ts:130` | N/A (single listener, no iteration) |
| `select` singleListener fast path | `src/select.ts:113` | N/A (single listener, no iteration) |

---

## Summary

Three medium-severity findings, all in the core notification paths that were missed by
prior audits focused on derived state (computed, select, watchers, collection). With
these fixes, **every notification iteration path in the library now snapshots its
listener/handler collection before iterating**, providing consistent protection against
subscribe/unsubscribe during notification.

Benchmarks confirmed no significant regression from the `Array.from` snapshots.
