---
'gjendje': patch
---

Add extended internal benchmarks for select vs computed, readonly overhead, registry lookup at scale, and persistence round-trip performance.

Optimize readonly() to true zero-cost via Object.create() prototype delegation, reducing get/peek overhead from ~37% to ~0% vs direct access.
