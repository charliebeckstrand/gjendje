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

## Quick start

```ts
import { state } from 'gjendje'

// Pass scope as an option
const theme = state({ theme: 'light' }, { scope: 'local' })

// Or use dot notation
const theme = state.local({ theme: 'light' })

theme.get()        // 'light'
theme.set('dark')  // persisted to localStorage
theme.reset()      // back to 'light'
```

For in-memory state that doesn't persist:

```ts
const user = state({ name: 'John', age: 30 })
```

Use `patch` to update specific properties without spreading:

```ts
user.patch({ name: 'Jane' })
```

[More examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)

## Scopes

| Scope    | Backend              | Shortcut           |
|----------|----------------------|--------------------|
| `memory`  | In-memory            | `state()`          |
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
| `collection(key, options)` | Reactive array with `add`, `remove`, `update`, `find`, `has`, `clear`. |
| `readonly(instance)` | Read-only view of any instance. Zero runtime cost. |
| `previous(source)` | Tracks the previous value of a source instance. |

[Primitives reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/primitives.md)

## Utilities

| Utility | Description |
|---------|-------------|
| `batch(fn)` | Group updates so subscribers are notified once. |
| `withHistory(instance)` | Adds undo/redo to any state instance. |
| `snapshot()` | Returns a read-only snapshot of all registered instances. |
| `configure(config)` | Set global defaults and event handlers. |

[Configure reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
