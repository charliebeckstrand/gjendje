# gjendje

## 1.3.6

### Patch Changes

- 2e114cc: **Reduce npm package size by ~33%** by enabling minification in the tsup build config.

  - JS runtime output shrinks from ~156 KB to ~78 KB (50% reduction)
  - Overall unpacked size drops from ~245 KB to ~165 KB
  - No feature or API changes — only the dist output is minified via esbuild

## 1.3.5

### Patch Changes

- 8f9dfaf: ### Bug fixes

  - **Custom serializer now runs migration chain**: Previously, using a custom `serialize` option caused the migration pipeline (`version` + `migrate`) to be silently skipped. Custom serializers now correctly unwrap versioned envelopes, run migrations, and validate — matching the behavior of the default JSON path.

  - **Notification snapshot safety in `computed` and `select`**: Listener sets are now snapshotted before iteration during notifications. This prevents edge cases where subscribing or unsubscribing inside a notification callback could cause double-firing or skipped listeners in the same cycle.

  - **Watcher notification snapshot safety**: `notifyWatchers` (used by `watch()`, `withWatch()`, and `collection.watch()`) now snapshots the watcher Map and listener Sets before iterating, preventing watchers registered during a notification from firing in the same cycle.

  - **Batch flush errors routed through `onError`**: Errors thrown during batch flush notifications are now reported through the global `onError` pipeline via `reportError()`, consistent with how listener errors are handled elsewhere in the library.

  ### Internal improvements

  - `select.subscribe()` now returns a shared `NOOP` function when the instance is destroyed, matching `computed` behavior and avoiding unnecessary allocations.
  - URL adapter cache key now reads `window.location.search` directly after `pushState`/`replaceState` instead of manually constructing the search string, eliminating potential format mismatches.

- 6d86105: ### Bug fixes

  - **`readonly()` now shadows `patch()`**: The readonly wrapper previously only shadowed `set`, `reset`, and `intercept`, leaving `patch()` accessible via the prototype chain. Untyped JavaScript callers could bypass the readonly contract by calling `.patch()`. The wrapper now shadows `patch` with `undefined`, matching the existing protection for other write methods.

  - **DevTools time-travel error handling**: When restoring state via Redux DevTools time-travel (`JUMP_TO_STATE` / `JUMP_TO_ACTION`), if one instance's `set()` throws (e.g., interceptor rejection), the error is now caught and logged. Remaining instances continue to be updated, preventing partial state restoration that leaves DevTools and application state diverged.

  - **React hook `useMemo` dependency fix**: The `useGjendje` hook no longer includes the `selector` function reference in the `useMemo` dependency array. Inline selectors (the common pattern) created a new reference every render, causing unnecessary `useMemo` re-computation. The return shape is now determined solely by the `writable` flag, which already accounts for selector presence.

  ### Documentation

  - Added `@remarks` JSDoc to `enableDevTools()` clarifying that options are only applied on the first call.

- ee7968b: ### Bug fixes

  - **Storage adapter now notifies on cross-tab `localStorage.clear()`**: When another tab calls `localStorage.clear()`, the `StorageEvent` fires with `event.key === null`. The storage adapter previously ignored these events, leaving subscribers stale. It now correctly invalidates the cache and notifies listeners, matching the behavior for individual key changes.

  - **Collection watcher notification snapshot safety**: The collection module's internal watcher notification now snapshots both the watcher Map entries and listener Sets before iterating, matching the pattern used in `notifyWatchers()`. This prevents subscribe/unsubscribe during notification from skipping or double-firing listeners.

  - **`previous()` destroy cleanup guarantee**: The `previous()` instance's `destroy()` method now wraps cleanup in try/finally, ensuring `listeners.clear()` and `lazyDestroyed.resolve()` execute even if the source's unsubscribe function throws.

  - **`destroyAll()` ordering fix**: `destroyAll()` now clears the registry before destroying instances (instead of after). This prevents instances created during destroy notifications (e.g., via `onDestroy` callbacks) from being silently removed by the final `registry.clear()`.

  - **Bucket adapter cross-tab event forwarding**: The bucket adapter's fallback delegate (used when the Storage Buckets API is unavailable) now subscribes to storage events immediately during synchronous initialization. Previously, the subscription was only set up at the end of the async initialization block, which was never reached on the fallback path — breaking cross-tab reactivity for bucket-scoped state on most browsers.

  - **Complete notification snapshot safety**: All remaining notification iteration paths now snapshot their listener/handler collections before iterating. This includes `MemoryStateImpl` subscriber notifications (the hot path for memory-scoped state), `createListeners.notify()` (used by all persistent adapter types), and `onChange` handler iteration in both `StateImpl` and `MemoryStateImpl`. Previously, only computed, select, watchers, and collection had snapshot protection — the core state notification paths were unprotected.

