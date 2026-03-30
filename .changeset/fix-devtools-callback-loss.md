---
'gjendje': patch
---

### Bug fix: DevTools callback loss after `configure()`

Calling `configure({ onChange: fn })` after `enableDevTools()` silently overwrote the DevTools wrapper, causing DevTools to stop dispatching to Redux DevTools and the logger. Calling `disableDevTools()` afterwards restored stale pre-DevTools callbacks, permanently losing the user's handler.

**Fix:** DevTools now uses an internal **config hook registry** instead of replacing user callbacks via `configure()`. Hooks registered by `enableDevTools()` run alongside — never replace — user-provided callbacks. `configure()` only affects the user's callbacks, and `disableDevTools()` only removes the DevTools hooks. The two systems are fully independent, so they can be set up in any order without conflict.

**New internal API** (not publicly exported): `addConfigHook(event, fn)` / `removeConfigHook(event, fn)` in `config.ts`. The `fireConfigCallback()` helper in `listeners.ts` invokes the user callback first, then any registered hooks.
