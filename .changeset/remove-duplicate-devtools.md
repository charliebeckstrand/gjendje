---
'gjendje': patch
---

Moved `snapshot()` and `StateSnapshot` from `src/devtools.ts` to `src/snapshot.ts` to eliminate the conflict between the `src/devtools.ts` file and the `src/devtools/` folder. No public API changes — both are still exported from the main `gjendje` entry point.
