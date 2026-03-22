---
'gjendje': minor
---

Add `pick()` method to state instances for reading a single property from object state. Instead of `store.get().name`, use `store.pick('name')` for a concise, type-safe read of individual keys.
