---
"gjendje": patch
---

### Bug fixes

- **`readonly()` now shadows `patch()`**: The readonly wrapper previously only shadowed `set`, `reset`, and `intercept`, leaving `patch()` accessible via the prototype chain. Untyped JavaScript callers could bypass the readonly contract by calling `.patch()`. The wrapper now shadows `patch` with `undefined`, matching the existing protection for other write methods.

- **DevTools time-travel error handling**: When restoring state via Redux DevTools time-travel (`JUMP_TO_STATE` / `JUMP_TO_ACTION`), if one instance's `set()` throws (e.g., interceptor rejection), the error is now caught and logged. Remaining instances continue to be updated, preventing partial state restoration that leaves DevTools and application state diverged.

- **React hook `useMemo` dependency fix**: The `useGjendje` hook no longer includes the `selector` function reference in the `useMemo` dependency array. Inline selectors (the common pattern) created a new reference every render, causing unnecessary `useMemo` re-computation. The return shape is now determined solely by the `writable` flag, which already accounts for selector presence.

### Documentation

- Added `@remarks` JSDoc to `enableDevTools()` clarifying that options are only applied on the first call.
