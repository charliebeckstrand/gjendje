# Utilities

Helper functions and enhancers for state instances.

---

## `batch(fn)`

Runs all state updates inside `fn` as a single batch. Subscribers are notified once after all updates complete.

```ts
function batch(fn: () => void): void
```

```ts
import { batch, state } from 'gjendje'

const firstName = state({ firstName: '' })
const lastName = state({ lastName: '' })
const age = state({ age: 0 })

batch(() => {
  firstName.set('John')
  lastName.set('Doe')
  age.set(30)
})
// subscribers fire once, not three times
```

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `() => void` | A function containing one or more state updates |

- **Single notification** — subscribers deferred until batch completes, then flushed together.
- **Nesting** — nested `batch()` calls are safe. Notifications flush only on the outermost batch.
- **Primitives** — `computed`, `select`, `previous`, and `effect` all participate in batching.

</details>

---

## `snapshot()`

Returns a read-only snapshot of all registered state instances. Useful for debugging, logging, and DevTools integration.

```ts
function snapshot(): StateSnapshot[]
```

```ts
import { snapshot } from 'gjendje'

console.table(snapshot())
// [
//   { key: 'theme', scope: 'local', value: 'dark', isDestroyed: false },
//   { key: 'count', scope: 'memory', value: 42, isDestroyed: false },
// ]
```

> **Returns** `StateSnapshot[]`

```ts
interface StateSnapshot {
  key: string
  scope: Scope
  value: unknown
  isDestroyed: boolean
}
```

<details>
<summary>Details</summary>

- **Point-in-time** — returns a plain array, not reactive.
- **Destroyed instances** — included with `isDestroyed: true` and `value: undefined`.
- **All scopes** — captures instances from every scope.

</details>

---

## `shallowEqual(a, b)`

Shallow equality check for primitives, arrays, and plain objects. Returns `true` if values are structurally equal one level deep.

```ts
function shallowEqual(a: unknown, b: unknown): boolean
```

```ts
import { shallowEqual } from 'gjendje'

shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })             // true
shallowEqual([1, 2, 3], [1, 2, 3])                         // true
shallowEqual({ a: { nested: 1 } }, { a: { nested: 1 } })   // false — compared by reference
```

> **Returns** `boolean`

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `a` | `unknown` | First value |
| `b` | `unknown` | Second value |

- **Primitives** — uses `Object.is` (handles `NaN`, `+0`/`-0`).
- **Arrays** — compares length, then each element with `Object.is`.
- **Objects** — compares key count, then each value with `Object.is`. Only own enumerable keys.

</details>

---

## `withHistory(instance, options?)`

Enhances a state instance with undo/redo capabilities.

```ts
function withHistory<T>(
  instance: BaseInstance<T>,
  options?: { maxSize?: number },
): WithHistoryInstance<T>
```

```ts
import { state, withHistory } from 'gjendje'

const counter = state({ counter: 0 })
const h = withHistory(counter)

h.set(1)
h.set(2)
h.undo()  // counter is now 1
h.redo()  // counter is now 2
```

> **Returns** `WithHistoryInstance<T>` — extends `BaseInstance<T>` with history methods.

| Method / Property | Type | Description |
|-------------------|------|-------------|
| `undo()` | `() => void` | Revert to previous value |
| `redo()` | `() => void` | Re-apply last undone value |
| `canUndo` | `boolean` | Whether undo is available |
| `canRedo` | `boolean` | Whether redo is available |
| `clearHistory()` | `() => void` | Clear all history |

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `BaseInstance<T>` | The state instance to enhance |
| `options` | `{ maxSize?: number }` | Max history entries (default `50`) |

- **Capped history** — oldest entries drop when `maxSize` is exceeded.
- **Redo cleared on set** — any `set()` clears the redo stack.
- **Batching** — participates in `batch()`.

</details>

---

## `withWatch(instance)`

Enhances a state instance with per-key change tracking. The `watch()` method fires only when a specific property changes.

```ts
function withWatch<TIn extends BaseInstance<T>>(
  instance: TIn,
): TIn & WithWatch<T>
```

```ts
import { state, withWatch } from 'gjendje'

const user = state('user', { default: { name: 'Jane', age: 30 }, scope: 'memory' })
const w = withWatch(user)

w.watch('name', (name) => console.log('Name changed:', name))

w.set({ name: 'John', age: 30 })  // logs "Name changed: John"
w.set({ name: 'John', age: 31 })  // does not log — name unchanged
```

> **Returns** the original instance extended with a `watch()` method.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `BaseInstance<T>` | State instance holding an object value |

- **Per-key granularity** — only fires when the watched property changes, using `Object.is`.
- **Lazy subscription** — subscribes to the base instance only when the first watcher is added.
- **Multiple watchers** — watch multiple keys independently.

</details>

---

## `withServerSession(fn)`

Runs a function inside an isolated `AsyncLocalStorage` context for server-scoped state. Required when using `scope: 'server'` in Node.js.

```ts
function withServerSession<T>(fn: () => T): Promise<T>
```

**Import from** `gjendje/server`

```ts
import { state } from 'gjendje'
import { withServerSession } from 'gjendje/server'

const requestId = state('requestId', { default: '', scope: 'server' })

app.get('/api', async (req, res) => {
  await withServerSession(() => {
    requestId.set(req.id)
    return handleRequest(req, res)
  })
})
```

> **Returns** `Promise<T>` — resolves with the return value of `fn`.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `() => T` | Function to run inside the server session |

- **Per-request isolation** — each call creates a fresh store for server-scoped state.
- **Required wrapper** — `set()` on a server-scoped instance outside `withServerSession` throws.
- **Framework-agnostic** — works with Express, Fastify, Hono, or plain `http.createServer`.

</details>
