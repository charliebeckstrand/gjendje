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

---

## `when(deps, predicate, options?)`

Returns a promise that resolves when a predicate over reactive dependencies becomes true. A one-shot conditional awaiter.

```ts
function when<TDeps extends ReadonlyArray<ReadonlyInstance<unknown>>>(
  deps: TDeps,
  predicate: (values: DepValues<TDeps>) => boolean,
  options?: WhenOptions,
): Promise<void>
```

```ts
import { state, when } from 'gjendje'

const auth = state({ auth: null as string | null })

// Wait for authentication
await when([auth], ([user]) => user !== null)

// With timeout
await when([auth], ([user]) => user !== null, { timeout: 5000 })

// With AbortController
const controller = new AbortController()
await when([auth], ([user]) => user !== null, { signal: controller.signal })
```

> **Returns** `Promise<void>` — resolves when the predicate is satisfied. Not a reactive instance.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `deps` | `ReadonlyArray<ReadonlyInstance>` | State instances to observe |
| `predicate` | `(values) => boolean` | Condition to wait for |
| `options.timeout` | `number` | Rejects with `WhenTimeoutError` if exceeded |
| `options.signal` | `AbortSignal` | Rejects if the signal is aborted |

- **Immediate check** — if the predicate is already true, resolves synchronously without subscribing.
- **Cleanup** — subscriptions, timers, and abort listeners are cleaned up on settlement.
- **One-shot** — resolves at most once, then unsubscribes from all dependencies.

</details>

---

## `resource(fn, options?)`

Async data fetching primitive with reactive `data`, `loading`, and `error` states. Handles race conditions and supports reactive dependencies for auto-refetching.

```ts
function resource<T>(
  fn: () => Promise<T>,
  options?: ResourceOptions<T>,
): ResourceInstance<T>

function resource<TDeps, T>(
  deps: TDeps,
  fn: (values: DepValues<TDeps>) => Promise<T>,
  options?: ResourceOptions<T>,
): ResourceInstance<T>
```

```ts
import { state, resource } from 'gjendje'

// Basic async fetch
const users = resource(async () => {
  const res = await fetch('/api/users')
  return res.json()
})

users.data.get()     // T | undefined
users.loading.get()  // boolean
users.error.get()    // Error | undefined
users.refetch()      // re-trigger manually

// With reactive deps — auto-refetches when deps change
const userId = state({ userId: 1 })

const user = resource([userId], async ([id]) => {
  const res = await fetch(`/api/users/${id}`)
  return res.json()
})
```

> **Returns** `ResourceInstance<T>`.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `() => Promise<T>` | Async fetch function |
| `deps` | `ReadonlyArray<ReadonlyInstance>` | Reactive dependencies that trigger refetch |
| `options.key` | `string` | Optional debugging key |
| `options.initialData` | `T` | Initial data value before first fetch |

### ResourceInstance

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `data` | `ReadonlyInstance<T \| undefined>` | The resolved data |
| `loading` | `ReadonlyInstance<boolean>` | Whether a fetch is in flight |
| `error` | `ReadonlyInstance<Error \| undefined>` | The last error |
| `refetch()` | `() => void` | Re-trigger the async function |
| `destroy()` | `() => void` | Tear down all internal state |
| `isDestroyed` | `boolean` | Whether destroyed |

- **Race condition safe** — stale responses from superseded fetches are discarded.
- **Composable** — `data`, `loading`, and `error` are `ReadonlyInstance` values, so they work as dependencies for `computed()`, `effect()`, `when()`, etc.
- **Batching** — state transitions (loading + data/error) are grouped in a single `batch()`.
- **Auto-refetch** — when deps are provided, any dependency change triggers a new fetch.

</details>

---

## `channel(name?)`

Lightweight typed pub/sub event channel. Fire-and-forget — no state stored, no persistence.

```ts
function channel<T>(nameOrOptions?: string | ChannelOptions): ChannelInstance<T>
```

```ts
import { channel } from 'gjendje'

const onClick = channel<{ x: number; y: number }>('click')

const unsub = onClick.subscribe(({ x, y }) => {
  console.log(`Clicked at ${x}, ${y}`)
})

onClick.emit({ x: 100, y: 200 })

unsub()          // stop listening
onClick.destroy() // remove all listeners
```

> **Returns** `ChannelInstance<T>`.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `nameOrOptions` | `string \| { key?: string }` | Channel name or options. Auto-generates a key if omitted. |

### ChannelInstance

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `key` | `string` | Channel name |
| `emit(payload)` | `(payload: T) => void` | Fire an event to all subscribers |
| `subscribe(listener)` | `(fn: (value: T) => void) => Unsubscribe` | Listen for events |
| `destroy()` | `() => void` | Remove all listeners |
| `isDestroyed` | `boolean` | Whether destroyed |

- **Not state** — channels are ephemeral event buses. No `get()`, no persistence, no current value.
- **Safe** — listener errors are caught internally and do not prevent other listeners from firing.
- **Emit after destroy** — is a no-op.

</details>

---

## `toSignal(instance)` / `fromSignal(signal)`

Bridge between gjendje instances and TC39 Signal-like objects.

```ts
function toSignal<T>(instance: BaseInstance<T>): WritableSignal<T>
function toSignal<T>(instance: ReadonlyInstance<T>): Signal<T>

function fromSignal<T>(
  signal: SignalLike<T>,
  options?: { key?: string },
): ReadonlyInstance<T>
```

```ts
import { state, computed, toSignal, fromSignal } from 'gjendje'

// Wrap a gjendje instance as a Signal
const counter = state({ counter: 0 })
const sig = toSignal(counter)

sig.value         // 0 (reads counter.get())
sig.value = 5     // calls counter.set(5)

// Read-only signals from computed
const doubled = computed([counter], ([n]) => n * 2)
const readSig = toSignal(doubled)
readSig.value     // 10 (read-only, no setter)

// Create a gjendje instance from an external Signal
const inst = fromSignal(externalSignal)
inst.get()        // mirrors externalSignal.value
inst.subscribe(v => console.log(v))
```

> **`toSignal`** returns `WritableSignal<T>` for writable instances, `Signal<T>` for read-only instances.
>
> **`fromSignal`** returns `ReadonlyInstance<T>` backed by the external signal's subscription.

<details>
<summary>Details</summary>

### Signal interfaces

```ts
interface Signal<T> {
  readonly value: T
  subscribe(listener: (value: T) => void): () => void
}

interface WritableSignal<T> extends Signal<T> {
  value: T  // getter + setter
}

interface SignalLike<T> {
  readonly value: T
  subscribe(listener: (value: T) => void): () => void
}
```

### toSignal

- **Zero-cost** — thin wrapper, no subscriptions created. Delegates to `get()`/`set()`.
- **Works with any instance** — `state`, `computed`, `select`, `previous`, `readonly`, `collection`.
- **Duck-typed** — detects writable via `typeof instance.set === 'function'`.

### fromSignal

- **Mirrors updates** — subscribes to the external signal and notifies gjendje subscribers on change.
- **Equality check** — skips notification when value is unchanged (`Object.is`).
- **Destroy** — unsubscribes from the external signal and clears all listeners.
- **Scope** — always `'memory'`.

</details>
