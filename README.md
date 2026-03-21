<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

**gjendje** unifies state management across storage backends.

## Install

```sh
npm install gjendje
```

## Configure

Sets global defaults for all state instances. Call once at your app entry point.

```ts
import { configure, state } from 'gjendje'

configure({ scope: 'local' })

const theme = state('theme', { default: 'light' })

theme.scope // 'local'
```

[Full configure reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## Scopes

|Scope      |Description                                             |
|-----------|--------------------------------------------------------|
|`render`   | `memory` |
|`local`    |`localStorage`                      |
|`server`   |`AsyncLocalStorage`                            |
|`bucket`   | `Storage Buckets API ` |
|`url`      |`URLSearchParams` |
|`tab`      |`sessionStorage` |

## API

Every `state()` instance exposes the same interface regardless of scope.

#### `get()`
Returns the current value. Reactive — triggers tracking in `computed` and `effect`.

#### `set(value)` / `set(prev => next)`
Replaces the current value. Accepts a direct value or an updater function that receives the previous value.

#### `intercept(fn)`
Receives `(next, prev)` before each update. Return the value to store, or return `prev` to reject the change. Returns an `unsubscribe` function.

#### `subscribe(fn)`
Calls `fn` on every change. Returns an `unsubscribe` function.

#### `watch(key, fn)`
Like `subscribe`, but scoped to a single key within an object value. Only fires when that key changes.

[Full API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md)

## Derived state

Primitives that build on top of `state` to handle computed values, collections, and side effects.

#### `computed(deps, fn)`
Derives a reactive, read-only value from one or more state dependencies. Recomputes only when a dependency changes and caches the result between changes. Returns a `ReadonlyInstance` — no `set()` or `reset()`.

#### `collection(key, options)`
Reactive array with first-class mutation methods — `add`, `remove`, `update`, `find`, `findAll`, `has`, `clear`. Supports all the same scopes, persistence, validation, and migration as `state`.

#### `effect(deps, fn)`
Runs a side effect immediately and re-runs whenever any dependency changes. The callback can return a cleanup function that runs before the next execution and on `stop()`. Returns an `EffectHandle` with a `stop()` method.

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
