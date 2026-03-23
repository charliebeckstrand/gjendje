# Utilities

## `batch(fn)`

```ts
function batch(fn: () => void): void
```

Runs all state updates inside `fn` as a single batch. Subscribers are notified once after all updates complete, rather than once per individual update.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `() => void` | A function containing one or more state updates |

```ts
import { batch, state } from 'gjendje'

const firstName = state('first', { default: '', scope: 'memory' })
const lastName = state('last', { default: '', scope: 'memory' })
const age = state('age', { default: 0, scope: 'memory' })

batch(() => {
  firstName.set('John')
  lastName.set('Doe')
  age.set(30)
})
// subscribers fire once, not three times
```

### Behavior
- **Single notification** — all subscribers are deferred until the batch completes, then flushed together.
- **Nesting** — nested `batch()` calls are safe. Notifications flush only when the outermost batch completes.
- **Primitives** — `computed`, `select`, `previous`, and `effect` all participate in batching. Derived values recompute once with the final state.

---

## `snapshot()`

```ts
function snapshot(): StateSnapshot[]
```

Returns a read-only snapshot of all registered state instances. Useful for debugging, logging, and DevTools integration.

**Returns** `StateSnapshot[]`

```ts
interface StateSnapshot {
  key: string
  scope: Scope
  value: unknown
  isDestroyed: boolean
}
```

```ts
import { snapshot } from 'gjendje'

console.table(snapshot())
// [
//   { key: 'theme', scope: 'local', value: 'dark', isDestroyed: false },
//   { key: 'count', scope: 'memory', value: 42, isDestroyed: false },
// ]
```

### Behavior
- **Point-in-time** — returns a plain array of objects. The array is not reactive.
- **Destroyed instances** — included in the snapshot with `isDestroyed: true` and `value: undefined`.
- **All scopes** — captures instances from every scope (`memory`, `local`, `session`, `url`, `bucket`, `server`).

---

## `shallowEqual(a, b)`

```ts
function shallowEqual(a: unknown, b: unknown): boolean
```

Shallow equality check for primitives, arrays, and plain objects. Returns `true` if the two values are structurally equal at one level deep.

| Parameter | Type | Description |
|-----------|------|-------------|
| `a` | `unknown` | First value |
| `b` | `unknown` | Second value |

**Returns** `boolean`

```ts
import { shallowEqual } from 'gjendje'

shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 }) // true
shallowEqual([1, 2, 3], [1, 2, 3])             // true
shallowEqual({ a: { nested: 1 } }, { a: { nested: 1 } }) // false — nested objects are compared by reference
```

### Behavior
- **Primitives** — uses `Object.is` (handles `NaN`, `+0`/`-0`).
- **Arrays** — compares length, then each element with `Object.is`.
- **Objects** — compares key count, then each value with `Object.is`. Only checks own enumerable keys.
- **One level deep** — nested objects and arrays are compared by reference, not recursively.

---

## `withHistory(instance, options?)`

```ts
function withHistory<T>(
  instance: BaseInstance<T>,
  options?: HistoryOptions,
): WithHistoryInstance<T>
```

Enhances a state instance with undo/redo capabilities.

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `BaseInstance<T>` | The state instance to enhance |
| `options` | `HistoryOptions` | Optional — `{ maxSize?: number }` (default `50`) |

**Returns** `WithHistoryInstance<T>` — extends `BaseInstance<T>` with history methods.

```ts
import { state, withHistory } from 'gjendje'

const counter = state('counter', { default: 0, scope: 'memory' })
const h = withHistory(counter)

h.set(1)
h.set(2)
h.undo()   // counter is now 1
h.redo()   // counter is now 2
```

### Instance methods

| Method / Property | Signature | Description |
|-------------------|-----------|-------------|
| `undo()` | `() => void` | Revert to the previous value. No-op if there is no history. |
| `redo()` | `() => void` | Re-apply the last undone value. No-op if there is nothing to redo. |
| `canUndo` | `readonly boolean` | Whether `undo()` will have an effect |
| `canRedo` | `readonly boolean` | Whether `redo()` will have an effect |
| `clearHistory()` | `() => void` | Clear all history (past and future) |
| `destroy()` | `() => void` | Clean up history and destroy the underlying instance |

All other `BaseInstance` methods (`get`, `peek`, `set`, `reset`, `subscribe`, `intercept`, `onChange`) delegate to the original instance.

### Behavior
- **Capped history** — past entries are limited to `maxSize` (default `50`). Oldest entries are dropped when the limit is exceeded.
- **Redo cleared on set** — any call to `set()` clears the redo stack, like a text editor.
- **Navigation is transparent** — `undo()` and `redo()` trigger the same subscriber notifications as a regular `set()`.
- **Batching** — participates in `batch()`. Undo/redo notifications are deferred like any other state update.

---

## `withWatch(instance)`

```ts
function withWatch<TIn extends BaseInstance<any>>(
  instance: TIn,
): TIn & WithWatch<T>
```

Enhances a state instance with per-key change tracking. The `watch()` method fires only when a specific property of an object value changes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `BaseInstance<T>` | The state instance to enhance (must hold an object value) |

**Returns** the original instance type extended with a `watch()` method.

```ts
import { state, withWatch } from 'gjendje'

const user = state('user', { default: { name: 'Jane', age: 30 }, scope: 'memory' })
const w = withWatch(user)

w.watch('name', (name) => console.log('Name changed:', name))

w.set({ name: 'John', age: 30 })  // logs "Name changed: John"
w.set({ name: 'John', age: 31 })  // does not log — name unchanged
```

### Instance methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `watch(key, fn)` | `(key: keyof T, fn: (value: T[K]) => void) => Unsubscribe` | Listen for changes to a specific property. Returns an unsubscribe function. |
| `destroy()` | `() => void` | Clean up all watchers and destroy the underlying instance |

All other instance methods delegate to the original instance.

### Behavior
- **Per-key granularity** — only fires when the watched property actually changes, using `Object.is` for comparison.
- **Lazy subscription** — the internal subscription to the base instance is created only when the first watcher is added.
- **Multiple watchers** — you can watch multiple keys independently. Each watcher is notified only for its key.
- **Batching** — participates in `batch()`. Notifications are deferred like any other state update.

---

## `withServerSession(fn)`

```ts
function withServerSession<T>(fn: () => T): Promise<T>
```

Runs a function inside an isolated `AsyncLocalStorage` context for server-scoped state. Required when using `scope: 'server'` in Node.js to ensure per-request isolation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `() => T` | Function to run inside the server session |

**Returns** `Promise<T>` — resolves with the return value of `fn`.

**Import from** `gjendje/server` — this export is separate to avoid pulling `node:async_hooks` into client bundles.

```ts
import { state } from 'gjendje'
import { withServerSession } from 'gjendje/server'

const requestId = state('requestId', { default: '', scope: 'server' })

// Express / Node.js handler
app.get('/api', async (req, res) => {
  await withServerSession(() => {
    requestId.set(req.id)
    // all state reads/writes inside this callback are isolated to this request
    return handleRequest(req, res)
  })
})
```

### Behavior
- **Per-request isolation** — each call to `withServerSession` creates a fresh `Map` store. State instances using `scope: 'server'` read and write from this store.
- **Required wrapper** — calling `set()` on a server-scoped instance outside of `withServerSession` throws an error.
- **Nesting** — nested sessions create independent stores. The inner session does not inherit the outer session's state.
- **Framework-agnostic** — works with Express, Fastify, Hono, plain `http.createServer`, or any Node.js request handler.
