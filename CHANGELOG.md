# gjendje

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
