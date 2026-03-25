# gjendje

## 1.1.0

### Minor Changes

- Add React bindings via `gjendje/react` entry point.

  **New export: `useGjendje`** — a single hook for subscribing to any gjendje instance in React.

  ```tsx
  import { useGjendje } from 'gjendje/react'

  const count = useGjendje(counter)
  const theme = useGjendje(settings, s => s.theme)
  ```

  - Built on `useSyncExternalStore` for React 18+ concurrent rendering safety
  - Optional selector for derived slices — skips re-renders when the slice is unchanged (`===`)
  - Works with all instance types: `state`, `computed`, `select`, `collection`, `readonly`, `withHistory`
  - React added as optional peer dependency — tree-shakes completely when not imported
  - Bundle: 47 bytes (brotli)

## 1.0.10

### Patch Changes

- Remove benchmark-only devDependencies (zustand, valtio, tsx) to reduce published dependency footprint.

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

## 1.0.8

### Patch Changes

- Performance and correctness audit — error isolation, allocation reduction, and pattern cleanup. Error-isolate batch flush, change handler loops (via extracted `safeCallChange` to avoid V8 deopt), effect callbacks, and collection watcher notifications. Guard computed/select subscribe against destroyed state. Fix withHistory navigate to prevent history corruption on throw. Fix withWatch re-entrancy guard. Remove redundant `_hasIsEqual` field (+14% isEqual writes). Lazy-allocate collection watchers Map and subscription. Consolidate computed async dep promise construction. Use `createLazyDestroyed` in computed/select.

- Single-listener fast path in computed and select notification — when exactly one subscriber exists (common in computed chains), call it directly instead of iterating the Set, avoiding iterator allocation per notification. Computed chain depth-25 +33%, depth-10 +17%, depth-5 +20%.

## 1.0.7

### Patch Changes

- ae0427e: Add package summary documentation covering what gjendje does, how it works, and how it compares to competing state management libraries

- Add package summary documentation (`docs/summary.md`) covering what gjendje does, how it works architecturally, and how it compares to competing state management libraries (Zustand, Redux, Jotai, Valtio, Signals)

## 1.0.6

### Patch Changes

- 48b782d: Add A/B testing framework for benchmarks with --save/--compare workflow and defineSuite helper to reduce benchmark boilerplate

## 1.0.6

### Patch Changes

- Add A/B testing framework for benchmarks — save baseline results with `--save`, compare against them with `--compare`, and see ANSI-colored improvement/regression indicators with a configurable noise threshold (default ±5%)
- Add `defineSuite` helper to reduce benchmark boilerplate (automates Bench creation, running, and result printing)
- Add `--quick` flag for faster benchmark iteration during development
- Migrate all 8 benchmark files to use `defineSuite`
- Add `bench:save` and `bench:compare` npm scripts

## 1.0.5

### Patch Changes

- bb6d411: Optimize batch queue, collection operations, and computed/select allocation; fix watcher error isolation and history phantom entries.

  **Performance:** Batch scaling +51% (Array+WeakMap queue replaces Set+copy flush), collection.add +63% (concat vs spread), collection.update-one +137% (direct get/set vs function updater), computed chain depth-25 +11% (inline createListeners/createLazyDestroyed), effect trigger +14%.

  **Correctness:** notifyWatchers uses safeCall to prevent one throwing watcher from silencing others or desynchronizing watchPrev. withHistory uses onChange instead of intercept to avoid phantom history entries when isEqual rejects a no-op write.

## 1.0.5

### Patch Changes

- Optimize batch queue, collection operations, and computed/select allocation; fix watcher error isolation and history phantom entries. Batch scaling +51% (Array+WeakMap queue replaces Set+copy flush), collection.add +63% (concat vs spread), collection.update-one +137% (direct get/set vs function updater), computed chain depth-25 +11% (inline createListeners/createLazyDestroyed), effect trigger +14%. notifyWatchers uses safeCall to prevent one throwing watcher from silencing others or desynchronizing watchPrev. withHistory uses onChange instead of intercept to avoid phantom history entries when isEqual rejects a no-op write.

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

## Unreleased

### Patch Changes

- Improve supply chain security: remove duplicate lockfile (`package-lock.json`), pin all GitHub Actions to commit SHAs, add npm provenance attestation via `publishConfig.provenance`, add CI workflow (lint, test, typecheck) for PRs, and add `socket.yml` configuration.

### Minor Changes

