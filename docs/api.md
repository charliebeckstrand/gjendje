# API

## `state(key, options)`

Creates a named, reactive value in a specific scope. Same key + scope always returns the same instance.

```ts
function state<T>(key: string, options: StateOptions<T>): StateInstance<T>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique identifier for this value |
| `options` | `StateOptions<T>` | Configuration (see [Options](#options)) |

**Returns** `StateInstance<T>`

---

## Instance methods

### `get()`

```ts
get(): T
```

Returns the current value. Reactive — tracked by `computed` and `effect`.

### `peek()`

```ts
peek(): T
```

Reads the current value without reactive tracking. Useful when you need the value inside a `computed` or `effect` without creating a dependency.

### `set(value)`

```ts
set(value: T | ((prev: T) => T)): void
```

Replaces the current value. Accepts a direct value or an updater function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `T \| (prev: T) => T` | New value or updater function |

### `reset()`

```ts
reset(): void
```

Restores the value to the `default` provided at creation.

### `subscribe(listener)`

```ts
subscribe(listener: (value: T) => void): Unsubscribe
```

Calls `listener` on every change. Returns an `unsubscribe` function.

### `watch(key, listener)`

```ts
watch<K extends keyof T>(key: K, listener: (value: T[K]) => void): Unsubscribe
```

Subscribes to a single key within an object value. Only fires when that key's value changes.

### `intercept(fn)`

```ts
intercept(fn: (next: T, prev: T) => T): Unsubscribe
```

Registers a pre-set interceptor. Receives `(next, prev)` and returns the value to store. Return `prev` to reject. Multiple interceptors run in registration order.

### `use(fn)`

```ts
use(fn: (next: T, prev: T) => void): Unsubscribe
```

Registers a post-set hook. Receives `(next, prev)`. Return value is ignored. Multiple hooks run in registration order.

### `destroy()`

```ts
destroy(): void
```

Tears down all listeners, interceptors, hooks, and storage resources. After destruction, the next `state()` call with the same key creates a fresh instance.

---

## Promise lifecycle

| Property | Type | Resolves when |
|----------|------|---------------|
| `ready` | `Promise<void>` | Adapter is initialized. Immediate for sync scopes. |
| `settled` | `Promise<void>` | Most recent `set()` has been persisted to storage. |
| `hydrated` | `Promise<void>` | SSR hydration is complete and real stored value has been read. |
| `destroyed` | `Promise<void>` | `destroy()` has been called and teardown is complete. |

---

## Identity properties

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | The key this instance was created with |
| `scope` | `Scope` | Which scope this instance uses |
| `isDestroyed` | `boolean` | Whether `destroy()` has been called |

---

## Options

`StateOptions<T>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default` | `T` | required | Initial value and reset target |
| `scope` | `Scope` | `'render'` | Where state lives |
| `isEqual` | `(a: T, b: T) => boolean` | — | Custom equality function. When provided, `set()` skips the update if `isEqual(next, prev)` returns `true` |
| `migrate` | `Record<number, (old: unknown) => unknown>` | — | Migration functions keyed by source version |
| `persist` | `Array<keyof T & string>` | — | Selectively persist only listed keys of an object value |
| `prefix` | `string \| false` | — | Override or disable the global key prefix |
| `serialize` | `Serializer<T>` | JSON | Custom serializer for persistent scopes |
| `ssr` | `boolean` | `false` | Enable SSR safety |
| `sync` | `boolean` | `false` | Broadcast changes to other tabs via BroadcastChannel |
| `validate` | `(v: unknown) => v is T` | — | Validate values read from storage; falls back to default on failure |
| `version` | `number` | `1` | Schema version for migrations |
| `bucket` | `BucketOptions` | — | Required when scope is `'bucket'` |

---

## `BucketOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | required | Bucket name. Each name is isolated. |
| `expires` | `string \| number` | — | Expiry duration (`'7d'`, `'24h'`) or Unix timestamp in ms |
| `fallback` | `'local' \| 'tab'` | `'local'` | Scope to use if Storage Buckets API is unavailable |
| `persisted` | `boolean` | `false` | Persist under storage pressure |
| `quota` | `string \| number` | — | Maximum storage quota (`'10mb'`, `'50mb'`) or byte count |

