---
'gjendje': patch
---

Fix "Module not found: Can't resolve 'async_hooks'" error in client bundles by breaking the static import chain from core.ts to the server adapter. The server adapter now self-registers when imported, so `node:async_hooks` is only included when server features are actually used. Added a new `gjendje/server` entry point for server-only imports (`withServerSession`, `createServerAdapter`).
