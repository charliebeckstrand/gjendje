---
'gjendje': patch
---

Extract try/catch from listener notification loops into a shared safeCall helper. Allows V8 to optimize the loop body independently and deduplicates three identical try/catch blocks across listeners.ts, core.ts, and adapters/memory.ts.
