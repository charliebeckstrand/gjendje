---
'gjendje': patch
---

**Audit fixes (2025-03-27)** — addresses 7 issues found during a full package audit:

### Critical fixes

- **React `useGjendje` hook** — stabilized `subscribe` and `getSnapshot` closures with `useCallback`/`useRef` to prevent `useSyncExternalStore` from tearing down and resubscribing on every render
- **Storage adapter validation bypass** — `validate` is now honoured when a custom `serialize` option is provided, previously it was silently skipped
- **Batch flush infinite loop guard** — `flush()` now caps iterations at 100 to prevent browser/app freeze from circular reactive dependencies

### High priority fixes

- **Effect error routing** — `effect()` callback and cleanup errors now route through the global `onError` pipeline (via `reportError`) in addition to `console.error`. Added optional `key` in `EffectOptions` for error attribution.
- **`configure()` clearing** — passing `undefined` for a config key now correctly removes it (previously, `undefined` values in the spread were no-ops). Added `resetConfig()` export for test teardown and HMR scenarios.
- **URL adapter `replaceState`** — new `urlReplace` option on `StateOptions`. When `true` and scope is `'url'`, uses `replaceState` instead of `pushState`, preventing excessive history entries from rapid updates (e.g. search-as-you-type).
- **`destroyAll()` utility** — new export that destroys all registered state instances and clears the global registry. Useful for test teardown, HMR cleanup, and SPA route transitions.

### New exports

- `resetConfig()` — reset all configuration to defaults
- `destroyAll()` — destroy all registered instances
- `EffectOptions` — type for effect options (`{ key?: string }`)
- `urlReplace` — new option on `StateOptions`
