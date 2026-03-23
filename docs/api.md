# API

## `get()`

```ts
get(): T
```

Returns the current value. Reactive — tracked by `computed` and `effect`.

---

## `peek()`

```ts
peek(): T
```

Reads the current value without reactive tracking. Useful when you need the value inside a `computed` or `effect` without creating a dependency.

---

## `set(value)`

```ts
set(value: T | ((prev: T) => T)): void
```

Replaces the current value. Accepts a direct value or an updater function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `T \| (prev: T) => T` | New value or updater function |

---

## `patch(partial, options?)`

```ts
patch(partial: Partial<T>, options?: { strict?: boolean }): void
```

Merges a partial object into the current value. Only available when `T` is an object type.

```ts
const user = state({ user: { name: 'Jane', age: 30 } })

// Instead of: user.set(prev => ({ ...prev, name: 'John' }))
user.patch({ name: 'John' })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `partial` | `Partial<T>` | Object with keys to merge into the current value |
| `options` | `{ strict?: boolean }` | Optional. When `strict: true`, unknown keys are ignored and a warning is logged |

**Strict mode** — only merges keys that already exist on the current value:

```ts
user.patch({ name: 'John', role: 'admin' }, { strict: true })
// ⚠ warns: patch("user") ignored unknown key "role" (strict mode).
// Result: { name: 'John', age: 30 } — "role" was not added
```

---

## `reset()`

```ts
reset(): void
```

Restores the value to the `default` provided at creation.

---

## `destroy()`

```ts
destroy(): void
```

Tears down all listeners, interceptors, hooks, and storage resources. After destruction, the next `state()` call with the same key creates a fresh instance.

---

## `subscribe(listener)`

```ts
subscribe(listener: (value: T) => void): Unsubscribe
```

Calls `listener` on every change. Returns an `unsubscribe` function.

---

## `watch(key, listener)`

```ts
watch<K extends keyof T>(key: K, listener: (value: T[K]) => void): Unsubscribe
```

Subscribes to a single key within an object value. Only fires when that key's value changes.

---

## `intercept(fn)`

```ts
intercept(fn: (next: T, prev: T) => T): Unsubscribe
```

Registers a pre-set interceptor. Receives `(next, prev)` and returns the value to store. Return `prev` to reject. Multiple interceptors run in registration order.

---

## `onChange(fn)`

```ts
onChange(fn: (next: T, prev: T) => void): Unsubscribe
```

Registers a post-set handler. Receives `(next, prev)`. Return value is ignored. Multiple handlers run in registration order.

---

## Type hierarchy

- **`ReadonlyInstance<T>`** — `get`, `peek`, `subscribe`, `ready`, identity, `destroy`
- **`BaseInstance<T>`** — extends `ReadonlyInstance` with `set`, `reset`, `intercept`, `onChange`
- **`StateInstance<T>`** — extends `BaseInstance` with `watch`, `patch`

`computed` returns a `ReadonlyInstance`. `collection` returns a `CollectionInstance` (extends `BaseInstance`).

---

## Serializer

```ts
interface Serializer<T> {
  stringify(value: T): string
  parse(raw: string): T
}
```

Custom serializer for types that don't round-trip through JSON. When provided, migration and validation are skipped.
