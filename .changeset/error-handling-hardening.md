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
- **Config validation**: `maxKeys` in `configure()` now throws for invalid values (0, negative, non-integer)
- **History validation**: `maxSize` in `withHistory()` now throws for invalid values (0, negative, non-integer)
- **Bucket validation**: `bucket.name` must be a non-empty string
- **Computed cleanup**: Unsubscriber array is cleared on destroy to allow GC of dependency closures
