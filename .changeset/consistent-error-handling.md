---
"gjendje": patch
---

Improve error handling consistency across the codebase

**Global config callback isolation:** All global config callbacks (`onIntercept`, `onChange`, `onReset`, `onDestroy`) are now wrapped in try-catch via a new `safeCallConfig` helper. Previously, a throwing callback would crash the `set()`, `reset()`, or `destroy()` operation. Now errors are caught and logged to `console.error`, matching the existing isolation behavior of listeners and change handlers.

**Interceptor error reporting:** When an interceptor throws, the error is now reported through the `onError` global callback via `reportError()` before being re-thrown. This makes interceptor failures observable through the same error pipeline used by storage, migration, and validation errors — without changing the existing throw-to-reject behavior.

**Bucket adapter error reporting:** The Storage Buckets API initialization catch block previously swallowed all errors silently. It now logs a warning and reports the error through `onError`, so users know when their bucket storage failed to initialize and the fallback adapter is being used.
