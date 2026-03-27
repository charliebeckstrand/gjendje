# Data Integrity Audit — 2026-03-27

**Library version:** post-1.3.1
**Scope:** Data loss, corruption, and silent inconsistency

Prior audits reviewed before starting: `2025-03-27.md`, `2025-03-27-data-integrity.md`.
All critical/high issues from prior audits are resolved. Three medium items remain open (select overhead, shallowEqual type handling, StateImpl/MemoryStateImpl duplication).

---

## Findings

### 1. CRITICAL — Partial migration poisons version envelope, blocking future migrations

- [x] PATCHED

**File:** `src/persist.ts` (`runMigrations`)

When a migration step throws mid-chain (e.g., v1→v2 succeeds, v2→v3 throws), the function returned **partially migrated data**. On the next `set()`, `wrapForStorage()` stamped it with the current version number. This permanently recorded half-migrated data as fully migrated — subsequent reads skipped the missing steps entirely.

**Fix:** `runMigrations()` now throws `MigrationError` on step failure instead of returning partial data. The caller (`readAndMigrate`) catches this, falls back to `defaultValue`, and fires `onFallback()` which triggers a backup of the original raw data.

---

### 2. HIGH — Bucket adapter emits duplicate notification during init

- [x] PATCHED

**File:** `src/adapters/bucket.ts`

When a user wrote to fallback storage during async bucket initialization, the outer `set()` notified subscribers immediately. When init completed, `delegate.set(currentValue)` migrated the value to the bucket, and the post-init notification check fired a second notification with the same value. Side effects ran twice.

**Fix:** The post-init notification check now skips when `hadUserWrite` is true, since the outer `set()` already delivered that notification.

---

### 3. MEDIUM — `shallowEqual` false equality for Set/Map causes silent update suppression

- [x] PATCHED

**File:** `src/utils.ts` (`shallowEqual`)

`Object.keys()` returns `[]` for `Set` and `Map` instances. Two Sets or Maps with completely different content compared as "equal", silently dropping updates when used with `isEqual: shallowEqual` or in internal comparisons (bucket adapter, SSR hydration).

**Fix:** Added special-case handling for `Set` (compare size + elements), `Map` (compare size + entries), `Date` (compare timestamps), and `RegExp` (compare string representation).

**Note:** This was tracked in prior audit `2025-03-27.md` item #9 as a "false negative" issue. This audit elevates it because the Set/Map case causes **data loss** (silent update suppression), not just unnecessary re-renders.

---

### 4. MEDIUM — Batch flush drops notifications silently at MAX_FLUSH_ITERATIONS

- [x] PATCHED

**File:** `src/batch.ts` (`flush`)

When the flush loop hit 100 iterations (infinite loop guard), `queue = []` discarded all remaining notifications. Subscribers permanently missed updates.

**Fix:** Before clearing the queue, a best-effort delivery pass fires each remaining notification exactly once. Any notifications enqueued during this final pass are discarded to guarantee termination.

---

### 5. LOW — Storage adapter backup silently fails when storage is full

- [x] PATCHED

**File:** `src/adapters/storage.ts` (`backupRawData`)

The backup mechanism (added in prior audit fix) caught all errors silently. When storage was full — the most likely scenario triggering backup in the first place — the original data was permanently lost with no indication.

**Fix:** The catch block now logs an error message and fires `reportError()` so the `onError` callback can react (e.g., send data to a server).

---

## Investigated but not actionable

- **Collection mutation atomicity** — `add()`, `remove()`, `update()` do read-then-write. Verified safe because `get()` returns the latest value synchronously after `set()` (cache is updated inline).
- **URL adapter stale cache after external pushState** — `read()` compares `window.location.search` on every call, so reads are always fresh. Only proactive subscriber notification is missing, which is a browser platform limitation (popstate doesn't fire on pushState).
- **withHistory undo/redo through interceptors** — History records post-interceptor state values. Replaying through interceptors on undo is consistent with the library's design contract.
