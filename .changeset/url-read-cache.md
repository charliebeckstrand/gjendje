---
'gjendje': patch
---

Add read cache to URL adapter — caches parsed value keyed on location.search string, skipping URLSearchParams construction and re-parsing when the URL hasn't changed. Also pre-populates cache after writes. Repeated reads 16x faster, many-reads-per-write 26x faster.
