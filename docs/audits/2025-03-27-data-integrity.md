# Data Integrity Audit — 2025-03-27

Focused audit on data loss and data corruption paths across all adapters, the persistence pipeline, and the SSR hydration flow.

## Findings

### 1. CRITICAL — Silent write failure causes state/storage divergence

- [x] **Patched**

**Files:** `src/adapters/storage.ts`, `src/adapters/url.ts`, `src/core.ts`

All persistent adapters (storage, URL, bucket via delegation) silently swallowed write failures in `write()`. The adapter's `set()` always updated `lastNotifiedValue` and queued a notification regardless of write success. This caused:

- Subscribers received a value that was never persisted
- `get()` returned the old value (from storage) immediately after a "successful" `set()`
- Data silently lost on page reload

**Fix:** `write()` now re-throws `StorageWriteError` after logging/reporting. The error propagates through the adapter chain (storage → bucket → sync → StateImpl). `StateImpl.set()` and `reset()` catch `StorageWriteError` and return without updating `s.lastValue` or firing `_notifyChange`. No subscribers are notified. The state remains consistent.

---

### 2. HIGH — Versioned envelope false-positive corrupts user data

- [x] **Patched**

**File:** `src/persist.ts`

`isVersionedValue()` matched any object containing `v` (safe integer) and `data` properties, regardless of other keys. User data shaped like `{ v: 1, data: {...}, status: "ok" }` was silently unwrapped — all properties except `data` were lost.

**Fix:** Added strict key-count check: `Object.keys(value).length === 2`. Since `wrapForStorage()` only creates `{ v, data }` objects, real envelopes always have exactly 2 keys. User data with additional properties is no longer misidentified.

---

### 3. MEDIUM — SSR hydration overwrites explicit set-to-default

- [x] **Patched**

**File:** `src/core.ts`

The hydration callback used `shallowEqual(currentValue, options.default)` to detect pre-hydration user writes. If the user explicitly called `set()` with a value equal to the default, hydration thought no write occurred and overwrote with the stored value.

**Fix:** Added `hasUserWrite` flag to `MutableState`. Set to `true` in `StateImpl.set()` and `reset()` on successful writes. Hydration callback checks this flag first, skipping hydration if any user write occurred regardless of value.

---

### 4. MEDIUM — Migration failure + validation = permanent data loss

- [x] **Patched**

**Files:** `src/persist.ts`, `src/adapters/storage.ts`

When a migration step threw and the partially-migrated value failed validation, the default was returned. The original stored data remained in storage but would be permanently overwritten on the next `set()` call.

**Fix:** Added `onFallback` callback parameter to `readAndMigrate()`. On validation failure or parse/migration error, the storage adapter backs up the original raw data to `{key}:__gjendje_backup`. Backup is write-once — subsequent failures don't overwrite the earliest backup. Also applies to custom serializer validation failures.