- 0c6439c: **Production readiness: CI guardrails and build hardening**

  - **Type declaration validation**: Added `@arethetypeswrong/cli` (`attw`) to verify `.d.ts` and `.d.cts` files resolve correctly for both ESM and CJS consumers. Runs in CI and as part of `prepublishOnly`.
  - **Coverage thresholds**: Added minimum coverage thresholds to `vitest.config.ts` (lines: 90%, functions: 90%, branches: 80%, statements: 90%) enforced in CI via `pnpm test:coverage`.
  - **`prepublishOnly` reorder**: Build now runs first so `publint` and `attw` validate actual build output, and build failures fast-fail before the slower test suite.

- e5b21a3: Centralize repeated code patterns across derived instances (computed, select, effect)

  - **`createOptimizedListeners`** — new utility in `listeners.ts` that encapsulates the listener Set with single-listener fast path optimization. Previously duplicated verbatim in `computed.ts` and `select.ts` (~80 lines each).
  - **`subscribeAll` / `unsubscribeAll`** — new utilities in `utils.ts` for subscribing a callback to an array of dependencies and tearing down those subscriptions. Previously duplicated in `computed.ts` and `effect.ts`.
  - **`NOOP`** — shared no-op constant in `utils.ts`, replacing identical local definitions in `computed.ts` and `select.ts`.

  No behavioral changes. All 1058 tests pass without modification.

## 1.3.4

### Patch Changes

