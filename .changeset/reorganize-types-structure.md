---
'gjendje': patch
---

Reorganize types into a dedicated `types/` directory:

- Moved `src/types.ts` → `src/types/index.ts`
- Moved `src/adapters/async-hooks.d.ts` → `src/types/async-hooks.d.ts`
- Updated all import paths across the codebase

This is a purely structural refactor with no behavioral changes.
