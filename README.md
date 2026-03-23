<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

Replaces storage backends with a unified API. Choose where state lives. The rest is handled.

- Zero runtime dependencies
- ~5 kB core (minified + brotli)
- TypeScript-first with full type inference
- 6 storage backends, one API

## Install

```sh
npm install gjendje
```

## Quick start

```ts
import { state } from 'gjendje'

const theme = state.local({ theme: 'light' })

theme.get()        // 'light'
theme.set('dark')  // persisted to localStorage
theme.reset()      // back to 'light'
```

For in-memory state that doesn't persist, use `state` without a scope:

```ts
const user = state({ name: 'John', age: 30 })

user.get()                                       // { name: 'John', age: 30 }
user.patch({ name: 'Jane' })                     // only updates name
user.set((prev) => ({ ...prev, age: prev.age + 1 }))  // updater function
```

[More in the quick start guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/quick-start.md)

## Scopes

Every `state()` targets a scope — the storage backend that holds the value.

| Scope     | Backend              | Shortcut           |
|-----------|----------------------|--------------------|
| `memory`  | In-memory (default)  | `state()`          |
| `local`   | `localStorage`       | `state.local()`    |
| `session` | `sessionStorage`     | `state.session()`  |
| `url`     | `URLSearchParams`    | `state.url()`      |
| `bucket`  | Storage Buckets API  | `state.bucket()`   |
| `server`  | `AsyncLocalStorage`  | `state.server()`   |

[Scope decision guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md) · [Persistence reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/persistence.md)

## API

Every instance shares the same core methods:

| Method | Description |
|--------|-------------|
| `get()` | Current value (reactive — tracked by `computed` and `effect`) |
| `peek()` | Current value without reactive tracking |
| `set(value)` | Replace the value, or pass an updater function |
| `patch(partial)` | Merge partial updates into an object value |
| `reset()` | Restore to the default value |
| `subscribe(fn)` | Listen for changes — returns an unsubscribe function |
| `watch(key, fn)` | Listen for changes to a single property |
| `intercept(fn)` | Pre-set hook — transform or reject values before they're stored |
| `onChange(fn)` | Post-set hook — react after a value changes |
| `destroy()` | Tear down all listeners and storage resources |

[Full API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md)

## Primitives

Reactive primitives that build on top of `state`:

| Primitive | Description |
|-----------|-------------|
| `computed(deps, fn)` | Derived value from one or more dependencies. Cached, lazy, read-only. |
| `select(source, fn)` | Single-source alternative to `computed`. Simpler and faster for one dependency. |
| `effect(deps, fn)` | Side effect that re-runs when dependencies change. Supports cleanup. |
| `collection(key, options)` | Reactive array with `add`, `remove`, `update`, `find`, `has`, `clear`. |
| `readonly(instance)` | Read-only view of any instance. Zero runtime cost. |
| `previous(source)` | Tracks the previous value of a source instance. |

[Primitives reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/primitives.md)

## Utilities and enhancers

| Function | Description |
|----------|-------------|
| `configure(options)` | Set global defaults and event hooks for all state instances |
| `batch(fn)` | Group updates so subscribers are notified once |
| `snapshot()` | Read-only snapshot of all registered instances |
| `shallowEqual(a, b)` | Shallow equality check for primitives, arrays, and objects |
| `withHistory(instance)` | Adds undo/redo to any state instance |
| `withWatch(instance)` | Adds per-key change tracking to any instance |
| `withServerSession(fn)` | Wraps a callback in `AsyncLocalStorage` context for `server` scope |

[Configure guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md) · [Full API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md#utility-functions)

## Documentation

| Guide | What it covers |
|-------|----------------|
| [Quick start](https://github.com/charliebeckstrand/gjendje/blob/main/docs/quick-start.md) | Create, read, and update state in 2 minutes |
| [Examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md) | Real-world patterns — forms, todo lists, undo/redo, cross-tab sync |
| [API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md) | Every method, option, and type |
| [Scopes](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md) | Decision guide for choosing a storage backend |
| [Persistence](https://github.com/charliebeckstrand/gjendje/blob/main/docs/persistence.md) | Serialization, migration, validation, selective persistence |
| [Primitives](https://github.com/charliebeckstrand/gjendje/blob/main/docs/primitives.md) | computed, select, effect, collection, readonly, previous |
| [Configure](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md) | Global defaults, events, and options |

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
