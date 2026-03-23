---
'gjendje': patch
---

Optimize state creation performance: inline resolveKeyAndScope to eliminate intermediate object allocation, early-exit memory fast path before SSR/sync computation, consolidate registry lookups, and build MemoryStateImpl mutable state in a single allocation. Add `trackMemory: false` config option to skip registry for memory-scoped state, bringing creation throughput from ~1M to ~6M ops/s (within 2x of Zustand).
