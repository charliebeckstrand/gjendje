---
"gjendje": patch
---

### Bug fixes

- **Custom serializer now runs migration chain**: Previously, using a custom `serialize` option caused the migration pipeline (`version` + `migrate`) to be silently skipped. Custom serializers now correctly unwrap versioned envelopes, run migrations, and validate — matching the behavior of the default JSON path.

- **Notification snapshot safety in `computed` and `select`**: Listener sets are now snapshotted before iteration during notifications. This prevents edge cases where subscribing or unsubscribing inside a notification callback could cause double-firing or skipped listeners in the same cycle.

- **Watcher notification snapshot safety**: `notifyWatchers` (used by `watch()`, `withWatch()`, and `collection.watch()`) now snapshots the watcher Map and listener Sets before iterating, preventing watchers registered during a notification from firing in the same cycle.

- **Batch flush errors routed through `onError`**: Errors thrown during batch flush notifications are now reported through the global `onError` pipeline via `reportError()`, consistent with how listener errors are handled elsewhere in the library.

### Internal improvements

- `select.subscribe()` now returns a shared `NOOP` function when the instance is destroyed, matching `computed` behavior and avoiding unnecessary allocations.
- URL adapter cache key now reads `window.location.search` directly after `pushState`/`replaceState` instead of manually constructing the search string, eliminating potential format mismatches.
