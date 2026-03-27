---
"gjendje": patch
---

Improve error handling consistency and test coverage across the codebase

### Config callback isolation

All global config callbacks are now wrapped in try-catch via `safeCallConfig`. Previously, a throwing callback could crash the operation that triggered it. Now errors are caught and logged to `console.error`, matching the existing isolation behavior of listeners and change handlers.

Wrapped callbacks: `onIntercept`, `onChange`, `onReset`, `onDestroy`, `onSync`, `onExpire`, `onQuotaExceeded`, `onMigrate`, `onValidationFail`, `onError`, `onHydrate`, `onRegister`.

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

Additionally, `reportError()` itself is now hardened — if the user's `onError` callback throws, the error is caught and logged rather than crashing the operation.

### DevTools error isolation

The devtools orchestrator, logger, and Redux DevTools adapter now handle all failure paths gracefully:

- **Original config callbacks**: When devtools chains with a user's existing `onChange`/`onReset`/`onRegister`/`onDestroy` callback, a throwing callback no longer prevents devtools logging and Redux DevTools dispatch from firing for that event.
- **Custom logger/filter**: Throwing `logger` or `filter` functions in `LoggerOptions` no longer crash state operations.
- **Redux DevTools `send()`**: A misbehaving DevTools extension no longer crashes state operations.

### Test coverage

Added 44 new tests covering previously untested paths:

- Config callback isolation for all callbacks (`onIntercept`, `onChange`, `onReset`, `onDestroy`, `onValidationFail`, `onMigrate`, `onQuotaExceeded`, `onError`, `onRegister`)
- Interceptor error reporting through `onError` pipeline
- Bucket adapter initialization failure reporting
- Sync adapter failure paths (constructor, postMessage, onSync, close)
- Custom serializer bypassing validation and migration (documenting intentional behavior)
- Collection persistence with validation, migration, and corrupted data
- URL adapter edge cases (parse errors, pushState failures, special characters, persist option)
- DevTools error isolation (original callbacks, logger, filter, Redux DevTools send)
