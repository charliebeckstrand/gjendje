---
"gjendje": patch
---

Optimize batch queue, collection operations, and computed/select allocation; fix watcher error isolation and history phantom entries.

**Performance:** Batch scaling +51% (Array+WeakMap queue replaces Set+copy flush), collection.add +63% (concat vs spread), collection.update-one +137% (direct get/set vs function updater), computed chain depth-25 +11% (inline createListeners/createLazyDestroyed), effect trigger +14%.

**Correctness:** notifyWatchers uses safeCall to prevent one throwing watcher from silencing others or desynchronizing watchPrev. withHistory uses onChange instead of intercept to avoid phantom history entries when isEqual rejects a no-op write.
