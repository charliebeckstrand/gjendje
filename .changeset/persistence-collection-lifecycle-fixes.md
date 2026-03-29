---
"gjendje": patch
---

### Bug fixes

- **Storage adapter now notifies on cross-tab `localStorage.clear()`**: When another tab calls `localStorage.clear()`, the `StorageEvent` fires with `event.key === null`. The storage adapter previously ignored these events, leaving subscribers stale. It now correctly invalidates the cache and notifies listeners, matching the behavior for individual key changes.

- **Collection watcher notification snapshot safety**: The collection module's internal watcher notification now snapshots both the watcher Map entries and listener Sets before iterating, matching the pattern used in `notifyWatchers()`. This prevents subscribe/unsubscribe during notification from skipping or double-firing listeners.

- **`previous()` destroy cleanup guarantee**: The `previous()` instance's `destroy()` method now wraps cleanup in try/finally, ensuring `listeners.clear()` and `lazyDestroyed.resolve()` execute even if the source's unsubscribe function throws.

- **`destroyAll()` ordering fix**: `destroyAll()` now clears the registry before destroying instances (instead of after). This prevents instances created during destroy notifications (e.g., via `onDestroy` callbacks) from being silently removed by the final `registry.clear()`.

- **Bucket adapter cross-tab event forwarding**: The bucket adapter's fallback delegate (used when the Storage Buckets API is unavailable) now subscribes to storage events immediately during synchronous initialization. Previously, the subscription was only set up at the end of the async initialization block, which was never reached on the fallback path — breaking cross-tab reactivity for bucket-scoped state on most browsers.

- **Complete notification snapshot safety**: All remaining notification iteration paths now snapshot their listener/handler collections before iterating. This includes `MemoryStateImpl` subscriber notifications (the hot path for memory-scoped state), `createListeners.notify()` (used by all persistent adapter types), and `onChange` handler iteration in both `StateImpl` and `MemoryStateImpl`. Previously, only computed, select, watchers, and collection had snapshot protection — the core state notification paths were unprotected.
