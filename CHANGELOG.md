# gjendje

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
