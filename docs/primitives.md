# Primitives

Reactive derived values and side effects. All primitives share the base instance methods documented in the [API reference](api.md).

---

## `computed(deps, fn, options?)`

Derives a reactive, read-only value from one or more state dependencies.

```ts
function computed<TDeps extends ReadonlyArray<BaseInstance<unknown>>, TResult>(
  deps: TDeps,
  fn: (values: DepValues<TDeps>) => TResult,
  options?: { key?: string },
): ComputedInstance<TResult>
```

```ts
import { state, computed } from 'gjendje'

const firstName = state({ firstName: 'Jane' })
const lastName = state({ lastName: 'Doe' })

const fullName = computed([firstName, lastName], ([first, last]) => {
  return `${first} ${last}`
})

fullName.get() // 'Jane Doe'
```

> **Returns** `ComputedInstance<TResult>` — a `ReadonlyInstance` (no `set` or `reset`).

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `deps` | `ReadonlyArray<BaseInstance>` | State instances to depend on |
| `fn` | `(values) => TResult` | Compute function — receives dependency values as a tuple |
| `options` | `{ key?: string }` | Optional debugging key |

- **Lazy caching** — only recomputes when a dependency changes.
- **Composition** — computed values can depend on other computed values.
- **Batching** — participates in `batch()`. Notifications deferred until batch completes.

</details>

---

## `select(source, fn, options?)`

Derives a reactive, read-only value from a **single** source. A lighter alternative to `computed` — no array allocation, no dependency loop.

```ts
function select<TSource, TResult>(
  source: ReadonlyInstance<TSource>,
  fn: (value: TSource) => TResult,
  options?: { key?: string },
): SelectInstance<TResult>
```

```ts
import { state, select } from 'gjendje'

const user = state('user', { default: { name: 'Jane', age: 30 }, scope: 'memory' })

const userName = select(user, (u) => u.name)

userName.get() // 'Jane'
```

> **Returns** `SelectInstance<TResult>` — a `ReadonlyInstance` (no `set` or `reset`).

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `ReadonlyInstance<TSource>` | The single source to derive from |
| `fn` | `(value: TSource) => TResult` | Transform function |
| `options` | `{ key?: string }` | Optional debugging key |

- **Use `select` for one source, `computed` for multiple.**
- **Identity check** — skips notification when derived value is unchanged (`===`).
- **Lazy caching** — only recomputes when the source changes.

</details>

---

## `previous(source, options?)`

Tracks the previous value of a source instance. Returns `undefined` until the source changes for the first time.

```ts
function previous<T>(
  source: ReadonlyInstance<T>,
  options?: { key?: string },
): PreviousInstance<T | undefined>
```

```ts
import { state, previous } from 'gjendje'

const count = state({ count: 0 })
const prev = previous(count)

prev.get() // undefined (no changes yet)

count.set(1)
prev.get() // 0

count.set(2)
prev.get() // 1
```

> **Returns** `PreviousInstance<T | undefined>` — a `ReadonlyInstance` holding the prior value.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `ReadonlyInstance<T>` | The source to track |
| `options` | `{ key?: string }` | Optional debugging key |

- **Undefined initially** — returns `undefined` until the source changes at least once.
- **Single value** — only stores the immediately preceding value, not a full history.
- **Batching** — participates in `batch()`.

</details>

---

## `readonly(instance)`

Creates a read-only view of any state or computed instance. Write methods are stripped from the type. Zero runtime cost.

```ts
function readonly<T>(instance: ReadonlyInstance<T>): ReadonlyInstance<T>
```

```ts
import { state, readonly } from 'gjendje'

const theme = state.local({ theme: 'light' })

// Expose a read-only view to consumers
export const themeValue = readonly(theme)

themeValue.get()      // 'light'
// themeValue.set(...) — not available (compile error)
```

> **Returns** `ReadonlyInstance<T>` — a view with no write methods.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `ReadonlyInstance<T>` | The source instance to wrap |

