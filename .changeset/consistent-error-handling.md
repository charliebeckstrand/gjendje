---
"gjendje": patch
---

Improve error handling consistency and test coverage across the codebase

### Config callback isolation

All global config callbacks (`onIntercept`, `onChange`, `onReset`, `onDestroy`, `onSync`) are now wrapped in try-catch via a new `safeCallConfig` helper. Previously, a throwing callback would crash the `set()`, `reset()`, or `destroy()` operation. Now errors are caught and logged to `console.error`, matching the existing isolation behavior of listeners and change handlers.

### Interceptor error reporting

When an interceptor throws, the error is now reported through the `onError` global callback via `reportError()` before being re-thrown. This makes interceptor failures observable through the same error pipeline used by storage, migration, and validation errors — without changing the existing throw-to-reject behavior.

### Bucket adapter error reporting

The Storage Buckets API initialization catch block previously swallowed all errors silently. It now logs a warning and reports the error through `onError`, so users know when their bucket storage failed to initialize and the fallback adapter is being used.

### Sync adapter hardening

The cross-tab BroadcastChannel sync adapter (`withSync`) now handles all failure paths gracefully:

- **BroadcastChannel constructor**: Wrapped in try-catch — if creation fails (e.g. sandboxed iframes), a `SyncError` is reported via `onError` and the state continues without cross-tab sync.
- **`postMessage()`**: Broadcast failures no longer crash `set()`. The local value is still updated; only the cross-tab broadcast is skipped with error reporting.
- **`channel.close()`**: Wrapped in try-catch in `destroy()` — a failing close no longer prevents `adapter.destroy()` from running.

### Test coverage

Added 28 new tests covering previously untested paths:

- Config callback isolation (`onIntercept`, `onChange`, `onReset`, `onDestroy` throwing)
- Interceptor error reporting through `onError` pipeline
- Bucket adapter initialization failure reporting
- Sync adapter failure paths (constructor, postMessage, onSync, close)
- Custom serializer bypassing validation and migration (documenting intentional behavior)
- Collection persistence with validation, migration, and corrupted data
- URL adapter edge cases (parse errors, pushState failures, special characters, persist option)
