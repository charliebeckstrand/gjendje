---
'gjendje': patch
---

**Data integrity fixes (2025-03-27)** — prevents data loss and corruption across persistent adapters:

### Critical fix

- **Storage write failure no longer silently diverges state** — when `storage.setItem()` throws (quota exceeded, SecurityError, etc.), subscribers are no longer notified with a value that was never persisted. `set()` and `reset()` now abort cleanly: no subscriber notification, no `onChange` callback, no `lastValue` update. The `onError` and `onQuotaExceeded` callbacks still fire for observability. Subsequent writes succeed normally once storage is available.

### High priority fix

- **Versioned envelope false-positive detection** — user data shaped like `{ v: <integer>, data: <any>, ...extraKeys }` was silently unwrapped as a versioned envelope, losing all properties except `data`. The envelope detector now requires exactly 2 keys (`v` and `data`), matching only real envelopes produced by `wrapForStorage()`.

### Medium priority fixes

- **SSR hydration respects explicit set-to-default** — hydration no longer overwrites when the user calls `set()` with a value equal to the default before hydration completes. A `hasUserWrite` flag tracks any explicit `set()`/`reset()` call, preventing the false-negative from `shallowEqual(currentValue, default)`.

- **Migration failure data backup** — when migration or validation fails and the default value is returned, the original raw data is automatically backed up to `{key}:__gjendje_backup` in storage. The backup is write-once (preserves the earliest original data) and survives subsequent writes, allowing recovery if the migration bug is later fixed.
