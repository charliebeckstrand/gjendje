---
"gjendje": patch
---

Improve internal performance across instance lifecycle, storage reads, and collection creation

- **Standalone `MemoryStateImpl`**: Removed `StateImpl` inheritance so memory-scoped state (the default) no longer pays the cost of a `super()` call and 7 unused property writes per construction. A/B benchmarks show **+15-17% faster create/destroy** and **+8% faster full lifecycle** with zero hot-path regressions.

- **Trust-the-cache storage adapter**: Added a `cacheValid` fast-path flag to `read()` in the storage adapter, skipping `storage.getItem()` entirely when the in-memory cache is known-valid. Cache is invalidated on cross-tab storage events, parse errors, and destroy. **~4.5x faster repeated storage reads.**

- **Mixin/mutate collection factory**: Replaced `Object.create(base)` with direct property assignment onto the base instance in `collection()`. Since the base is created internally and never exposed, this safely eliminates the prototype chain overhead. **~5x faster collection lifecycle** (124K to 625K ops/s).
