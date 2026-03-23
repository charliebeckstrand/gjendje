---
'gjendje': patch
---

Short-circuit Promise.all in computed() for memory-scoped deps — skip array allocation and promise wrapping when all deps return RESOLVED. Cache the settled getter to avoid allocating Promise.all + map + then on every access. Computed creation 12-30% faster, settled access 2.6x faster.
