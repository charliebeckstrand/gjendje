---
'gjendje': patch
---

Centralize repeated code patterns across derived instances (computed, select, effect)

- **`createOptimizedListeners`** — new utility in `listeners.ts` that encapsulates the listener Set with single-listener fast path optimization. Previously duplicated verbatim in `computed.ts` and `select.ts` (~80 lines each).
- **`subscribeAll` / `unsubscribeAll`** — new utilities in `utils.ts` for subscribing a callback to an array of dependencies and tearing down those subscriptions. Previously duplicated in `computed.ts` and `effect.ts`.
- **`NOOP`** — shared no-op constant in `utils.ts`, replacing identical local definitions in `computed.ts` and `select.ts`.

No behavioral changes. All 1058 tests pass without modification.
