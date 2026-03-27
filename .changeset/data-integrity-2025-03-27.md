---
'gjendje': patch
---

**Data integrity fixes** — prevents data loss and corruption across persistent adapters:

### Critical fixes

- **Storage write failure no longer silently diverges state** — when `storage.setItem()` throws (quota exceeded, SecurityError, etc.), subscribers are no longer notified with a value that was never persisted. `set()` and `reset()` now abort cleanly: no subscriber notification, no `onChange` callback, no `lastValue` update. The `onError` and `onQuotaExceeded` callbacks still fire for observability. Subsequent writes succeed normally once storage is available.

- **Partial migration no longer poisons the version envelope** — when a migration step throws mid-chain (e.g., v1→v2 succeeds but v2→v3 throws), the partially migrated data was previously returned as the state value. On the next `set()`, it would be stamped with the current version, permanently recording half-migrated data as fully migrated. `runMigrations()` now throws on step failure, causing the pipeline to fall back to `defaultValue` and backup the original raw data.

### High priority fixes

- **Versioned envelope false-positive detection** — user data shaped like `{ v: <integer>, data: <any>, ...extraKeys }` was silently unwrapped as a versioned envelope, losing all properties except `data`. The envelope detector now requires exactly 2 keys (`v` and `data`), matching only real envelopes produced by `wrapForStorage()`.

- **Bucket adapter no longer emits duplicate notifications during init** — when a user wrote to fallback storage during async bucket initialization, subscribers were notified twice with the same value (once from the outer `set()` and once from the post-init check). The post-init notification is now skipped when the value was already delivered by a user write.

### Medium priority fixes

- **SSR hydration respects explicit set-to-default** — hydration no longer overwrites when the user calls `set()` with a value equal to the default before hydration completes. A `hasUserWrite` flag tracks any explicit `set()`/`reset()` call, preventing the false-negative from `shallowEqual(currentValue, default)`.

- **Migration failure data backup** — when migration or validation fails and the default value is returned, the original raw data is automatically backed up to `{key}:__gjendje_backup` in storage. The backup is write-once (preserves the earliest original data) and survives subsequent writes, allowing recovery if the migration bug is later fixed.

- **`shallowEqual` now handles Set, Map, Date, and RegExp** — previously, `Object.keys()` returned `[]` for Set and Map instances, causing two Sets/Maps with different content to compare as "equal". This silently suppressed updates when used with `isEqual: shallowEqual`. Sets compare by size + elements, Maps by size + entries, Dates by timestamp, RegExps by string representation.

- **Batch flush limit now delivers remaining notifications** — when the flush loop hits 100 iterations (infinite loop guard), remaining notifications now receive one final best-effort delivery pass before being discarded, ensuring subscribers see the final state.

- **Backup failure is no longer silent** — when the data backup mechanism fails (e.g., storage full), an error is now logged and `onError` fires so programmatic handlers can react.