- 588d48b: ### Resource lifecycle hardening

  Fixed 5 issues from the resource lifecycle audit:

  - **Bucket adapter**: added `isDestroyed` guard before `delegateUnsub` assignment to prevent subscription leaks if an `await` is introduced between the existing guard and the assignment
  - **`withWatch` enhancer**: removed the `initialized` flag that prevented retry after a failed `subscribe()` call — now checks only `unsubscribe`, allowing recovery
  - **`effect()`**: cleared the `unsubscribers` array after `stop()` to release closure references immediately (matching `computed`'s existing cleanup pattern)
  - **`collection`**: nullified `watchers`, `unsubscribe`, and `prevItems` in `destroy()` to release references sooner
  - **`previous()`**: wrapped `source.subscribe()` in try/catch with `listeners.clear()` cleanup, throwing a descriptive error on failure

  ### `select()` optimization

  Rewrote `select()` as a standalone lightweight implementation instead of wrapping `computed()`. Eliminates array allocation for dependencies, the dependency loop, and `Promise.all` overhead for async checks. Benchmarks show **~13% faster** operations for single-dependency projections. The API and behavior are unchanged.

## 1.3.3

### Patch Changes

- 844cff9: ### Error handling hardening

  Comprehensive hardening of error handling across the library:

  - **Interceptor safety**: Interceptors returning `undefined` or `Promise` now abort the set/reset with a warning instead of silently corrupting state
  - **InterceptorError class**: New `InterceptorError` error type — interceptor failures are now wrapped in a typed error for `instanceof` discrimination in `onError` handlers
  - **Listener error routing**: `safeCall` and `safeCallChange` now route errors through the global `onError` pipeline (via `reportError`) when key/scope context is available, not just `console.error`
  - **Serialization guardrails**: Circular references, BigInt, and other non-serializable values now produce descriptive `StorageWriteError` messages through the `onError` pipeline
  - **Destroy robustness**: All `destroy()`/`stop()` methods (10 total across core, computed, effect, collection, history, storage, URL, sync, bucket adapters) now use `try/finally` to guarantee critical cleanup even if an earlier step throws
  - **Post-destroy notification leak**: `computed` no longer notifies subscribers or recomputes after `destroy()` — `markDirty` and `notifyListeners` bail immediately when destroyed
  - **Version validation**: The `version` option now throws immediately for invalid values (0, negative, NaN, Infinity, non-integer). Stored version envelopes higher than the current version now log a warning instead of silently skipping migrations
  - **Config validation**: `configure()` now validates `maxKeys`, `logLevel`, and `scope` — invalid values throw immediately instead of silently corrupting behavior
  - **History validation**: `maxSize` in `withHistory()` now throws for invalid values (0, negative, non-integer)
  - **Bucket validation**: `bucket.name` must be a non-empty string
  - **ComputedError class**: New `ComputedError` error type — derivation function failures are now wrapped in a typed error, reported through `onError`, and rethrown. The dirty flag is preserved so the next `get()` retries.
  - **Computed listener routing**: Computed subscriber errors now route through the global `onError` pipeline (previously only `console.error`)
  - **DepValues export**: The `DepValues` utility type is now exported from the package for typing `computed`/`effect` callbacks
  - **JSDoc `@throws` annotations**: Added to `state()`, `configure()`, `withHistory()`, `computed()`, and `collection()`
  - **Computed cleanup**: Unsubscriber array is cleared on destroy to allow GC of dependency closures
  - **Computed V8 optimization**: Extracted `callDerivation()` helper from `recompute()` so the try/catch doesn't prevent V8 from optimizing the hot recomputation loop
  - **Config validate-before-mutate**: `configure()` now validates all inputs before merging into global config — a failing validation no longer leaves config in a partially-mutated state
  - **keyPattern validation**: `configure({ keyPattern })` now throws immediately if the value is not a RegExp
  - **onChange/onReset allocation guard**: `safeCallConfig` object literal allocations in `MemoryStateImpl.set()`, `reset()`, and `StateImpl._notifyChange()` are now guarded behind `!== undefined` checks to avoid allocation on every set/reset when no callback is configured
  - **Scope `'render'` deprecated**: The `'render'` scope type now has a `@deprecated` JSDoc annotation directing users to `'memory'`
  - **Test coverage gaps closed**: Added 36 tests across 9 new focused test files covering onHydrate callback, onExpire callback, DepValues runtime verification, collection+computed integration, session scope parity, withHistory+computed interaction, destroyAll with live computed/effects, snapshot with collections, and interceptor chain edge cases

## 1.3.2

### Patch Changes

- 3000094: **Data integrity fixes** — prevents data loss and corruption across persistent adapters:

  ### Critical fixes

  - **Storage write failure no longer silently diverges state** — when `storage.setItem()` throws (quota exceeded, SecurityError, etc.), subscribers are no longer notified with a value that was never persisted. `set()` and `reset()` now abort cleanly: no subscriber notification, no `onChange` callback, no `lastValue` update. The `onError` and `onQuotaExceeded` callbacks still fire for observability. Subsequent writes succeed normally once storage is available.

  - **Partial migration no longer poisons the version envelope** — when a migration step throws mid-chain (e.g., v1→v2 succeeds but v2→v3 throws), the partially migrated data was previously returned as the state value. On the next `set()`, it would be stamped with the current version, permanently recording half-migrated data as fully migrated. `runMigrations()` now throws on step failure, causing the pipeline to fall back to `defaultValue` and backup the original raw data.

  ### High priority fixes

  - **Versioned envelope false-positive detection** — user data shaped like `{ v: <integer>, data: <any>, ...extraKeys }` was silently unwrapped as a versioned envelope, losing all properties except `data`. The envelope detector now requires exactly 2 keys (`v` and `data`), matching only real envelopes produced by `wrapForStorage()`.

  - **Bucket adapter no longer emits duplicate notifications during init** — when a user wrote to fallback storage during async bucket initialization, subscribers were notified twice with the same value (once from the outer `set()` and once from the post-init check). The post-init notification is now skipped when the value was already delivered by a user write.

  ### Medium priority fixes

  - **SSR hydration respects explicit set-to-default** — hydration no longer overwrites when the user calls `set()` with a value equal to the default before hydration completes. A `hasUserWrite` flag tracks any explicit `set()`/`reset()` call, preventing the false-negative from `shallowEqual(currentValue, default)`.

  - **Migration failure data backup** — when migration or validation fails and the default value is returned, the original raw data is automatically backed up to `{key}:__gjendje_backup` in storage. The backup is write-once (preserves the earliest original data) and survives subsequent writes, allowing recovery if the migration bug is later fixed.

  - **`shallowEqual` now handles Set, Map, Date, and RegExp** — previously, `Object.keys()` returned `[]` for Set and Map instances, causing two Sets/Maps with different content to compare as "equal". This silently suppressed updates when used with `isEqual: shallowEqual`. Sets compare by size + elements, Maps by size + entries, Dates by timestamp, RegExps by string representation.

  - **Batch flush limit now delivers remaining notifications** — when the flush loop hits 100 iterations (infinite loop guard), remaining notifications now receive one final best-effort delivery pass before being discarded, ensuring subscribers see the final state.

  - **Backup failure is no longer silent** — when the data backup mechanism fails (e.g., storage full), an error is now logged and `onError` fires so programmatic handlers can react.

## 1.3.1

### Patch Changes

- e94e09c: **Audit fixes (2025-03-27)** — addresses 7 issues found during a full package audit:

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

## 1.3.0

### Minor Changes

- b537ba3: Add typed error classes for structured error handling

  Previously, all errors flowing through the `onError` callback had `error: unknown`, making it impossible to programmatically distinguish between storage failures, validation rejections, migration errors, and sync issues.

  **New error classes** (all extend `GjendjeError` which extends `Error`):

  - **`StorageReadError`** — emitted when reading from storage fails (corrupt data, parse errors)
  - **`StorageWriteError`** — emitted on write failures, with an `isQuotaError` flag for quota-specific handling
  - **`MigrationError`** — emitted when a schema migration function throws, includes `fromVersion` and `toVersion`
  - **`ValidationError`** — emitted when `validate()` rejects a stored value, includes `rejectedValue`
  - **`SyncError`** — emitted when a cross-tab BroadcastChannel sync fails
  - **`HydrationError`** — emitted when SSR hydration can't read the real storage value

  All error classes carry `key`, `scope`, and `cause` (the original error), enabling precise error discrimination:

  ```ts
  import { configure, StorageWriteError, MigrationError } from "gjendje";

  configure({
    onError({ error }) {
      if (error instanceof StorageWriteError && error.isQuotaError) {
        // clear old data to free space
      } else if (error instanceof MigrationError) {
        // log migration failure with version context
        console.error(
          `Migration v${error.fromVersion}→v${error.toVersion} failed`
        );
      }
    },
  });
  ```

### Patch Changes

- ad51275: Improve error handling consistency and test coverage across the codebase

  ### Config callback isolation

  All global config callbacks are now wrapped in try-catch via `safeCallConfig`. Previously, a throwing callback could crash the operation that triggered it. Now errors are caught and logged to `console.error`, matching the existing isolation behavior of listeners and change handlers.

  Wrapped callbacks: `onIntercept`, `onChange`, `onReset`, `onDestroy`, `onSync`, `onExpire`, `onQuotaExceeded`, `onMigrate`, `onValidationFail`, `onError`, `onHydrate`, `onRegister`.

  ### Interceptor error reporting

  When an interceptor throws, the error is now reported through the `onError` global callback via `reportError()` before being re-thrown. This makes interceptor failures observable through the same error pipeline used by storage, migration, and validation errors — without changing the existing throw-to-reject behavior.

  ### Bucket adapter error reporting

  The Storage Buckets API initialization catch block previously swallowed all errors silently. It now logs a warning and reports the error through `onError`, so users know when their bucket storage failed to initialize and the fallback adapter is being used.

  ### Sync adapter hardening

  The cross-tab BroadcastChannel sync adapter (`withSync`) now handles all failure paths gracefully:

  - **BroadcastChannel constructor**: Wrapped in try-catch — if creation fails (e.g. sandboxed iframes), a `SyncError` is reported via `onError` and the state continues without cross-tab sync.
  - **`postMessage()`**: Broadcast failures no longer crash `set()`. The local value is still updated; only the cross-tab broadcast is skipped with error reporting.
  - **`channel.close()`**: Wrapped in try-catch in `destroy()` — a failing close no longer prevents `adapter.destroy()` from running.

  ### Test coverage

  Additionally, `reportError()` itself is now hardened — if the user's `onError` callback throws, the error is caught and logged rather than crashing the operation.

  ### DevTools error isolation

  The devtools orchestrator, logger, and Redux DevTools adapter now handle all failure paths gracefully:

  - **Original config callbacks**: When devtools chains with a user's existing `onChange`/`onReset`/`onRegister`/`onDestroy` callback, a throwing callback no longer prevents devtools logging and Redux DevTools dispatch from firing for that event.
  - **Custom logger/filter**: Throwing `logger` or `filter` functions in `LoggerOptions` no longer crash state operations.
  - **Redux DevTools `send()`**: A misbehaving DevTools extension no longer crashes state operations.

  ### Test coverage

  Added 44 new tests covering previously untested paths:

  - Config callback isolation for all callbacks (`onIntercept`, `onChange`, `onReset`, `onDestroy`, `onValidationFail`, `onMigrate`, `onQuotaExceeded`, `onError`, `onRegister`)
  - Interceptor error reporting through `onError` pipeline
  - Bucket adapter initialization failure reporting
  - Sync adapter failure paths (constructor, postMessage, onSync, close)
  - Custom serializer bypassing validation and migration (documenting intentional behavior)
  - Collection persistence with validation, migration, and corrupted data
  - URL adapter edge cases (parse errors, pushState failures, special characters, persist option)
  - DevTools error isolation (original callbacks, logger, filter, Redux DevTools send)

## 1.2.1

### Patch Changes

- a7882b6: Improve internal performance across instance lifecycle, storage reads, and collection creation

  - **Standalone `MemoryStateImpl`**: Removed `StateImpl` inheritance so memory-scoped state (the default) no longer pays the cost of a `super()` call and 7 unused property writes per construction. A/B benchmarks show **+15-17% faster create/destroy** and **+8% faster full lifecycle** with zero hot-path regressions.

  - **Trust-the-cache storage adapter**: Added a `cacheValid` fast-path flag to `read()` in the storage adapter, skipping `storage.getItem()` entirely when the in-memory cache is known-valid. Cache is invalidated on cross-tab storage events, parse errors, and destroy. **~4.5x faster repeated storage reads.**

  - **Mixin/mutate collection factory**: Replaced `Object.create(base)` with direct property assignment onto the base instance in `collection()`. Since the base is created internally and never exposed, this safely eliminates the prototype chain overhead. **~5x faster collection lifecycle** (124K to 625K ops/s).

## 1.2.0

### Minor Changes

- 149fda6: ## DevTools integration (`gjendje/devtools`)

  Added a new `gjendje/devtools` entry point with two features for debugging state management:

  ### Redux DevTools Extension adapter

  - **`enableDevTools()`** — one-call setup that connects to the [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools) and enables the console logger
  - **`connectReduxDevTools()`** — standalone Redux DevTools connection
  - Dispatches `set`, `reset`, `register`, and `destroy` actions to the DevTools timeline
  - **Time-travel debugging** — jumping to a previous state in DevTools replays values into gjendje instances via `JUMP_TO_STATE` / `JUMP_TO_ACTION`
  - No-ops silently when the extension is not installed

  ### Enhanced console logger

  - **`enableLogger()`** — color-coded scope labels with console grouping showing previous and next values
  - **Custom logger function** — redirect output to external services via `loggerOptions.logger`
  - **Key filtering** — only log specific keys via `loggerOptions.filter`
  - Collapsed/expanded console groups via `loggerOptions.collapsed`

  ### Architecture

  - Fully tree-shakeable — zero cost when not imported
  - Separate entry point keeps DevTools code out of production bundles
  - Chains with existing `configure()` callbacks (preserves user-defined `onChange`, `onReset`, `onRegister`, `onDestroy`)
  - Size budget: < 2 kB for the full devtools entry point

## 1.1.0

### Minor Changes

- 76eabb3: Add React bindings via `gjendje/react` entry point.

  **New export: `useGjendje`** — a single hook for subscribing to any gjendje instance in React.

  ```tsx
  import { useGjendje } from "gjendje/react";

  const count = useGjendje(counter);
  const theme = useGjendje(settings, (s) => s.theme);
  ```

  - Built on `useSyncExternalStore` for React 18+ concurrent rendering safety
  - Optional selector for derived slices — skips re-renders when the slice is unchanged (`===`)
  - Works with all instance types: `state`, `computed`, `select`, `collection`, `readonly`, `withHistory`
  - React added as optional peer dependency — tree-shakes completely when not imported
  - Bundle: 75 bytes (brotli)

- Add Vue bindings via `gjendje/vue` entry point.

  **New export: `useGjendje`** — a composable that returns a reactive `Ref` synced with any gjendje instance.

  ```vue
  <script setup>
  import { useGjendje } from "gjendje/vue";

  const count = useGjendje(counter);
  // Read: count.value
  // Write: count.value = 5
  </script>
  ```

  - Built on Vue's `customRef` for native reactivity integration
  - Writable instances return a two-way `Ref` — assign to `.value` to update
  - Readonly/computed instances return a read-only `Ref`
  - Optional selector for derived slices
  - Cleanup via `onScopeDispose` — no manual teardown needed
  - Vue added as optional peer dependency — tree-shakes completely when not imported
  - Bundle: 90 bytes (brotli)

## 1.0.10

### Patch Changes

- Fix supply chain security: upgrade happy-dom from v14 to v20 to resolve 2 critical CVEs (GHSA-96g7-g7g9-jxw8, GHSA-37j7-fg3j-429f). Remove benchmark-only devDependencies (zustand, valtio, tsx) to reduce published dependency footprint. Add SECURITY.md with vulnerability reporting guidelines.

## 1.0.9

### Patch Changes

- 1fd8b5a: Fix supply chain security: upgrade happy-dom to v20 to resolve 2 critical CVEs and add SECURITY.md

## 1.0.8

### Patch Changes

- f3e544b: Performance and correctness audit — error isolation, allocation reduction, and pattern cleanup.

  **Correctness:**

  - Error-isolate batch flush loop so one throwing listener can't silence remaining notifications
  - Error-isolate change handler loops via `safeCallChange()` helper across StateImpl and MemoryStateImpl (extracted to separate function to avoid V8 deoptimization of hot `set()` method)
  - Error-isolate effect callbacks with try/catch to prevent crashing the notification chain
  - Add `safeCall` to collection watcher notification loops for error isolation consistency
  - Guard `computed`/`select` `subscribe()` against destroyed state to prevent listener leaks
  - Fix `withHistory` `navigate()` to defer stack pop/push until after successful `set()`, preventing history corruption when set throws
  - Fix `withWatch` re-entrancy guard to prevent double subscription when subscribe fires synchronously
  - Clear refs in `withWatch` `destroy()` to aid garbage collection

  **Performance:**

  - Remove redundant `_hasIsEqual` boolean field from MemoryStateImpl — simplify to optional chaining only (isEqual writes +14%, middleware +8–13%)
  - Clear `notifyFn` on MemoryStateImpl destroy to prevent stale batch notifications
  - Replace `new Set(Object.keys(...))` with `Object.hasOwn` in strict `patch()`
  - Lazy-allocate `changedKeys` Set in collection watcher diffing (skip allocation when nothing changed)
  - Defer collection watchers Map and base subscription to first `watch()` call
  - Hoist `previous()` notification closure out of subscribe callback (enables batch deduplication)
  - Consolidate computed async dep promise construction into single loop with pre-allocated arrays
  - Use `createLazyDestroyed` utility in computed/select instead of inlining the pattern

- f09584d: Single-listener fast path in computed and select notification — when exactly one subscriber exists (common in computed chains), call it directly instead of iterating the Set, avoiding iterator allocation per notification. Computed chain depth-25 +33%, depth-10 +17%, depth-5 +20%.

## 1.0.7

### Patch Changes

- ae0427e: Add package summary documentation covering what gjendje does, how it works, and how it compares to competing state management libraries

## 1.0.6

### Patch Changes

- 48b782d: Add A/B testing framework for benchmarks with --save/--compare workflow and defineSuite helper to reduce benchmark boilerplate
- Add `--quick` flag for faster benchmark iteration during development
- Migrate all 8 benchmark files to use `defineSuite`
- Add `bench:save` and `bench:compare` npm scripts

## 1.0.5

### Patch Changes

- bb6d411: Optimize batch queue, collection operations, and computed/select allocation; fix watcher error isolation and history phantom entries.

  **Performance:** Batch scaling +51% (Array+WeakMap queue replaces Set+copy flush), collection.add +63% (concat vs spread), collection.update-one +137% (direct get/set vs function updater), computed chain depth-25 +11% (inline createListeners/createLazyDestroyed), effect trigger +14%.

  **Correctness:** notifyWatchers uses safeCall to prevent one throwing watcher from silencing others or desynchronizing watchPrev. withHistory uses onChange instead of intercept to avoid phantom history entries when isEqual rejects a no-op write.

## 1.0.4

### Patch Changes

- c1b9274: Improve supply chain security and code quality scores: remove duplicate lockfile, pin GitHub Actions to commit SHAs, add npm provenance attestation, add CI workflow for PRs, and add Socket configuration.

## 1.0.3

### Patch Changes

- ca81290: Codebase elegance refactor — cache computed settled promise (was allocating Promise.all on every access), reuse shared RESOLVED promise in storage/URL adapters and SSR, extract navigate helper in withHistory to remove undo/redo duplication, short-circuit collection watcher notification on length change, simplify snapshot/devtools/sync adapter code, remove redundant assignments and unnecessary .bind() calls. No behavioral or performance changes.

## 1.0.2

### Patch Changes

- f0d6dfb: Short-circuit Promise.all in computed() for memory-scoped deps — skip array allocation and promise wrapping when all deps return RESOLVED. Cache the settled getter to avoid allocating Promise.all + map + then on every access. Computed creation 12-30% faster, settled access 2.6x faster.
- 8d62092: Extract try/catch from listener notification loops into a shared safeCall helper. Allows V8 to optimize the loop body independently and deduplicates three identical try/catch blocks across listeners.ts, core.ts, and adapters/memory.ts.
- 732693a: Optimize state creation performance: inline resolveKeyAndScope to eliminate intermediate object allocation, early-exit memory fast path before SSR/sync computation, consolidate registry lookups, and build MemoryStateImpl mutable state in a single allocation. Add `registry: false` config option to skip registry for memory-scoped state, bringing creation throughput from ~1M to ~6M ops/s (within 2x of Zustand). Warns when `registry: false` is combined with a persistent global scope.
- f5f75e2: Pre-populate storage adapter read cache after writes instead of invalidating it. Eliminates redundant getItem() + JSON.parse() on read-after-write paths (~41% faster single read-after-write, ~92% faster many-reads-per-write).
- 644cfcc: Add read cache to URL adapter — caches parsed value keyed on location.search string, skipping URLSearchParams construction and re-parsing when the URL hasn't changed. Also pre-populates cache after writes. Repeated reads 16x faster, many-reads-per-write 26x faster.

## 1.0.1

### Patch Changes

- bceda12: Deduplicate and simplify internal code — extract shared helpers for interceptors, change handlers, watcher management, lazy destroyed promises, key validation, scope shortcuts, and unit parsing, reducing ~220 lines of duplicated logic with no behavioral changes
- bf77d20: Fix subscription and adapter leaks on destroy — store and call unsubscribe in sync.ts and bucket.ts, move hydration adapter cleanup to finally block in core.ts
- bf77d20: Fix race conditions in SSR hydration, cross-tab sync, and bucket adapter — prevent hydration from overwriting user-set values, guard sync message handler against post-destroy delivery, and clean up bucket delegate on mid-swap destroy
- a047407: Rewrite API, primitives, and utilities docs with consistent formatting, type references, and code examples for every entry
- cc49512: Improve type safety: extract shared DepValues type, add isRecord type guard, and reduce unsafe casts across the codebase

## 1.0.0

### Major Changes

- b516449: Release 1.0.0 — first stable major version.

  **Breaking changes:**

  - Remove deprecated standalone scope shortcut exports (`local()`, `session()`, `url()`, `bucket()`, `server()`). Use `state.local()`, `state.session()`, `state.url()`, `state.bucket()`, `state.server()` instead.
  - Remove deprecated `'tab'` scope alias. Use `'session'` instead.
  - Remove `'tab'` from `BucketOptions.fallback` type. Use `'session'` instead.
  - Rename `'render'` scope to `'memory'`. `'render'` is kept as a deprecated alias.

  **Improvements:**

  - Standardize all error message prefixes to `[gjendje]`.
  - Promote `noNonNullAssertion` and `noExplicitAny` lint rules from warnings to errors.
  - Fix size-limit config referencing `withServerSession` from the wrong entry point.
  - Update size limit for core bundle from 4 kB to 5 kB.

### Patch Changes

- 940c868: Add utilities reference doc covering batch, snapshot, shallowEqual, withHistory, withWatch, and withServerSession
- 241db2d: Improve documentation usability.

  - README: add inline quick start, API methods table (consistent with primitives table), unified documentation index, and utilities/enhancers section.
  - Remove misplaced utilities table from configure guide.
  - Add navigation links between all doc pages.

## 0.9.3

### Patch Changes

- Fix inconsistent variable names in README state examples (`store` → `filters`)

## 0.9.2

### Patch Changes

- Remove `pick()` method from state instances. Use destructuring instead: `const { name } = store.get()`. The method provided no value over simple property access or destructuring.

## 0.8.0

### Minor Changes

- Add five new global configure events: `onChange`, `onReset`, `onIntercept`, `onValidationFail`, and `onExpire`. These provide fine-grained observability over state changes, interceptor activity, storage validation failures, and bucket data expiration.
- Split the configure documentation into separate **Options** and **Events** tables for clarity.
- Add global events example (`onError`, `onChange`) to the README.

## 0.7.1

### Patch Changes

- Add `patch()` method to state instances for ergonomic partial object updates. Instead of `store.set(prev => ({ ...prev, value1: 'new' }))`, use `store.patch({ value1: 'new' })`. Supports an optional `{ strict: true }` mode that ignores unknown keys and logs a warning.

## 0.7.0

### Minor Changes

- Add dot-notation scope shortcuts on `state`: `state.local()`, `state.session()`, `state.url()`, `state.bucket()`, `state.server()`. This replaces the separate namespace imports with a unified `state.*` API.
- Deprecate standalone `local()`, `session()`, `url()`, `bucket()`, `server()` exports — they now emit a console warning on first use. These will be removed in 1.0.0. Migrate to `state.local()`, `state.session()`, etc.
- Update all documentation to use the new `state.*` dot notation style.
- Add `'session'` as the preferred scope name for `sessionStorage` (replaces `'tab'`). Both work interchangeably; `'tab'` is deprecated.

## 0.6.0

### Minor Changes

- Add scope shortcut functions — `local()`, `session()`, `url()`, `bucket()` — for creating state with an implicit key format: `local({ theme: 'light' })`. Eliminates the need to learn the options object pattern for common use cases.
- Add three-argument `state()` overload: `state('key', defaultValue, options)` separates the default value from options, removing the `{ default: ... }` wrapper.
- Add `'memory'` as a scope alias for `'render'`. Both work interchangeably; `'memory'` is now the recommended name.
- Update README to lead with the simplified API.

## 0.5.0

### Minor Changes

- Rename `use()` to `onChange()` on state and collection instances. The `use()` name was overloaded in the JS ecosystem (React hooks, Express middleware) and didn't convey its purpose as a post-write handler. `onChange()` is self-documenting and idiomatic. This is a breaking change — update all `.use(fn)` calls to `.onChange(fn)`.

## 0.4.4

### Patch Changes

- Make bucket adapter synchronously initialize with fallback storage so `get()` and `set()` work immediately without awaiting `ready`. The `ready` promise still resolves when the real Storage Bucket opens, but users no longer need to await it for basic operations.

## 0.4.3

### Patch Changes

- Fix "Module not found: Can't resolve 'async_hooks'" error in client bundles. The server adapter (`node:async_hooks`) is no longer statically imported by core — it self-registers when imported. Non-server scopes (`memory`, `session`, `local`, `url`, `bucket`) no longer pull in Node.js-only modules.
- Add `gjendje/server` entry point for server-only imports (`withServerSession`, `createServerAdapter`).

## 0.4.2

### Patch Changes

- Add extended internal benchmarks for select vs computed, readonly overhead, registry lookup at scale, and persistence round-trip performance.
- Optimize `readonly()` to true zero-cost via `Object.create()` prototype delegation, reducing get/peek overhead from ~37% to ~0% vs direct access.

## 0.4.1

### Patch Changes

- Security audit hardening:
  - Fix URL adapter double-encoding: remove redundant `encodeURIComponent`/`decodeURIComponent` since `URLSearchParams` handles encoding automatically
  - Prevent migration infinite loops: reject non-safe-integer version envelopes in `isVersionedValue` and cap migration steps at 1,000 in `runMigrations`
  - Harden BroadcastChannel message validation: reject messages with unexpected extra keys
  - Fix `pickKeys` prototype chain read: use `Object.hasOwn()` instead of `in` operator

## 0.4.0

### Minor Changes

- Initial release of gjendje. Six scopes (`memory`, `session`, `local`, `url`, `server`, `bucket`), reactive primitives (`computed`, `effect`, `collection`), persistence with validation and migration, Storage Buckets API support, `sync: true` for cross-tab broadcasting, SSR safety, and React bindings.
- Add retroactive changelog entries for versions 0.2.0–0.3.6, add regression tests for 100% coverage, update CLAUDE.md with versioning guidance and changeset workflow.

## 0.3.7

### Docs & Testing

- Add changeset workflow instructions to `CLAUDE.md`
- Add regression tests targeting coverage gaps across 9 modules
- Improve registry coverage to 100% with direct `registerByKey` tests
- Cover SSR server-side early return in `afterHydration` for 100% coverage
- Update scopes and examples documentation

## 0.3.6

### Features & Performance

- Add `select`, `readonly`, and `previous` derived state primitives
- Add shorthand syntax for `state()` default values
- Add render-scope fast path: bypass `createBase` for in-memory state
- Optimize hot paths: computed, effect, subscribe, watch, collection, batch flush, `shallowEqual`
- Lazy destroyed promise in `computed` — allocate only if awaited
- Add CLAUDE.md with biome linting rules and agent behavior guidelines
- Add internal and edge-case benchmarks (gjendje vs Zustand vs Valtio)
- Fix lint warnings: replace non-null assertions, reorder module-level state
- Improve docs: quick start, scopes guide, examples, persistence, and missing API coverage

## 0.3.5

### Docs

- Update README.md

## 0.3.4

### Docs

- Update README.md

## 0.3.3

### Performance & Refactoring

- Convert state instances to class-based implementation (3.4x faster creation)
- Rename configure `defaultScope` to `scope`
- Remove unused `BaseInstance` import from core
- Normalize code style and remove biome-ignore directives
- Add and refactor state management benchmarks

## 0.3.2

### Docs & Fixes

- Fix theme retrieval by awaiting `theme.ready`
- Clarify README descriptions and Storage Buckets API section

## 0.2.0

### Initial publish

- First published version

## 0.1.0

### Initial release

**Core**

- `state(key, options)` — reactive state with six scopes: `render`, `tab`, `local`, `url`, `server`, `bucket`
- `computed(deps, fn)` — derived reactive values, lazy and cached
- `effect(deps, fn)` — reactive side effects with cleanup
- `collection(key, options)` — reactive arrays with `add`, `remove`, `update`, `find`, `findAll`, `has`, `clear`
- `batch(fn)` — group updates so subscribers fire once
- `withServerSession(fn)` — wrap request handlers for `server` scope

**Persistence**

- JSON serialization by default for all persistent scopes
- `validate` — discard corrupt or wrong-shaped stored values
- `migrate` — upgrade stored values across schema versions with a sequential migration chain
- Custom `serialize` option for types that don't round-trip through JSON

**Storage Buckets**

- `scope: 'bucket'` backed by the Storage Buckets API
- Named, isolated storage contexts — keys never conflict across buckets
- `expires` — human duration strings (`7d`, `24h`, `30m`) or timestamps
- `quota` — storage caps (`10mb`, `50mb`) or byte counts
- `persisted` — resist eviction under storage pressure
- `fallback` — graceful degradation to `local` or `tab` when API unavailable
- `.ready` promise on every instance — resolves immediately for sync scopes, after bucket opens for async

**SSR**

- `ssr: true` on any browser scope — falls back to `render` on server, hydrates transparently on client
- `server` scope always SSR-safe via `AsyncLocalStorage`

**Architecture**

- Instance registry — same key + scope always returns the same instance
- Enhancer pattern — `withPeek`, `withWatch` compose capabilities onto any instance
- Adapter interface — open extension point for custom scopes

**React (`gjendje/react`)**

- `useStore` — primary hook, returns `[value, setter]`
- `useSharedState` — consume a module-level instance
- `useStateInstance` — access the full instance including `watch`, `reset`, `ready`
- `useWatch` — subscribe to a specific key within an object, granular re-renders
- `useCollection` — reactive array with all mutation methods
- `useReady` — `boolean` that becomes `true` once an async scope initializes
- `useBucket` — convenience hook for `bucket` scope, returns `[value, setter, isReady]`
