---
"gjendje": patch
---

### Error handling hardening

Comprehensive hardening of error handling across the library:

- **Interceptor safety**: Interceptors returning `undefined` or `Promise` now abort the set/reset with a warning instead of silently corrupting state
- **InterceptorError class**: New `InterceptorError` error type — interceptor failures are now wrapped in a typed error for `instanceof` discrimination in `onError` handlers
- **Listener error routing**: `safeCall` and `safeCallChange` now route errors through the global `onError` pipeline (via `reportError`) when key/scope context is available, not just `console.error`
- **Serialization guardrails**: Circular references, BigInt, and other non-serializable values now produce descriptive `StorageWriteError` messages through the `onError` pipeline
- **Destroy robustness**: All `destroy()`/`stop()` methods (10 total across core, computed, effect, collection, history, storage, URL, sync, bucket adapters) now use `try/finally` to guarantee critical cleanup even if an earlier step throws
- **Post-destroy notification leak**: `computed` no longer notifies subscribers or recomputes after `destroy()` — `markDirty` and `notifyListeners` bail immediately when destroyed
- **Version validation**: The `version` option now throws immediately for invalid values (0, negative, NaN, Infinity, non-integer). Stored version envelopes higher than the current version now log a warning instead of silently skipping migrations
- **Config validation**: `configure()` now validates `maxKeys`, `logLevel`, and `scope` — invalid values throw immediately instead of silently corrupting behavior
- **History validation**: `maxSize` in `withHistory()` now throws for invalid values (0, negative, non-integer)
- **Bucket validation**: `bucket.name` must be a non-empty string
- **ComputedError class**: New `ComputedError` error type — derivation function failures are now wrapped in a typed error, reported through `onError`, and rethrown. The dirty flag is preserved so the next `get()` retries.
- **Computed listener routing**: Computed subscriber errors now route through the global `onError` pipeline (previously only `console.error`)
- **DepValues export**: The `DepValues` utility type is now exported from the package for typing `computed`/`effect` callbacks
- **JSDoc `@throws` annotations**: Added to `state()`, `configure()`, `withHistory()`, `computed()`, and `collection()`
- **Computed cleanup**: Unsubscriber array is cleared on destroy to allow GC of dependency closures
