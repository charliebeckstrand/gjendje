<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

Every app juggles localStorage, sessionStorage, URL params, and in-memory state. gjendje replaces that all with a unified API. Choose where state lives. The rest is handled.

## Install

```sh
npm install gjendje
```

## Quick start

You can pass the scope as an option:

```ts
import { state } from 'gjendje'

const theme = state({ theme: 'light' }, { scope: 'local' })
```

Or use dot notation as a shorthand:

```ts
const theme = state.local({ theme: 'light' })
```

For in-memory state that doesn't persist, use `state` without a scope:

```ts
const store = state({ counter: 0 })
```

### Updating values

Replace the entire value with `set`, or use an updater function:

```ts
store.set({ counter: 1 })
store.set((prev) => ({ ...prev, counter: prev.counter + 1 }))
```

For object stores, `patch` lets you update specific properties without spreading:

```ts
const form = state({ name: '', email: '', age: 0 })

form.patch({ name: 'Alice' }) // only updates name, keeps email and age
form.patch({ name: 'Bob', age: 30 }) // updates multiple properties at once
```

[See all scopes and examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md)

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

| Scope    | Backend              | Shortcut           |
|----------|----------------------|--------------------|
| `memory`  | In-memory            | `state()`          |
| `local`   | `localStorage`       | `state.local()`    |
| `session` | `sessionStorage`     | `state.session()`  |
| `url`     | `URLSearchParams`    | `state.url()`      |
| `bucket`  | Storage Buckets API  | `state.bucket()`   |
| `server`  | `AsyncLocalStorage`  | `state.server()`   |

[Scope decision guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md)

## API

Every scope — `state.local`, `state.session`, `state.url`, `state.bucket`, and `state.server` — shares the same core API: `get`, `set`, `reset`, `subscribe`, `watch`, `intercept`, and more.

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
