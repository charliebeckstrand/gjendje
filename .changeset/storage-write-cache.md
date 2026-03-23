---
'gjendje': patch
---

Pre-populate storage adapter read cache after writes instead of invalidating it. Eliminates redundant getItem() + JSON.parse() on read-after-write paths (~41% faster single read-after-write, ~92% faster many-reads-per-write).
