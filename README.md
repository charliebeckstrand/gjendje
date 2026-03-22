<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

Every app juggles localStorage, sessionStorage, URL params, and in-memory state — each with its own API. **gjendje** replaces it all with a single primitive. Choose where state lives. The rest is handled.

## Install

```sh
npm install gjendje
```

## Quick start

```ts
import { local, session, url, bucket, server } from 'gjendje'

// localStorage — survives refresh, works across tabs
const theme = local({ theme: 'light' })

// sessionStorage — survives refresh, gone when tab closes
const draft = session({ draft: '' })

// URL params — shareable via address bar
const filters = url({ q: '' })

// Storage Bucket — isolated, quota-managed, expirable
const cache = bucket({ cache: [] }, { bucket: { name: 'app-cache', expires: '7d' } })

// AsyncLocalStorage — server-side, session-scoped
const user = server({ user: null })
```

For in-memory state that doesn't persist, use `state` directly:

```ts
import { state } from 'gjendje'

const counter = state({ counter: 0 })

counter.set((prev) => prev + 1)
```

## Configure

Sets global defaults for all state instances.

```ts
// app.ts
import { configure } from 'gjendje'

configure({ scope: 'local' })
```

Now every `state` call inherits that default:

```ts
const theme = state({ theme: 'light' })

theme.scope // 'local' — derived from configure
```

[Full configure reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## Scopes

| Scope    | Backend              | Shortcut    |
|----------|----------------------|-------------|
| `memory` | In-memory            | `state()`   |
| `local`  | `localStorage`       | `local()`   |
| `tab`    | `sessionStorage`     | `session()` |
| `url`    | `URLSearchParams`    | `url()`     |
| `bucket` | Storage Buckets API  | `bucket()`  |
| `server` | `AsyncLocalStorage`  | `server()`  |

[Scope decision guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md)

## API

#### `get()`
Returns the current value. Reactive — triggers tracking in `computed` and `effect`.

#### `set(value)` / `set(prev => next)`
Replaces the current value. Accepts a direct value or an updater function that receives the previous value.

#### `subscribe(fn)`
Calls `fn` on every change. Returns an `unsubscribe` function.

#### `watch(key, fn)`
Like `subscribe`, but scoped to a single key within an object value. Only fires when that key changes.

#### `intercept(fn)`
Receives `(next, prev)` before each update. Return the value to store, or return `prev` to reject the change. Returns an `unsubscribe` function.

[Full API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md) · [Persistence reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/persistence.md)

## Derived state

#### `computed(deps, fn)`
Derives a reactive, read-only value from one or more state dependencies. Recomputes only when a dependency changes and caches the result between changes. Returns a `ReadonlyInstance` — no `set()` or `reset()`.

#### `select(source, fn)`
Lightweight single-dependency alternative to `computed`. No array allocation or dependency loop — just `source.get()` → `fn(value)`. Ideal for projecting a single field or transformation.

#### `collection(key, options)`
Reactive array with first-class mutation methods — `add`, `remove`, `update`, `find`, `findAll`, `has`, `clear`. Supports all the same scopes, persistence, validation, and migration as `state`.

#### `effect(deps, fn)`
Runs a side effect immediately and re-runs whenever any dependency changes. The callback can return a cleanup function that runs before the next execution and on `stop()`. Returns an `EffectHandle` with a `stop()` method.

#### `readonly(instance)`
Creates a read-only view of any state or computed instance. Exposes `get`, `peek`, `subscribe`, and lifecycle — but no `set`, `reset`, `intercept`, or `use`. Zero runtime cost.

[Full derived state reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/derived.md)

## Examples

Real-world patterns and recipes — persistence with migration, cross-tab sync, derived state, collections, and more.

[Examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
