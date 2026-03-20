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

### `set(value)`

```ts
set(value: T | ((prev: T) => T)): void
```

Replaces the current value. Accepts a direct value or an updater function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `T \| (prev: T) => T` | New value or updater function |

### `peek()`

```ts
peek(): T
```

Reads the current value without reactive tracking. Useful when you need the value inside a `computed` or `effect` without creating a dependency.

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

### `reset()`

```ts
reset(): void
```

Restores the value to the `default` provided at creation.

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
| `scope` | `Scope` | Which scope this instance uses |
| `key` | `string` | The key this instance was created with |
| `isDestroyed` | `boolean` | Whether `destroy()` has been called |

---

## Options

`StateOptions<T>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default` | `T` | required | Initial value and reset target |
| `scope` | `Scope` | `'render'` | Where state lives |
| `prefix` | `string \| false` | — | Override or disable the global key prefix |
| `bucket` | `BucketOptions` | — | Required when scope is `'bucket'` |
| `serialize` | `Serializer<T>` | JSON | Custom serializer for persistent scopes |
| `ssr` | `boolean` | `false` | Enable SSR safety |
| `sync` | `boolean` | `false` | Broadcast changes to other tabs via BroadcastChannel |
| `version` | `number` | `1` | Schema version for migrations |
| `validate` | `(v: unknown) => v is T` | — | Validate values read from storage; falls back to default on failure |
| `migrate` | `Record<number, (old: unknown) => unknown>` | — | Migration functions keyed by source version |
| `persist` | `Array<keyof T & string>` | — | Selectively persist only listed keys of an object value |

---

## `BucketOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | required | Bucket name. Each name is isolated. |
| `persisted` | `boolean` | `false` | Persist under storage pressure |
| `expires` | `string \| number` | — | Expiry duration (`'7d'`, `'24h'`) or Unix timestamp in ms |
| `quota` | `string \| number` | — | Maximum storage quota (`'10mb'`, `'50mb'`) or byte count |
| `fallback` | `'local' \| 'tab'` | `'local'` | Scope to use if Storage Buckets API is unavailable |

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
| `render` | Memory | no | no | no | no |
| `local` | localStorage | yes | passive | no | no |
| `server` | AsyncLocalStorage | per-request | no | yes | no |
| `bucket` | Storage Buckets API | yes | no | no | yes |
| `url` | URLSearchParams | yes | via link | no | no |
| `tab` | sessionStorage | yes | no | no | no |

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

### `withServerSession(fn)`

```ts
function withServerSession<T>(fn: () => T | Promise<T>): Promise<T>
```

Wraps a callback in an AsyncLocalStorage context for the `server` scope. Required for request-scoped state on the server.

---

## Serializer

```ts
interface Serializer<T> {
  stringify(value: T): string
  parse(raw: string): T
}
```

Custom serializer for types that don't round-trip through JSON. When provided, migration and validation are skipped.
