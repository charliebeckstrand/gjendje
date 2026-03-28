---
"gjendje": patch
---

### Resource lifecycle hardening

Fixed 5 issues from the resource lifecycle audit:

- **Bucket adapter**: added `isDestroyed` guard before `delegateUnsub` assignment to prevent subscription leaks if an `await` is introduced between the existing guard and the assignment
- **`withWatch` enhancer**: removed the `initialized` flag that prevented retry after a failed `subscribe()` call — now checks only `unsubscribe`, allowing recovery
- **`effect()`**: cleared the `unsubscribers` array after `stop()` to release closure references immediately (matching `computed`'s existing cleanup pattern)
- **`collection`**: nullified `watchers`, `unsubscribe`, and `prevItems` in `destroy()` to release references sooner
- **`previous()`**: wrapped `source.subscribe()` in try/catch with `listeners.clear()` cleanup, throwing a descriptive error on failure

### `select()` optimization

Rewrote `select()` as a standalone lightweight implementation instead of wrapping `computed()`. Eliminates array allocation for dependencies, the dependency loop, and `Promise.all` overhead for async checks. Benchmarks show **~13% faster** operations for single-dependency projections. The API and behavior are unchanged.