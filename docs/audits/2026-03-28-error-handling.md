# Error Handling Audit — 2026-03-28

**Library version:** 1.3.2
**Scope:** Comprehensive error handling hardening — interceptors, serialization, destroy robustness, post-destroy leaks, version validation

Prior audits reviewed: `2025-03-27.md`, `2025-03-27-data-integrity.md`, `2026-03-27-data-integrity.md`.

---

## Findings & Fixes

### 1. CRITICAL — Interceptor returning `undefined` silently corrupts state

- [x] PATCHED

**Files:** `src/core.ts` (StateImpl._applyInterceptors, MemoryStateImpl.set, MemoryStateImpl.reset)

An interceptor returning `undefined` was silently accepted as the new state value. State became `undefined` with no error or warning, causing downstream failures in subscribers, computed values, and persistence.

**Fix:** After the interceptor chain completes, check if the final value is `undefined`. If so, log a warning and abort the set/reset entirely — the state remains unchanged. Applied consistently across all three interceptor paths (StateImpl method, MemoryStateImpl.set inline, MemoryStateImpl.reset inline).

---

### 2. CRITICAL — Async interceptor silently turns state into a Promise object

- [x] PATCHED

**Files:** `src/core.ts` (same three locations as above)

An interceptor returning `Promise.resolve(value)` was accepted as the state value. The state became a Promise object instead of the resolved value. Subscribers received a Promise, computed values derived nonsense results.

**Fix:** After the interceptor chain completes, check if the final value is `instanceof Promise`. If so, log a warning and abort the set/reset entirely.

---

### 3. HIGH — Serialization failures (circular refs, BigInt) bypass error pipeline

- [x] PATCHED

**File:** `src/adapters/storage.ts` (write function)

When `JSON.stringify()` threw on unserializable values (circular references, BigInt, etc.), the error was caught by the outer write error handler but lacked a descriptive message. Users had no way to diagnose why their state wasn't persisting.

**Fix:** Added an inner try/catch around serialization that wraps the error in a `StorageWriteError` with a descriptive message identifying common causes (circular references, BigInt, non-serializable types). The error is logged and reported through `reportError` before being rethrown.

---

### 4. HIGH — `destroy()` methods lack `try/finally` — partial failures leak resources

- [x] PATCHED

**Files:** `src/core.ts` (StateImpl.destroy, MemoryStateImpl.destroy), `src/computed.ts`, `src/effect.ts`, `src/collection.ts`, `src/enhancers/history.ts`, `src/adapters/storage.ts`, `src/adapters/url.ts`, `src/adapters/sync.ts`

All `destroy()` methods executed cleanup steps sequentially with no error isolation. If an early step threw, later steps (event listener removal, destroyed promise resolution, base destroy delegation) were skipped, causing:
- Leaked `storage`/`popstate` event listeners
- Unresolved `destroyed` promises (code awaiting them would hang)
- Unregistered instances remaining in the registry
- Underlying adapters never cleaned up

**Fix:** Wrapped cleanup bodies in `try/finally` across all 9 destroy/stop methods. Critical invariants (destroyed promise resolution, event listener removal, base destroy delegation, adapter cleanup) are now in `finally` blocks and always execute.

---

### 5. HIGH — Computed notifies subscribers after `destroy()`

- [x] PATCHED

**File:** `src/computed.ts` (notifyListeners, markDirty)

When a dependency changed after `computed.destroy()` was called, any notification already queued in the batch system would still fire. The `markDirty` and `notifyListeners` closures were captured in dependency subscriptions before destroy, and batch-queued notifications executed after destroy cleared the subscriptions.

**Fix:** Added `if (isDestroyed) return` guards at the top of both `notifyListeners` and `markDirty`. Even if a notification was queued before destroy, it's suppressed on execution.

---

### 6. MEDIUM — Version envelope accepts absurdly high stored versions

- [x] PATCHED

**File:** `src/persist.ts` (readAndMigrate, runMigrations)

A manually tampered localStorage value like `{"v": 999999999, "data": {...}}` would pass `isVersionedValue()` (valid safe integer), skip all migrations (storedVersion > currentVersion), and return unvalidated data.

**Fix:** Added a guard in `readAndMigrate()` that detects when `storedVersion > currentVersion` and logs a warning. Also added a `toVersion < 0` check in `runMigrations()`. Data is returned as-is (not corrupted), but the warning surfaces the issue.

---

### 7. MEDIUM — No validation for `version` option

- [x] PATCHED

**File:** `src/core.ts` (createBase)

The `version` option accepted any number including 0, negative, NaN, Infinity, and floats. Invalid versions caused silent migration failures or version envelope corruption.

**Fix:** Added validation in `createBase()` that throws immediately if `version` is not a positive safe integer. Runs once at creation time, no hot-path cost.

---

### 8. LOW — Computed unsubscribers array not cleared on destroy

- [x] PATCHED

**File:** `src/computed.ts` (destroy)

After calling all unsubscriber functions, the array still held references to the closures. While not a functional bug (isDestroyed prevents re-use), it prevented GC of dependency subscription closures.

**Fix:** Added `unsubscribers.length = 0` after the unsubscription loop.

---

## Open Items from Prior Audits

### From 2025-03-27.md

- [ ] **#8 — `select()` overhead for single dependency** — Not addressed (low priority, performance acceptable)
- [ ] **#10 — StateImpl/MemoryStateImpl behavioral parity tests** — Not addressed this session

### Investigated but not actionable

- **Sync adapter state/storage divergence on remote write failure** — The sync adapter already catches `adapter.set()` failures and reports them via `SyncError`. The divergence is inherent to eventual consistency — without a conflict resolution protocol, last-write-wins is the correct behavior for a client-side library.

---

## Test Coverage

Added `__tests__/error-handling-audit.test.ts` with 32 tests covering:
- Interceptor undefined/Promise rejection (memory + persistent scope, set + reset)
- Serialization guardrails (circular refs, onError pipeline)
- Destroy robustness (all instance types, double-destroy safety)
- Post-destroy notification suppression (computed + effect)
- Version envelope bounds validation
- Version option validation (0, negative, float, NaN, Infinity)
- Storage adapter destroy cleanup
- Computed dependency cleanup on destroy

All 696 tests pass (664 existing + 32 new). Zero regressions.
