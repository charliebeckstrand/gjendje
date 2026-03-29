# API

All methods available on state instances created with `state()`.

---

## `get()`

Returns the current value. Reactive — tracked by `computed` and `effect`.

```ts
get(): T
```

```ts
import { state } from 'gjendje'

const counter = state({ counter: 0 })

counter.get() // 0
```

> **Returns** `T`

---

## `peek()`

Reads the current value without reactive tracking. Use inside `computed` or `effect` when you need a value without creating a dependency.

```ts
peek(): T
```

```ts
import { state, computed } from 'gjendje'

const count = state({ count: 0 })
const label = state({ label: 'Count' })

const display = computed([count], ([c]) => {
  // peek() reads label without depending on it
  return `${label.peek()}: ${c}`
})
```

> **Returns** `T`

---

## `set(value)`

Replaces the current value. Accepts a direct value or an updater function.

```ts
set(value: T | ((prev: T) => T)): void
```

```ts
import { state } from 'gjendje'

const counter = state({ counter: 0 })

counter.set(5)
counter.set((prev) => prev + 1) // 6
```

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `T \| (prev: T) => T` | New value or updater function |

</details>

---

## `patch(partial, options?)`

Merges a partial object into the current value (shallow merge). Only available when `T` is an object type.

```ts
patch(partial: Partial<T>, options?: { strict?: boolean }): void
```

```ts
import { state } from 'gjendje'

const user = state({ user: { name: 'Jane', age: 30 } })

user.patch({ name: 'John' })
// { name: 'John', age: 30 }
```

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `partial` | `Partial<T>` | Keys to merge into the current value |
| `options` | `{ strict?: boolean }` | When `strict: true`, unknown keys are ignored and a warning is logged |

**Strict mode** — only merges keys that already exist:

```ts
user.patch({ name: 'John', role: 'admin' }, { strict: true })
// warns: patch("user") ignored unknown key "role" (strict mode).
// Result: { name: 'John', age: 30 }
```

</details>

---

## `reset()`

Restores the value to the `default` provided at creation.

```ts
reset(): void
```

```ts
import { state } from 'gjendje'

const theme = state('theme', { default: 'light', scope: 'local' })

theme.set('dark')
theme.reset() // 'light'
```

---

## `destroy()`

Tears down all listeners, interceptors, hooks, and storage resources. After destruction, a new `state()` call with the same key creates a fresh instance.

```ts
destroy(): void
```

```ts
import { state } from 'gjendje'

const temp = state({ temp: 42 })

temp.destroy()
temp.isDestroyed // true
```

---

## `subscribe(listener)`

Calls `listener` on every change. Returns an unsubscribe function.

```ts
subscribe(listener: (value: T) => void): Unsubscribe
```

```ts
import { state } from 'gjendje'

const count = state({ count: 0 })

const unsubscribe = count.subscribe((value) => {
  console.log('count:', value)
})

count.set(1) // logs "count: 1"
unsubscribe()
```

> **Returns** `Unsubscribe` — call to stop receiving updates.

---

## `watch(key, listener)`

Subscribes to a single key within an object value. Only fires when that key's value changes.

```ts
watch<K extends keyof T>(key: K, listener: (value: T[K]) => void): Unsubscribe
```

```ts
import { state } from 'gjendje'

const user = state('user', { default: { name: 'Jane', age: 30 }, scope: 'memory' })

user.watch('name', (name) => {
  console.log('name:', name)
})

user.patch({ age: 31 })    // does not fire — name unchanged
user.patch({ name: 'John' }) // logs "name: John"
```

> **Returns** `Unsubscribe`

---

## `intercept(fn)`

Registers a pre-set interceptor that can transform or reject values before they're stored. Return `prev` to reject the update.

```ts
intercept(fn: (next: T, prev: T) => T): Unsubscribe
```

```ts
import { state } from 'gjendje'

const volume = state({ volume: 50 })

volume.intercept((next) => Math.max(0, Math.min(100, next)))

volume.set(150) // stored as 100
volume.set(-10) // stored as 0
```

> **Returns** `Unsubscribe` — call to remove the interceptor.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(next: T, prev: T) => T` | Receives next and previous values. Return the value to store. |

- Multiple interceptors run in registration order.

</details>

---

## Serializer

Custom serializer for types that don't round-trip through JSON.

```ts
interface Serializer<T> {
  stringify(value: T): string
  parse(raw: string): T
}
```

```ts
import { state } from 'gjendje'

const lastLogin = state('lastLogin', {
  default: new Date(),
  scope: 'local',
  serialize: {
    stringify: (d) => d.toISOString(),
    parse: (raw) => new Date(raw),
  },
})
```

---

## `onChange(fn)`

Registers a post-set handler that fires after each value change. Return value is ignored.

```ts
onChange(fn: (next: T, prev: T) => void): Unsubscribe
```

```ts
import { state } from 'gjendje'

const theme = state.local({ theme: 'light' })

theme.onChange((next, prev) => {
  console.log(`theme: ${prev} -> ${next}`)
})

theme.set('dark') // logs "theme: light -> dark"
```

> **Returns** `Unsubscribe` — call to remove the handler.

<details>
<summary>Details</summary>

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(next: T, prev: T) => void` | Receives next and previous values |

- Multiple handlers run in registration order.

</details>

---

## Type hierarchy

| Type | Extends | Methods |
|------|---------|---------|
| `ReadonlyInstance<T>` | — | `get`, `peek`, `subscribe`, `destroy` |
| `BaseInstance<T>` | `ReadonlyInstance<T>` | `set`, `reset`, `intercept`, `onChange` |
| `StateInstance<T>` | `BaseInstance<T>` | `watch`, `patch` |

`computed` and `select` return `ReadonlyInstance`. `collection` returns `CollectionInstance` (extends `BaseInstance`).
