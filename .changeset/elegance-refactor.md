---
'gjendje': patch
---

Codebase elegance refactor — cache computed settled promise (was allocating Promise.all on every access), reuse shared RESOLVED promise in storage/URL adapters and SSR, extract navigate helper in withHistory to remove undo/redo duplication, short-circuit collection watcher notification on length change, simplify snapshot/devtools/sync adapter code, remove redundant assignments and unnecessary .bind() calls. No behavioral or performance changes.
