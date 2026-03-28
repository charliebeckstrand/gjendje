# API Design Audit — 2026-03-28

**Library version:** 1.3.2
**Scope:** API design hardening — configuration validation, error type completeness, type exports, computed error handling, JSDoc annotations

Prior audit: `2026-03-28-error-handling.md`.

---

## Findings & Fixes

### 1. CRITICAL — `configure()` accepts invalid `logLevel` silently

- [x] PATCHED

**File:** `src/config.ts`

Passing an invalid `logLevel` (e.g., `'verbose'`, `'info'`) was silently accepted. The `log()` function's `LOG_PRIORITY` lookup returned `undefined`, causing the comparison `undefined >= 0` to be `false`, which silently disabled all logging. Users had no way to diagnose why their warnings disappeared.

**Fix:** Added `VALID_LOG_LEVELS` Set and validation in `configure()` that throws immediately for unrecognized values.

---

### 2. CRITICAL — `configure()` accepts invalid `scope` silently

- [x] PATCHED

**File:** `src/config.ts`

Passing an invalid global `scope` (e.g., `'redis'`, `'indexeddb'`) was accepted at configure-time but crashed on the first `state()` call via the `never` exhaustive check in `resolveAdapter`. The error message was confusing ("Unknown scope: redis") and pointed to the wrong call site.

**Fix:** Added `VALID_SCOPES` Set and validation in `configure()` that throws immediately with a descriptive message listing valid scopes.

---

### 3. HIGH — `computed` derivation errors crash batch flush unguarded

- [x] PATCHED

**Files:** `src/computed.ts`, `src/errors.ts`

A `recompute()` call had no try/catch. If the user-supplied derivation function threw, the error escaped through `notifyListeners → recompute` into the batch flush loop, potentially leaving downstream subscribers unnotified. There was no typed error class for this failure mode.

**Fix:** Added `ComputedError` class to `src/errors.ts`. Wrapped `cached = fn(depValues)` in try/catch that constructs a `ComputedError` (preserving the original error as `cause`), reports it via `reportError`, and rethrows. On error, `isDirty` remains `true` (so the next `get()` retries) and `cached` retains the last successful value.

---

### 4. HIGH — Computed subscriber errors not routed through `onError`

- [x] PATCHED

**File:** `src/computed.ts`

The `safeCall` invocations in `notifyListeners` passed no key/scope context. Computed subscriber errors were caught and logged to `console.error` but never reached the global `onError` pipeline.

**Fix:** Both `safeCall` calls now pass `instanceKey` and `'memory'` as context, routing errors through `reportError`.

---

### 5. MEDIUM — `DepValues` utility type not exported

- [x] PATCHED

**File:** `src/index.ts`

Users of `computed()` and `effect()` who wanted to type their callback handlers separately (e.g., `const handler: (values: DepValues<typeof deps>) => TResult`) had to re-derive the type manually because `DepValues` was not in the public API.

**Fix:** Added `DepValues` to the type exports from `src/types.js` in `src/index.ts`.

---

### 6. MEDIUM — `ComputedError` not in public API

- [x] PATCHED

**File:** `src/index.ts`

**Fix:** Added `ComputedError` to the error exports alongside the other 7 error classes.

---

### 7. LOW — No `@throws` annotations on public APIs

- [x] PATCHED

**Files:** `src/shortcuts.ts`, `src/config.ts`, `src/enhancers/history.ts`, `src/computed.ts`, `src/collection.ts`

No public API had `@throws` JSDoc annotations. Users had no way to know from documentation which calls could throw, what types they threw, or under what conditions.

**Fix:** Added `@throws` annotations to `state()`, `configure()`, `withHistory()`, `computed()`, and `collection()`.

---

## Test Coverage

Added `__tests__/api-design-audit.test.ts` with 32 tests covering:
- `configure()` logLevel validation (6 tests: 4 valid + 2 invalid)
- `configure()` scope validation (8 tests: 6 valid + 2 invalid)
- `ComputedError` on creation-time throw, post-dependency-change throw, cause wrapping, key propagation, `onError` reporting
- Computed subscriber error routing through `onError`
- `ComputedError` export and instanceof verification
- `DepValues` export verification

All 793 tests pass (761 existing + 32 new). Zero regressions.
