# gjendje

## 0.4.4

### Patch Changes

- Make bucket adapter synchronously initialize with fallback storage so `get()` and `set()` work immediately without awaiting `ready`. The `ready` promise still resolves when the real Storage Bucket opens, but users no longer need to await it for basic operations.

## 0.4.3

### Patch Changes

- Fix "Module not found: Can't resolve 'async_hooks'" error in client bundles. The server adapter (`node:async_hooks`) is no longer statically imported by core — it self-registers when imported. Non-server scopes (`render`, `tab`, `local`, `url`, `bucket`) no longer pull in Node.js-only modules.
- Add `gjendje/server` entry point for server-only imports (`withServerSession`, `createServerAdapter`).

## 0.4.2

### Patch Changes

- 52a62bf: Add extended internal benchmarks for select vs computed, readonly overhead, registry lookup at scale, and persistence round-trip performance.

  Optimize readonly() to true zero-cost via Object.create() prototype delegation, reducing get/peek overhead from ~37% to ~0% vs direct access.

## 0.4.1

### Patch Changes

- Add extended internal benchmarks: `select()` vs `computed()`, `readonly()` overhead, registry lookup at scale, and persistence round-trip (`wrapForStorage`/`readAndMigrate` with migrations and validation). Run via `pnpm bench:extended`.

- Optimize `readonly()` to true zero-cost: replace object literal with `Object.create()` prototype delegation. `get()`/`peek()` overhead drops from ~37% to ~0% vs direct access. Wrapper creation is 20x faster (14.4M vs 721K ops/s). Write methods are shadowed as `undefined` for runtime safety.

- a17f18f: Security audit hardening: fix URL adapter double-encoding, prevent migration infinite loops from corrupted version numbers, harden BroadcastChannel message validation, use Object.hasOwn in pickKeys, reject non-safe-integer version envelopes.

## 0.4.1

### Patch Changes

- Security audit hardening:
  - Fix URL adapter double-encoding: remove redundant `encodeURIComponent`/`decodeURIComponent` since `URLSearchParams` handles encoding automatically
  - Prevent migration infinite loops: reject non-safe-integer version envelopes in `isVersionedValue` and cap migration steps at 1,000 in `runMigrations`
  - Harden BroadcastChannel message validation: reject messages with unexpected extra keys
  - Fix `pickKeys` prototype chain read: use `Object.hasOwn()` instead of `in` operator

## 0.4.0

### Minor Changes

- d7dcdb2: Initial release of gjendje.

  Six scopes (`render`, `tab`, `local`, `url`, `server`, `bucket`), reactive primitives (`computed`, `effect`, `collection`), persistence with validation and migration, Storage Buckets API support, `sync: true` for cross-tab broadcasting, SSR safety, and React bindings.

### Patch Changes

- 5129bc0: Add retroactive changelog entries for versions 0.2.0–0.3.6, add regression tests for 100% coverage, update CLAUDE.md with versioning guidance and changeset workflow.

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
