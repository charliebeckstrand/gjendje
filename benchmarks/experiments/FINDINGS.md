# Performance Optimization Findings

> Recorded 2026-03-26. Comprehensive findings from two phases of optimization research.

---

## Phase 1: Confirmed Results (Benchmarked)

### Already Implemented (committed)
- **select.ts rewrite:** Delegated to `computed()`, removed ~130 lines of duplicated code. -1.87 KB raw ESM.
- **PERSISTENT_SCOPES shared:** Eliminated duplicate Set in core.ts.
- **resolveAdapter narrowed:** Removed dead `memory`/`render` cases.
- **computed.ts cleanup:** Replaced `TO_VOID` with existing `NOOP`.

### Batch Dedup: Wrapper Object (NOT Map)

**Experiment results:**
- **Wrapper object `{ fn, gen }` approach:** +27-40% batch throughput, BUT -5-12% regression on non-batched writes (computed chains, effects, interceptors). The `.fn` property indirection on the non-batching hot path causes V8 IC misses.
- **Function-with-`_gen`-property approach:** Similar batch gains, but same non-batch regressions. V8 treats functions-with-extra-properties poorly.
- **Map (replacing WeakMap) approach:** **Catastrophic regression** of -35% to -46% on batch throughput (confirmed with fresh back-to-back A/B). Map is dramatically slower than WeakMap for function-keyed dedup. Do not use.
- **Conclusion:** The wrapper object approach is a batch-only win that trades non-batch regression. Only worth implementing if the codebase is batch-heavy. Consider implementing a **hybrid approach** that uses wrapper objects only when batching depth > 0, falling back to direct calls otherwise. Needs more research.

### Trust-the-Cache in Storage Adapter

**Finding:** 4.5x faster storage reads by skipping `storage.getItem()` when cache is valid.

**Current code (src/adapters/storage.ts:29-61):**
```ts
function read(): T {
    const raw = storage.getItem(key)  // Always hits storage
    if (raw === cachedRaw) return cachedValue as T  // Then checks cache
    // ... parse
}
```

**Proposed change:**
```ts
// Add a `cacheValid` boolean flag, set to true after write/read, false on storage events
function read(): T {
    if (cacheValid && cachedValue !== undefined) return cachedValue
    const raw = storage.getItem(key)
    // ... rest unchanged
}
```

**Risk:** Low. Cache is already invalidated on:
- `write()` (updates cachedRaw/cachedValue)
- `onStorageEvent()` (sets cachedRaw = undefined)
- Parse errors (sets cachedRaw = undefined)

**Status:** NOT YET IMPLEMENTED.

### Array vs Set for Listeners

**Finding:** +38% improvement on subscribe/unsub churn pattern with Array vs Set.

**Risk:** HIGH for MemoryStateImpl. User explicitly warned this area is "very touchy."
The singleListener fast path already in MemoryStateImpl showed no additional gains.

**Recommendation:**
- Consider implementing ONLY in `createListeners()` (used by non-memory adapters)
- Do NOT touch MemoryStateImpl listener handling without extensive benchmarking
- The churn pattern (+38%) is mainly beneficial for computed chains, not core state

**Status:** NOT YET IMPLEMENTED.

---

## Phase 2: Research Agent Findings (Benchmarks Written, Not All Verified)

### 1. Registry & Lifecycle Optimization
**File:** `benchmarks/experiments/lifecycle-experiment.bench.ts`
**Agent status:** 35 messages, actively writing enhanced benchmarks

**Hypotheses under test:**
- Flat instance layout (no `_c` indirection) — eliminates one pointer hop on `get()`
- MemoryCore as class (V8 monomorphism) vs object literal
- Standalone class (no StateImpl inheritance) for memory scope
- Registry isolation benchmarks with `registry: false`

**Run with:** `npx tsx benchmarks/experiments/lifecycle-experiment.bench.ts`

### 2. Config Callback Hot-Path
**File:** `benchmarks/experiments/config-hotpath.bench.ts` (24KB)
**Agent status:** 21 messages, benchmark written

**Strategies:**
1. Bitfield flags (`HAS_ON_CHANGE | HAS_IS_EQUAL`)
2. Null function (pre-fill absent callbacks with no-op)
3. Single `_hasMiddleware` boolean to skip all checks
4. Config snapshot into local fields at construction time

**Result:** NO BREAKTHROUGH. All strategies within 1-2% of current optional chaining.
V8 optimizes `?.()` extremely well — bitfield, null-fn, has-middleware, and snapshot
approaches all tied. No measurable overhead to eliminate.

