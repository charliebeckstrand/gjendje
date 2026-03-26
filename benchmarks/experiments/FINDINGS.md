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

**Result:** BREAKTHROUGH — standalone MemoryStateImpl (no inheritance).
- **Constructor (registry=false):** Standalone 13.5M vs current 9.4M ops/s — **44-50% faster**.
  The `super()` call + wasted `_adapter`/`_s` property writes are pure overhead.
- **End-to-end with registry:** Standalone ~6.7M vs current ~3.5M ops/s — **~1.9x faster**.
- **Hot-path get/set:** No difference (<5%) — `_c` indirection doesn't matter post-creation.
- **MemoryCore shape (class vs literal):** No difference (2-7%). Not worth changing.
- **Property count:** No difference. V8 handles 6-10 own properties equally well.
- **scopedKey strategies:** All within 1-7%. Template literals already fast.
- **Conclusion:** Make MemoryStateImpl a standalone class implementing StateInstance directly
  (no `extends StateImpl`). Eliminates super() + 2 wasted property writes.
  CAUTION: MemoryStateImpl is very touchy per user — needs extremely careful A/B benchmarking.

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

**Result:** NO HOT-PATH BREAKTHROUGH. Mixed findings:
- **get/set throughput:** All approaches within 1-11%. Object.create is actually fastest
  for mixed get+set at depth 3 (17.91M vs 16.11M flat copy).
- **Creation cost:** Mixin/mutate is **7-13x faster** than Object.create for enhancer
  wrapping (2.73M vs 398K at depth 1). Flat copy is even slower than Object.create.
- **Realistic use (create+10 gets+destroy):** Mixin 5-13x faster than Object.create.
- **Conclusion:** Object.create is correct for hot-path performance. But mixin/mutate
  could dramatically speed up creation-heavy patterns like `collection()` factory.
  Worth investigating as a targeted change for collection, not a general rewrite.

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

**Result:** POTENTIAL WINS in mutation throughput, but dominated by `set()` pipeline:
- **add() at size 100:** In-place push is **2.28x faster** than `collection.add()` (164K vs 72K)
- **update({one}) at size 100:** In-place Object.assign is **2.91x faster** (213K vs 73K)
- **Batched adds (10 items, size 100):** In-place is **2.41x faster** than `add(...items)`
- **Watch diffing (1 key, size 10):** Flat-array+bitmask is **1.45x faster** than Map iteration;
  at 3 keys it's **2.11x faster** for size 10
- **Watch end-to-end (size 1000):** Current collection.watch() is actually **2.13x faster**
  than naive in-place — early-exit logic works well at scale
- **Root cause:** The dominant cost is the `set()` pipeline (interceptors, onChange, notify),
  not the array operations themselves. In-place mutation bypasses `set()` entirely.
- **Conclusion:** In-place mutations would be faster but break the reactive contract
  (subscribers wouldn't fire). The real win is combining with mixin/mutate from the
  enhancer findings (Priority 5) to reduce collection creation overhead. Watch diffing
  with flat-array+bitmask is worth investigating for collections with watched keys.

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

### Priority 1: Standalone MemoryStateImpl (No Inheritance)
- **Impact:** 44-50% faster construction, ~1.9x faster end-to-end lifecycle
- **Risk:** HIGH — user warned MemoryStateImpl is "very touchy"
- **Effort:** Medium (rewrite class, remove extends StateImpl, duplicate needed methods)
- **File:** `src/core.ts`
- **Steps:**
  1. Create standalone `MemoryStateImpl` class implementing `StateInstance<T>` directly
  2. Remove `extends StateImpl<T>` and the `super()` call
  3. Remove `_adapter`, `_s`, `_rKey` etc. — only keep what MemoryStateImpl actually uses
  4. Keep all existing method implementations (get/set/subscribe/etc.) exactly as-is
  5. Run FULL A/B bench suite (not just lifecycle) — verify zero regression on get/set/notify
  6. Run full test suite
  7. Be prepared to revert if any hot-path regression appears

### Priority 2: Trust-the-Cache Storage Adapter
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

### Priority 3: Batch Hybrid Approach (If Warranted)
- Research a way to get batch improvement WITHOUT non-batch regression
- Possible approach: export `isBatching()` from batch.ts, use wrapper only in batching path
- Needs careful design to avoid making the API more complex

### Priority 4: Array Listeners (createListeners only)
- Replace Set with Array in `src/listeners.ts` `createListeners()`
- Do NOT change MemoryStateImpl
- Run A/B bench focused on computed chains and storage adapter patterns

### Priority 5: Mixin/Mutate for Collection Factory
- Enhancer chain benchmarks showed mixin/mutate is **7-13x faster** than Object.create
  for creation cost. Object.create is still fastest for hot-path get/set.
- `collection()` is creation-heavy (wraps with multiple enhancer layers) and showed
  138K ops/s create+destroy in internal benchmarks — significantly slower than plain state.
- Investigate replacing Object.create with mixin/mutate specifically in the collection
  factory path. Do NOT change the general enhancer pattern.
- **File to change:** `src/collection.ts`
- Run `npx tsx benchmarks/internal.bench.ts --compare lifecycle` to verify

### Priority 6: Other Phase 2 Winners
- Implement any remaining phase 2 findings that show >20% improvement
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
