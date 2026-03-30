---
'gjendje': minor
---

## New primitives for v1.5.0

### `when(deps, predicate, options?)` — Conditional awaiter

Returns a `Promise<void>` that resolves when a predicate over reactive dependencies becomes true. Supports `timeout` and `AbortSignal` options.

```ts
await when([auth], ([user]) => user !== null)
await when([status], ([s]) => s === 'ready', { timeout: 5000 })
```

### `channel(name?)` — Event primitive

Lightweight typed pub/sub event channel. Fire-and-forget — no state stored.

```ts
const onClick = channel<{ x: number; y: number }>('click')
onClick.subscribe(({ x, y }) => console.log(x, y))
onClick.emit({ x: 100, y: 200 })
```

### `toSignal(instance)` / `fromSignal(signal)` — TC39 Signals interop

Bridge between gjendje instances and Signal-like objects:

- **`toSignal()`** wraps a gjendje instance as a Signal with a `.value` getter/setter
- **`fromSignal()`** creates a gjendje `ReadonlyInstance` backed by an external Signal

```ts
const sig = toSignal(counter)   // sig.value reads/writes counter
const inst = fromSignal(signal) // inst.get() mirrors signal.value
```

### `resource(fn, options?)` — Async state primitive

Reactive async data fetching with `data`, `loading`, and `error` states. Supports reactive dependencies for automatic refetching and race condition handling.

```ts
const users = resource(async () => fetch('/api/users').then(r => r.json()))
users.data.get()    // T | undefined
users.loading.get() // boolean
users.error.get()   // Error | undefined
users.refetch()     // re-trigger

// With reactive deps — auto-refetches on change
const user = resource([userId], async ([id]) => fetchUser(id))
```

### New error classes

- **`WhenTimeoutError`** — thrown when `when()` exceeds its timeout
- **`ResourceError`** — thrown when a `resource()` fetch fails