### 3. Enhancer Prototype Chain
**File:** `benchmarks/experiments/enhancer-chain.bench.ts` (25KB)
**Agent status:** 15 messages, benchmark written

**Strategies:**
1. Object.create (current) vs flat copy vs mixin
2. Method access overhead through prototype chain depth
3. Property shadowing patterns

**Run with:** `npx tsx benchmarks/experiments/enhancer-chain.bench.ts`

### 4. Persist Pipeline Fast Path
**File:** `benchmarks/experiments/persist-pipeline.bench.ts` (20KB)
**Agent status:** 17 messages, benchmark written

**Strategies:**
1. Full pipeline vs fast-path (JSON.parse only, no version/migrate/validate)
2. Compile-time specialization based on which features are enabled
3. Read cost breakdown: JSON.parse → isVersionedValue → migration → validate → mergeKeys
4. Write cost: JSON.stringify → wrapForStorage overhead
5. Skip pickKeys/mergeKeys when no `persist` option

**Result:** NO BREAKTHROUGH. The pipeline is already near-optimal. `readAndMigrate`
is only 1-3% slower than raw `JSON.parse`. All checks (`isVersionedValue`, `pickKeys`,
`mergeKeys`) exit in <0.0001ms when unused. `JSON.parse`/`JSON.stringify` dominate cost
at 5.6x slower than all pipeline checks combined. Specialized readers show only 3-5%
improvement — not worth the complexity.

### 5. Collection Mutation Overhead
**File:** `benchmarks/experiments/collection-mutations.bench.ts` (19KB)
**Agent status:** 20 messages, benchmark written

**Strategies:**
1. Spread (current) vs mutate-in-place for push/splice/etc.
2. Structural sharing for large arrays
3. Batch mutation amortization

**Run with:** `npx tsx benchmarks/experiments/collection-mutations.bench.ts`

### 6. Object Pooling for Instances
**File:** `benchmarks/experiments/allocation-pooling.bench.ts`

**Result:** NO BREAKTHROUGH for hot-path. Mixed results overall:
- **get+set throughput:** Direct-fields, MemoryCore, and current all within 1-2% — MemoryCore indirection is free
- **set+notify:** Current MemoryStateImpl is **fastest** (14.92M ops/s) — no change needed
- **MemoryCore allocation:** Property access (._c.current) is essentially free vs direct fields
- **Object pooling:** 11-16% slower than direct construction — overhead not worth it
- **String interning:** Actually **slower** (12.4M cache hit vs 18.4M fresh) — do not intern
- **GC stress:** Direct-fields 19x faster than current, but registry is the bottleneck, not class shape
- **Conclusion:** MemoryCore pattern is already optimal. Registry lookup dominates lifecycle cost.

---

## Implementation Plan (Next Session)

### Priority 1: Trust-the-Cache Storage Adapter
- **Impact:** 4.5x read improvement
- **Risk:** Low
- **Effort:** Small (one file, ~10 line change)
- **File:** `src/adapters/storage.ts`
- **Steps:**
  1. Add `cacheValid` boolean flag
  2. Short-circuit `read()` when flag is true
  3. Set flag false on storage events and errors
  4. Run A/B bench to confirm
  5. Run full test suite

### Priority 2: Run Phase 2 Benchmarks
- Run each of the 6 experiment files listed above
- Record results
- Identify any new breakthroughs (>20% improvement)
- Delete experiment files after recording results

### Priority 3: Batch Hybrid Approach (If Warranted)
- Research a way to get batch improvement WITHOUT non-batch regression
- Possible approach: export `isBatching()` from batch.ts, use wrapper only in batching path
- Needs careful design to avoid making the API more complex

### Priority 4: Array Listeners (createListeners only)
- Replace Set with Array in `src/listeners.ts` `createListeners()`
- Do NOT change MemoryStateImpl
- Run A/B bench focused on computed chains and storage adapter patterns

### Priority 5: Phase 2 Winners
- Implement any phase 2 findings that show >20% improvement
- Each change gets its own A/B bench cycle
- Especially careful with anything touching MemoryStateImpl

---

## Disproven Hypotheses

| Hypothesis | Result | Notes |
|---|---|---|
| Map replacing WeakMap in batch | -35% to -46% regression | Map is dramatically slower than WeakMap for function keys |
| Computed version-counting | -33% to -143% | Current dirty-flag approach is optimal |
| Lazy subscription in computed | +12% marginal | Not worth the complexity |
| Early bailout in computed | Net negative | Added overhead exceeds savings |
| singleListener in MemoryStateImpl | No gain | Already fast enough |
| Removing safeCall try/catch | +8% at 10 subs only | Not worth losing error isolation |
