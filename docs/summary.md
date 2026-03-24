# Summary

## What gjendje does

The core idea is that **choosing where state lives should be a configuration decision, not an architectural one**. You can start with in-memory state during development, switch to `localStorage` for persistence in production, and later move specific pieces of state to URL params for shareability — all without changing a single line of state logic.

## How it works

### Adapter pattern

Every storage backend implements the same `Adapter<T>` interface: `get()`, `set()`, `subscribe()`, `ready`, and optionally `destroy()`. The core state instance delegates reads and writes to whichever adapter its scope selects. This is the mechanism that makes storage backends interchangeable.

Six scopes are provided out of the box:

| Scope | Storage | Persists |
|-------|---------|----------|
| `memory` | RAM | No |
| `local` | localStorage | Yes |
| `session` | sessionStorage | Tab lifetime |
| `url` | URLSearchParams | In address bar |
| `bucket` | Storage Buckets API | Configurable expiry |
| `server` | AsyncLocalStorage | Per-request |

### State instances

Calling `state({ count: 0 })` returns a state instance with a consistent API surface:

- **Read**: `get()` (reactive) and `peek()` (silent)
- **Write**: `set(value)`, `patch({ partial })`, `reset()`
- **React**: `subscribe(listener)`, `watch(key, listener)`, `onChange(fn)`, `intercept(fn)`
- **Lifecycle**: `ready`, `settled`, `hydrated`, `destroyed` promises

Instances are singletons — calling `state()` with the same key and scope returns the same instance from a global registry, preventing duplication and memory leaks.

### Performance-optimized memory path

The most common scope (`memory`) gets a dedicated fast path via `MemoryStateImpl`. This subclass bypasses the adapter pipeline entirely, storing values directly on the instance. This avoids getter/setter indirection and lazy-allocates features like interceptors and watchers only when used. The result is ~2.8x faster instance lifecycle and ~1.3x faster batch updates compared to routing through the standard adapter pipeline.

### Batching

`batch()` groups multiple `set()` calls into a single notification pass. Nested batches are supported — subscribers only fire when the outermost batch completes. Notifications are deduplicated using a generation counter, so a subscriber is never called twice for the same batch even if multiple of its dependencies changed.

### Derived state

- **`computed([deps], fn)`** — Multi-dependency derived values with lazy recomputation and caching
- **`select(source, fn)`** — Lightweight single-dependency projection (no array allocation overhead)
- **`previous(source)`** — Tracks the prior value of any instance
- **`readonly(instance)`** — Zero-cost read-only wrapper via prototype delegation

### Collections

`collection()` provides an array-specialized state instance with mutation helpers: `add`, `remove`, `update`, `find`, `findAll`, `has`, `clear`, and key-specific `watch` across all items.

### Effects

`effect([deps], fn)` runs a side-effect function immediately and re-runs it whenever any dependency changes. Cleanup functions returned from the effect are called before each re-run and on disposal.

### Enhancers

Enhancers augment existing instances via `Object.create()` prototype delegation:

- **`withHistory(instance)`** — Adds `undo()`, `redo()`, `canUndo`, `canRedo`, and `clearHistory()`
- **`withWatch(instance)`** — Adds key-specific `watch()` to any instance that holds an object

### Persistence features

For persistent scopes (`local`, `session`, `bucket`), gjendje provides:

- **Validation** — Values read from storage are validated before use; invalid values fall back to the default
- **Versioned migration** — Schema migrations run in order when storage contains an older version
- **Partial persistence** — Persist only specific keys of an object while keeping the rest in memory
- **Cross-tab sync** — BroadcastChannel-based synchronization across browser tabs
- **SSR hydration** — Built-in server-side rendering support with hydration lifecycle hooks

## How it compares to other libraries

### vs. Zustand

Zustand is a minimal store based on a single `create()` function that returns a hook. It's simple and fast, but storage persistence requires the `persist` middleware, which only supports localStorage/sessionStorage and doesn't handle migration, validation, or cross-tab sync out of the box. Zustand stores are also not singleton-registered — creating two stores for the same data is the developer's problem. gjendje makes storage backend selection, persistence lifecycle, and instance identity first-class concerns rather than afterthoughts.

### vs. Redux / Redux Toolkit

Redux provides a global store with reducers and dispatched actions. It's battle-tested but opinionated about architecture (action types, reducers, immutability) and has no built-in concept of storage scopes. Persisting Redux state requires `redux-persist`, a separate library with its own configuration surface. gjendje avoids the boilerplate of actions and reducers in favor of direct `get`/`set` semantics, while providing persistence, migration, and validation as part of the core library.

### vs. Jotai

Jotai uses atomic state primitives — each `atom()` is an independent piece of state composed bottom-up. This is philosophically close to gjendje's per-key instances, but Jotai is tightly coupled to React (atoms need a Provider or the default store). It has no native concept of storage scopes, cross-tab sync, or schema migration. gjendje is framework-agnostic and treats storage flexibility as a core feature rather than a plugin concern.

### vs. Valtio

Valtio uses JavaScript proxies to make state mutations automatically reactive. It's ergonomic for simple cases but proxy-based reactivity has edge cases with nested objects, class instances, and non-enumerable properties. Valtio has no built-in persistence, migration, or cross-tab sync. gjendje uses explicit `get`/`set` semantics and adapter-based storage rather than proxy magic, trading some mutation ergonomics for predictability and storage flexibility.

### vs. Signals (Preact, SolidJS, Angular)

Signal-based libraries provide fine-grained reactivity at the framework level. They're fast and ergonomic within their respective frameworks but are framework-specific and don't address where state is stored. gjendje is framework-agnostic and can complement signal-based frameworks by managing the persistence and storage layer that signals don't cover.

### What's unique to gjendje

- **Storage as a first-class axis** — No other library treats the choice of storage backend as a core API concept with six interchangeable scopes
- **Instance registry with singleton semantics** — Same key + scope always returns the same instance
- **Lifecycle promises** (`ready`, `settled`, `hydrated`, `destroyed`) — Fine-grained control over async initialization and cleanup
- **Storage Buckets API support** — First-class support for expiry-based and quota-managed storage with graceful fallback
- **Performance-specialized memory path** — Dedicated fast path for the most common scope without sacrificing the unified API
- **Built-in migration and validation** — Versioned schema migration and value validation are part of the core, not plugins