- **Pure delegation** — all reads and subscriptions go through to the source.
- **Type safety** — `set`, `reset`, `intercept`, `onChange` are stripped from the type.

</details>

---

## `collection(key, options)`

Reactive array with first-class mutation methods. Supports all the same options as `state()` — scope, persistence, validation, migration.

```ts
function collection<T>(key: string, options: StateOptions<T[]>): CollectionInstance<T>
```

```ts
import { collection } from 'gjendje'

interface Todo {
  id: string
  text: string
  done: boolean
}

const todos = collection<Todo>('todos', { default: [], scope: 'local' })

todos.add({ id: '1', text: 'Buy milk', done: false })
todos.update((t) => t.id === '1', { done: true })
todos.remove((t) => t.done)
todos.get() // []
```

> **Returns** `CollectionInstance<T>` — extends `BaseInstance<T[]>`.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique identifier |
| `options` | `StateOptions<T[]>` | Same options as `state()` |

### Reading

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `() => T[]` | Current array |
| `peek()` | `() => T[]` | Snapshot without reactive tracking |
| `size` | `readonly number` | Number of items |
| `find(fn)` | `(fn: (item: T) => boolean) => T \| undefined` | First match |
| `findAll(fn)` | `(fn: (item: T) => boolean) => T[]` | All matches |
| `has(fn)` | `(fn: (item: T) => boolean) => boolean` | True if any item matches |

### Writing

| Method | Signature | Description |
|--------|-----------|-------------|
| `add(...items)` | `(...items: T[]) => void` | Append items |
| `remove(fn, opts?)` | `(fn, opts?: { one?: boolean }) => void` | Remove matches. `{ one: true }` for first only. |
| `update(fn, patch, opts?)` | `(fn, patch, opts?: { one?: boolean }) => void` | Patch matches with partial or updater function |
| `clear()` | `() => void` | Remove all items |
| `set(value)` | `(value: T[] \| ((prev: T[]) => T[])) => void` | Replace entire array |
| `reset()` | `() => void` | Restore to default |

### Reactive

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe(fn)` | `(fn: (value: T[]) => void) => Unsubscribe` | Listen for any change |
| `watch(key, fn)` | `(key: keyof T, fn: (items: T[]) => void) => Unsubscribe` | Listen for changes to a specific key across all items |
| `intercept(fn)` | `(fn: (next: T[], prev: T[]) => T[]) => Unsubscribe` | Pre-set interceptor |
| `onChange(fn)` | `(fn: (next: T[], prev: T[]) => void) => Unsubscribe` | Post-set handler |

</details>

---

## `effect(deps, fn, options?)`

Runs a side effect when dependencies change. Runs immediately at creation, then re-runs on any dependency change.

```ts
function effect<TDeps extends ReadonlyArray<BaseInstance<unknown>>>(
  deps: TDeps,
  fn: (values: DepValues<TDeps>) => (() => void) | undefined,
  options?: EffectOptions,
): EffectHandle
```

```ts
import { state, effect } from 'gjendje'

const theme = state.local({ theme: 'light' })
const fontSize = state({ fontSize: 16 })

const handle = effect([theme, fontSize], ([t, f]) => {
  document.body.setAttribute('data-theme', t)
  document.documentElement.style.fontSize = `${f}px`

  return () => {
    document.body.removeAttribute('data-theme')
  }
})

// Later: stop the effect
handle.stop()
```

> **Returns** `EffectHandle` — call `handle.stop()` to tear down.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `deps` | `ReadonlyArray<BaseInstance>` | State instances to track |
| `fn` | `(values) => cleanup \| undefined` | Effect callback. May return a cleanup function. |
| `options` | `{ key?: string }` | Optional key for debugging and error attribution |

- **Cleanup** — if the callback returns a function, it runs before the next execution and on `stop()`.
- **Error reporting** — effect callback and cleanup errors are routed through `onError` (if configured) so they appear alongside other gjendje errors.
- **Framework-agnostic** — works in React, Vue, Svelte, vanilla JS, or Node.
- **Batching** — participates in `batch()`.

</details>
