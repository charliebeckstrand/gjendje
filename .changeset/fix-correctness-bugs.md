---
'gjendje': patch
---

### Bug fixes

- **Interceptor rejection on non-memory scopes**: `StateImpl.set()`, `reset()`, and `mutate()` now correctly skip the update when an interceptor returns `undefined` or a `Promise`. Previously these invalid returns were mapped to the current value and the caller continued with a spurious storage write and change notification. This now matches `MemoryStateImpl`'s behavior of silently ignoring the update.

- **`readonly()` now shadows `mutate()`**: The `readonly()` wrapper previously left `mutate` accessible, allowing untyped JavaScript callers to bypass read-only protection via in-place mutation. `mutate` is now `undefined` on readonly wrappers, consistent with `set`, `reset`, `patch`, `intercept`, and `onChange`.

- **`createMemoryAdapter` listener snapshot**: The SSR fallback memory adapter now snapshots listeners before iterating during notification, consistent with all other notification paths. Previously it iterated the live `Set`, which could skip listeners if one unsubscribed another during notification.

- **`withHistory` undo/redo stack integrity**: `navigate()` no longer modifies the undo/redo stacks when the underlying `set()` is a no-op (e.g., due to `isEqual` returning `true` or an interceptor rejecting the change). Previously the stacks were mutated unconditionally, causing history corruption when interceptors or equality checks prevented the state change.
