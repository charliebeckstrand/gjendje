---
'gjendje': patch
---

Add extended internal benchmarks for select vs computed, readonly overhead, registry lookup at scale, and persistence round-trip performance.

Optimize readonly() to use bound method references, reducing get/peek overhead from ~37% to ~20% vs direct access.