---

## Type hierarchy

- **`ReadonlyInstance<T>`** — `get`, `peek`, `subscribe`, `ready`, identity, `destroy`
- **`BaseInstance<T>`** — extends `ReadonlyInstance` with `set`, `reset`, `intercept`, `use`
- **`StateInstance<T>`** — extends `BaseInstance` with `watch`

`computed` returns a `ReadonlyInstance`. `collection` returns a `CollectionInstance` (extends `BaseInstance`).

---

## Scopes

| Scope | Storage | Survives reload | Cross-tab | Server | Async |
|-------|---------|----------------|-----------|--------|-------|
| `bucket` | Storage Buckets API | yes | no | no | yes |
| `local` | localStorage | yes | passive | no | no |
| `render` | Memory | no | no | no | no |
| `server` | AsyncLocalStorage | per-request | no | yes | no |
| `tab` | sessionStorage | yes | no | no | no |
| `url` | URLSearchParams | yes | via link | no | no |

---

## Serializer

```ts
interface Serializer<T> {
  stringify(value: T): string
  parse(raw: string): T
}
```

Custom serializer for types that don't round-trip through JSON. When provided, migration and validation are skipped.

---

## Utility functions

### `batch(fn)`

```ts
function batch(fn: () => void): void
```

Groups multiple updates so subscribers are notified once. Nested batches are safe — notifications flush when the outermost batch completes.

### `configure(config)`

```ts
function configure(config: { prefix?: string }): void
```

Sets the global key prefix. All subsequent `state()` calls use this prefix unless overridden per-instance.

### `shallowEqual(a, b)`

```ts
function shallowEqual(a: unknown, b: unknown): boolean
```

Shallow equality check for primitives, arrays, and plain objects. Compares one level deep using `Object.is`.

### `snapshot()`

```ts
function snapshot(): StateSnapshot[]
```

Returns a read-only snapshot of all registered state instances. Useful for debugging and logging.

```ts
import { snapshot } from 'gjendje'
console.table(snapshot())
```

Each entry contains: `key`, `scope`, `value`, and `isDestroyed`.

### `withServerSession(fn)`

```ts
function withServerSession<T>(fn: () => T | Promise<T>): Promise<T>
```

Wraps a callback in an AsyncLocalStorage context for the `server` scope. Required for request-scoped state on the server.

---

## Enhancers

### `withHistory(instance, options?)`

```ts
function withHistory<T>(
  instance: BaseInstance<T>,
  options?: { maxSize?: number }
): WithHistoryInstance<T>
```

Wraps a state instance with undo/redo capabilities.

| Method / Property | Type | Description |
|-------------------|------|-------------|
| `undo()` | `void` | Revert to the previous value |
| `redo()` | `void` | Re-apply the last undone value |
| `canUndo` | `boolean` | Whether `undo()` will have an effect |
| `canRedo` | `boolean` | Whether `redo()` will have an effect |
| `clearHistory()` | `void` | Clear all past and future history |

Options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxSize` | `number` | `50` | Maximum number of history entries |

```ts
const counter = state('counter', { default: 0 })
const h = withHistory(counter)

h.set(1)
h.set(2)
h.undo()   // counter is now 1
h.redo()   // counter is now 2
```

### `withWatch(instance)`

```ts
function withWatch<T>(instance: BaseInstance<T>): BaseInstance<T> & WithWatch<T>
```

Adds per-key change tracking to any instance. The returned instance has all original methods plus a `watch()` method.

`state()` instances include `watch()` by default — use `withWatch` when you need key-level tracking on a `computed` or `collection` result that doesn't have it built in.

| Method | Signature | Description |
|--------|-----------|-------------|
| `watch(key, fn)` | `(key: keyof T, fn: (value: T[K]) => void) => Unsubscribe` | Listen for changes to a single property. Uses `Object.is` for comparison. |

```ts
const user = state('user', { default: { name: 'Jane', age: 30 } })
const w = withWatch(user)

w.watch('name', (name) => console.log(name))

w.set({ name: 'John', age: 30 })  // logs 'John'
w.set({ name: 'John', age: 31 })  // nothing — name didn't change
```
