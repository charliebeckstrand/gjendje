---
'gjendje': patch
---

Reorganized internal source files into a `src/utilities/` folder:

- Moved `snapshot()` from `src/devtools.ts` to `src/snapshot.ts` to eliminate the conflict between the `src/devtools.ts` file and the `src/devtools/` folder
- Moved `is-writable.ts`, `listeners.ts`, `ssr.ts`, `watchers.ts` into `src/utilities/`
- Renamed `utils.ts` to `utilities/common.ts` for clarity

No public API changes — all exports remain the same.
