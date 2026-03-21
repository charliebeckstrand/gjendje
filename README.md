<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

**gjendje** unifies state management across storage backends.

## Install

```sh
npm install gjendje
```

## Configure

Sets global defaults for all state instances.

Call once at your app entry point.

```ts
import { configure } from 'gjendje'

configure({ scope: 'local' })
```

[Full configure reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## Usage

```ts
import { state } from 'gjendje'

const theme = state('theme', { default: 'light' })

theme.scope // 'local' — derived from configure
```

## Scopes

|Scope      |Description                                             |
|-----------|--------------------------------------------------------|
|`render`   | `memory` |
|`local`    |`localStorage` |                   
|`server`   |`AsyncLocalStorage` |
|`bucket`   | `Storage Buckets API ` |
|`url`      |`URLSearchParams` |
|`tab`      |`sessionStorage` |

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

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
