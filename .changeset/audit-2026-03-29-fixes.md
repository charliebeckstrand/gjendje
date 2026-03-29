---
'gjendje': patch
---

**Bug fixes from 2026-03-29 codebase audit**

- **Bucket adapter double notification** — Fixed a bug where listeners subscribed to a bucket-scoped state received **two notifications** for each `set()` call when not inside `batch()`. The bucket's `set()` method redundantly called `notify()` in addition to the delegate subscription that already forwarded the same notification. Inside `batch()` the dedup logic masked this; outside it, listeners fired twice per update.

- **`createOptimizedListeners` counter desync** — Fixed the `singleListener` fast-path optimization in `computed`/`select` where subscribing the same function reference twice caused the internal listener counter to desync from the actual `Set.size`. The counter is now derived from the Set directly, preventing any inconsistency.

- **`computed`/`select` NaN equality** — Changed the notification-skip check from `===` to `Object.is` so that `NaN`-valued computeds no longer fire spurious notifications on every recompute, and `+0` → `-0` transitions are no longer silently swallowed.

- **Vue `useGjendje` redundant selector calls** — The `customRef` getter now returns the cached selected value instead of re-running the selector on every `.value` access, avoiding unnecessary computation for expensive selectors.

- **`afterHydration()` error handling** — The hydration utility now wraps the callback in try/catch so that `resolve()` always fires. Previously, if the callback threw, the returned promise would hang forever (mitigated in practice by the caller's own try/catch, but fragile as a general utility).

- **Storage adapter scope redundancy** — Removed 3 redundant `const scope = options.scope ?? 'local'` declarations inside closures that already had access to the outer `scope` variable.

- **`configure()` unknown key warning** — `configure()` now warns when an unrecognized key is passed (e.g. typos like `logLvel`), helping catch silent misconfiguration.

- **`readonly()` shadows `onChange`** — The `readonly()` wrapper now also shadows `onChange` in addition to `set`, `reset`, `patch`, and `intercept`, preventing untyped JS callers from registering change handlers on a read-only view.

- **`previous()` NaN equality** — Changed the notification-skip check from `!==` to `!Object.is()` so that `NaN`-valued previous instances no longer fire spurious notifications on every source change.

- **`MemoryStateImpl.reset()` callback order** — Fixed `config.onReset` firing after instance `changeHandlers` instead of before, matching `StateImpl.reset()` ordering for consistent behavior across scopes.

- **Storage/URL adapter `persist` notification mismatch** — Fixed a bug where the storage and URL adapters notified subscribers with the raw `set()` value instead of the merged value when `persist` was set. Subscribers now receive the same value as `get()` returns.

- **Registry `onRegister` on re-registration** — The `onRegister` callback now fires when re-registering over a destroyed instance in the registry, matching the behavior of fresh registrations.

- **`withHistory` undo/redo on destroyed instance** — `undo()` and `redo()` now early-return when the underlying instance is destroyed, preventing silent history stack corruption.
