---
'gjendje': patch
---

### Bug fix: cross-tab sync double-notification

When `sync: true` was enabled on a `local` or `bucket` scope, the receiving tab was notified **twice** for a single change from another tab. The BroadcastChannel message handler called `adapter.set()` (first notification), and then the originating tab's `localStorage.setItem()` triggered a `storage` event that fired a second notification with a re-parsed (new reference) value — causing spurious re-renders in React.

**Fix:** The storage adapter's `onStorageEvent` handler now compares `event.newValue` against the cached raw string before invalidating. When the BroadcastChannel handler has already processed the update and populated the cache, the redundant storage event is skipped. `storage.clear()` events (where `event.key === null`) always invalidate as before.
