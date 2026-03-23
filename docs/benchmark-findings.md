# Benchmark Findings

Collected during the audit/cleanup work on the `claude/audit-code-cleanup-mMqTq` branch (March 2026).

## How to run

```bash
# Full suite
npx tsx benchmarks/internal.bench.ts

# Specific suites
npx tsx benchmarks/internal.bench.ts middleware
npx tsx benchmarks/internal.bench.ts lifecycle batch-scaling effect
```

## Key finding: MemoryStateImpl is load-bearing

During the cleanup pass we flattened `MemoryStateImpl` into `StateImpl` (`c5b7007`) to reduce code duplication. Benchmarks immediately showed:

- **~60% regression** in instance lifecycle throughput (create + destroy)
- **~30% regression** in batch/effect performance

Root cause: `MemoryStateImpl` stores values directly on the instance and skips the adapter `get()`/`set()` pipeline. Memory-scoped state is the default and most common scope, so this fast path dominates real-world performance.

The class was restored in `a36a4d8` and documented as performance-critical in both `CLAUDE.md` and inline comments.

**Takeaway:** Never merge `MemoryStateImpl` into `StateImpl`. Always benchmark before and after touching this class.

## Middleware overhead (interceptors & hooks)

Measured on the current branch. Numbers are representative; expect ~10% variance between runs due to V8 JIT warmup and GC pressure.

| Scenario | Throughput | Slowdown vs bare write |
|---|---|---|
| write (no middleware) | ~15-17M ops/s | baseline |
| write (1 use hook) | ~13M ops/s | ~1.2x |
| write (1 interceptor) | ~13-16M ops/s | ~1.1-1.2x |
| write (5 interceptors) | ~10M ops/s | ~1.4x |
| write (5 interceptors + 5 hooks) | ~8.5M ops/s | ~1.8x |

The 1-interceptor case shows high variance (12.6M to 16.5M across runs on the same code). This is V8 JIT noise, not a code difference — we confirmed identical numbers between `main` and the cleanup branch.

**Takeaway:** Middleware overhead scales linearly and predictably. A single interceptor adds ~10-20% overhead; 10 combined interceptors+hooks ~1.8x. This is acceptable for the functionality provided.

## Lifecycle, effects, and batch scaling

| Scenario | Throughput | Notes |
|---|---|---|
| create + destroy (render) | ~3.4M ops/s | Hot path for component mounts |
| create + subscribe + write + destroy | ~2.0M ops/s | Full lifecycle |
| create + destroy collection | ~116K ops/s | 29x slower — collections are heavyweight |
| effect trigger (no cleanup) | ~10.8M ops/s | |
| effect trigger (with cleanup) | ~10.2M ops/s | Cleanup adds ~6% |
| effect trigger (5 deps, change 1) | ~9.5M ops/s | |
| batch (10 states) | ~1.6M ops/s | |
| batch (50 states) | ~378K ops/s | ~4x slower than 10 |
| batch (200 states) | ~100K ops/s | ~16x slower than 10 |

**Takeaway:** Batch scaling is super-linear (~O(n log n) or worse). Applications batching 200+ state updates in a single `batch()` call should consider splitting into smaller batches if performance is a concern.

## Run-to-run variance

We ran the middleware benchmark 3 times on both `main` and the cleanup branch. Key observations:

- **Bare writes** vary ~15-18M ops/s across runs (~15% spread)
- **1 interceptor** varies ~12.6-16.5M ops/s (~25% spread)
- The variance is **not** caused by code changes — `main` and the branch show the same spread
- Cause: V8 JIT compilation decisions, GC timing, and CPU frequency scaling

**Takeaway:** Don't draw conclusions from single benchmark runs. Run at least 3 times and compare ranges. A difference under ~15% between two code versions is likely noise.

## Actionable items

1. **Collection lifecycle is 29x slower than simple state** — worth investigating if there are low-hanging optimizations in collection create/destroy.
2. **Batch scaling is super-linear** — consider documenting a recommended batch size ceiling, or investigate whether the notification/effect propagation can be made more efficient for large batches.
3. **Benchmark variance is high** — consider adding a `--runs N` flag to the benchmark harness that averages across multiple runs and reports min/max/stddev to make comparisons more reliable.
