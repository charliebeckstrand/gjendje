---
"gjendje": patch
---

### Error handling hardening

Comprehensive hardening of error handling across the library:

- **Interceptor safety**: Interceptors returning `undefined` or `Promise` now abort the set/reset with a warning instead of silently corrupting state
- **Serialization guardrails**: Circular references, BigInt, and other non-serializable values now produce descriptive `StorageWriteError` messages through the `onError` pipeline
- **Destroy robustness**: All `destroy()`/`stop()` methods (9 total across core, computed, effect, collection, history, storage, URL, sync adapters) now use `try/finally` to guarantee critical cleanup (event listener removal, destroyed promise resolution, adapter teardown) even if an earlier step throws
- **Post-destroy notification leak**: `computed` no longer notifies subscribers or recomputes after `destroy()` — `markDirty` and `notifyListeners` bail immediately when destroyed
- **Version validation**: The `version` option now throws immediately for invalid values (0, negative, NaN, Infinity, non-integer). Stored version envelopes higher than the current version now log a warning instead of silently skipping migrations
- **Computed cleanup**: Unsubscriber array is cleared on destroy to allow GC of dependency closures
