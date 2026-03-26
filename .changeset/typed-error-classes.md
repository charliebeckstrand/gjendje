---
"gjendje": minor
---

Add typed error classes for structured error handling

Previously, all errors flowing through the `onError` callback had `error: unknown`, making it impossible to programmatically distinguish between storage failures, validation rejections, migration errors, and sync issues.

**New error classes** (all extend `GjendjeError` which extends `Error`):

- **`StorageReadError`** — emitted when reading from storage fails (corrupt data, parse errors)
- **`StorageWriteError`** — emitted on write failures, with an `isQuotaError` flag for quota-specific handling
- **`MigrationError`** — emitted when a schema migration function throws, includes `fromVersion` and `toVersion`
- **`ValidationError`** — emitted when `validate()` rejects a stored value, includes `rejectedValue`
- **`SyncError`** — emitted when a cross-tab BroadcastChannel sync fails
- **`HydrationError`** — emitted when SSR hydration can't read the real storage value

All error classes carry `key`, `scope`, and `cause` (the original error), enabling precise error discrimination:

```ts
import { configure, StorageWriteError, MigrationError } from 'gjendje'

configure({
  onError({ error }) {
    if (error instanceof StorageWriteError && error.isQuotaError) {
      // clear old data to free space
    } else if (error instanceof MigrationError) {
      // log migration failure with version context
      console.error(`Migration v${error.fromVersion}→v${error.toVersion} failed`)
    }
  },
})
```
