---
'gjendje': patch
---

Make bucket adapter synchronously initialize with fallback storage so `get()` and `set()` work immediately without awaiting `ready`. The `ready` promise still resolves when the real Storage Bucket opens, but users no longer need to await it for basic operations.
