<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

Every app juggles localStorage, URL params, sessionStorage, and in-memory state. **gjendje** replaces storage backends with a unified API. Choose where state lives. The rest is handled.

- Zero runtime dependencies
- ~5 kB core (minified + brotli)
- TypeScript-first with full type inference
- 6 storage backends, one API

## Install

```sh
npm install gjendje
```

[Quick start guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/quick-start.md) · [Examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)

## Scopes

| Scope    | Backend              | Shortcut           |
|----------|----------------------|--------------------|
| `memory`  | In-memory (default)  | `state()`          |
| `local`   | `localStorage`       | `state.local()`    |
| `session` | `sessionStorage`     | `state.session()`  |
| `url`     | `URLSearchParams`    | `state.url()`      |
| `bucket`  | Storage Buckets API  | `state.bucket()`   |
| `server`  | `AsyncLocalStorage`  | `state.server()`   |

[Scope decision guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md) · [Persistence reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/persistence.md)

## API

Every instance shares the same core methods: `get`, `peek`, `set`, `patch`, `reset`, `destroy`, `subscribe`, `watch`, `intercept`, `onChange`

[API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md)

## Primitives

| Primitive | Description |
|-----------|-------------|
| `computed(deps, fn)` | Reactive derived value from one or more dependencies. Cached, lazy, read-only. |
| `select(source, fn)` | Lightweight single-source alternative to `computed`. |
| `effect(deps, fn)` | Side effect that re-runs when dependencies change. Supports cleanup. |
| `collection(key, options)` | Reactive array with `add`, `remove`, `update`, `find`, `findAll`, `has`, `clear`. |
| `readonly(instance)` | Read-only view of any instance. Zero runtime cost. |
| `previous(source)` | Tracks the previous value of a source instance. |

[Primitives reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/primitives.md)

## Utilities

| Utility | Description |
|---------|-------------|
| `batch(fn)` | Group updates so subscribers are notified once. |
| `withHistory(instance)` | Adds undo/redo to any state instance. |
| `withWatch(instance)` | Adds per-key change tracking to any instance. |
| `snapshot()` | Returns a read-only snapshot of all registered instances. |
| `shallowEqual(a, b)` | Shallow equality check for primitives, arrays, and plain objects. |
| `withServerSession(fn)` | Wraps a callback in `AsyncLocalStorage` context for `server` scope. |
| `configure(config)` | Set global defaults and event handlers. |

[Configure reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
