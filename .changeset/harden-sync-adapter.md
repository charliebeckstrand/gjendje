---
"gjendje": patch
---

Harden sync adapter error handling

The cross-tab BroadcastChannel sync adapter (`withSync`) now handles all failure paths gracefully instead of crashing or silently swallowing errors:

- **BroadcastChannel constructor**: Wrapped in try-catch — if creation fails (e.g. sandboxed iframes, restricted contexts), a `SyncError` is reported via `onError` and the state continues without cross-tab sync.
- **`postMessage()`**: Wrapped in try-catch — broadcast failures no longer crash `set()`. The local value is still updated; only the cross-tab broadcast is skipped with error reporting.
- **`onSync` config callback**: Now wrapped with `safeCallConfig()` — a throwing `onSync` handler no longer crashes sync message processing, matching the isolation pattern used for all other config callbacks.
- **`channel.close()`**: Wrapped in try-catch in `destroy()` — a failing close no longer prevents `adapter.destroy()` from running.
