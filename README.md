<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

Every app juggles localStorage, URL params, sessionStorage, and in-memory state. **gjendje** replaces storage backends with a unified API. Choose where state lives. The rest is handled.

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
```

For in-memory state that doesn't persist, use `state` without a scope:

```ts
const store = state({ counter: 0 })
```

### Getting values

```ts
const state = store.get() // Returns the full state object
const counter = store.pick('counter') // Returns a single property by key
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

form.patch({ name: 'Alice' }) // only updates name
form.patch({ name: 'Bob', age: 30 }) // updates multiple properties at once
```

[More examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)

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

You can also configure global events:

```ts
configure({
  onError: ({ key, scope, error }) => {
    console.error(`[${key}] (${scope}) error:`, error)
  },
  onChange: ({ key, scope, value, previousValue }) => {
    console.log(`[${key}] (${scope}) changed:`, previousValue, '→', value)
  },
})
```

[Configure reference guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## Scopes

| Scope    | Backend              | Shortcut           |
|----------|----------------------|--------------------|
| `memory`  | In-memory            | `state()`          |
| `local`   | `localStorage`       | `state.local()`    |
| `session` | `sessionStorage`     | `state.session()`  |
| `url`     | `URLSearchParams`    | `state.url()`      |
| `bucket`  | Storage Buckets API  | `state.bucket()`   |
| `server`  | `AsyncLocalStorage`  | `state.server()`   |

[Scope decision guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md) · [Persistence reference guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/persistence.md)

## API

Every scope shares the same core API: `get`, `pick`, `set`, `patch`, `reset`, `subscribe`, `watch`, `intercept`, `use`, `destroy`

[API reference guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md)

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

[Derived state reference guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/derived.md)

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
