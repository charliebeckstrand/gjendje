---
'gjendje': patch
---

Add array overload to `pick()` — pass an array of keys to get an array of values back in the same order. Example: `store.pick(['name', 'age'])` returns `['Alice', 30]`.