- Optimize state creation performance: inline `resolveKeyAndScope` to eliminate intermediate object allocation, early-exit memory fast path before SSR/sync computation, consolidate registry lookups via `registerNew`, and build `MemoryStateImpl` mutable state in a single allocation (avoids hidden class transitions). Default creation improved ~13% (1.0M → 1.13M ops/s). Add `registry: false` config option to skip registry for memory-scoped state, bringing creation throughput to ~6M ops/s (within 2x of Zustand, down from 10.75x). Warns when `registry: false` is combined with a persistent global scope.

### Patch Changes

- Codebase elegance refactor — cache computed `settled` promise (was allocating `Promise.all` on every access), reuse shared `RESOLVED` promise in storage/URL adapters and SSR, extract `navigate` helper in `withHistory` to remove undo/redo duplication, short-circuit collection watcher notification on length change, simplify snapshot/devtools/sync adapter code, remove redundant assignments and unnecessary `.bind()` calls. No behavioral or performance changes.
- Pre-populate storage adapter read cache after writes — eliminates redundant `getItem()` + `JSON.parse()` on read-after-write paths (subscriber chains, computed, effects). Benchmarks show ~41% improvement on single read-after-write and ~92% improvement on many-reads-per-write scenarios.
- Add read cache to URL adapter — caches parsed value keyed on `location.search` string, skipping URLSearchParams construction and re-parsing when the URL hasn't changed. Also pre-populates cache after writes. Benchmarks show 16x faster repeated reads and 26x faster many-reads-per-write.
- Short-circuit `Promise.all` in `computed()` for memory-scoped deps — when all deps return the shared `RESOLVED` promise, skip array allocation and promise wrapping entirely. Also caches the `settled` getter (previously allocated `Promise.all` + `.map()` + `.then()` on every access). Computed creation 12-30% faster, `.settled` access 2.6x faster.
- Extract try/catch from listener notification loops into a shared `safeCall` helper — allows V8 to optimize the loop body independently. Deduplicates three identical try/catch blocks across `listeners.ts`, `core.ts`, and `adapters/memory.ts`.

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

  **Improvements:**

  - Promote `noNonNullAssertion` and `noExplicitAny` lint rules from warnings to errors.
  - Fix size-limit config referencing `withServerSession` from the wrong entry point.
  - Update size limit for core bundle from 4 kB to 5 kB.

### Patch Changes

- 940c868: Add utilities reference doc covering batch, snapshot, shallowEqual, withHistory, withWatch, and withServerSession
- 241db2d: Improve documentation usability.

  - README: add inline quick start, API methods table (consistent with primitives table), unified documentation index, and utilities/enhancers section.
  - Remove misplaced utilities table from configure guide.
  - Add navigation links between all doc pages.

## Unreleased

### Patch Changes

- Improve documentation usability: add inline quick start and API methods table to README, remove misplaced utilities table from configure guide, add navigation links between all doc pages.
- Add utilities reference doc (`docs/utilities.md`) covering `batch`, `snapshot`, `shallowEqual`, `withHistory`, `withWatch`, and `withServerSession`.

## 1.0.0

### Major Changes

- **Breaking:** Remove deprecated standalone scope shortcut exports (`local()`, `session()`, `url()`, `bucket()`, `server()`). Use `state.local()`, `state.session()`, `state.url()`, `state.bucket()`, `state.server()` instead.
- **Breaking:** Remove deprecated `'tab'` scope alias. Use `'session'` instead.
- **Breaking:** Remove `'tab'` from `BucketOptions.fallback` type. Use `'session'` instead.
- **Breaking:** Rename `'render'` scope to `'memory'`. `'render'` is kept as a deprecated alias.

### Improvements

- Standardize all error message prefixes to `[gjendje]` (previously mixed `[state]` and `[gjendje]`).
- Remove unused legacy `register()` and `unregister()` functions from internal registry.
- Fix inaccurate `sync` option comment — only `local` and `bucket` scopes support cross-tab sync, not `session`.
- Promote `noNonNullAssertion` and `noExplicitAny` lint rules from warnings to errors.
- Fix size-limit config referencing `withServerSession` from the wrong entry point.
- Update all tests and documentation to use the new API surface.
- Rewrite README for scannability — highlights section, one-liner primitive/utility tables, simplified quick start.
- Fix stale `use()` → `onChange()` references in docs/api.md and docs/primitives.md.
- Rename `docs/derived.md` to `docs/primitives.md`.

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
