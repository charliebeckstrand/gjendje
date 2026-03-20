# Derived State

Primitives that build on top of `state` to handle computed values, collections, and side effects.

---

## `computed(deps, fn)`

```ts
function computed<TDeps extends ReadonlyArray<BaseInstance<unknown>>, TResult>(
  deps: TDeps,
  fn: (values: DepValues<TDeps>) => TResult,
): ComputedInstance<TResult>
```

Derives a reactive, read-only value from one or more state dependencies.

| Parameter | Type | Description |
|-----------|------|-------------|
| `deps` | `ReadonlyArray<BaseInstance>` | State instances to depend on |
| `fn` | `(values) => TResult` | Compute function — receives current dependency values as a tuple |

**Returns** `ComputedInstance<TResult>` — extends `ReadonlyInstance` (no `set` or `reset`).

### Instance methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `() => T` | Current computed value |
| `peek()` | `() => T` | Same as `get()` |
| `subscribe(fn)` | `(fn: (value: T) => void) => Unsubscribe` | Listen for recomputations |
| `destroy()` | `() => void` | Stop listening to dependencies; last cached value remains accessible |

### Behavior
- **Lazy caching** — the compute function only runs when a dependency changes. Repeated `get()` calls return the cached value.
- **Composition** — computed values can depend on other computed values.
- **Batching** — participates in `batch()`. Notifications are deferred like any other state.
- **Eager initialization** — the first value is computed synchronously at creation time.

---

## `collection(key, options)`

```ts
function collection<T>(key: string, options: StateOptions<T[]>): CollectionInstance<T>
```

Reactive array with first-class mutation methods.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique identifier |
| `options` | `StateOptions<T[]>` | Same options as `state()` — scope, persistence, validation, migration all apply |

**Returns** `CollectionInstance<T>` — extends `BaseInstance<T[]>`.

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
| `add(...items)` | `(...items: T[]) => void` | Append one or more items |
| `remove(fn, opts?)` | `(fn: (item: T) => boolean, opts?: { one?: boolean }) => void` | Remove matching items. `{ one: true }` removes first match only. |
| `update(fn, patch, opts?)` | `(fn: (item: T) => boolean, patch: Partial<T> \| ((item: T) => T), opts?: { one?: boolean }) => void` | Patch matching items. Accepts a partial object or updater function. |
| `clear()` | `() => void` | Remove all items |
| `reset()` | `() => void` | Restore to default |
| `set(value)` | `(value: T[] \| ((prev: T[]) => T[])) => void` | Replace the entire array |

### Reactive

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe(fn)` | `(fn: (value: T[]) => void) => Unsubscribe` | Listen for any change |
| `watch(key, fn)` | `(key: keyof T, fn: (items: T[]) => void) => Unsubscribe` | Listen for changes to a specific key across all items |
| `intercept(fn)` | `(fn: (next: T[], prev: T[]) => T[]) => Unsubscribe` | Pre-set interceptor |
| `use(fn)` | `(fn: (next: T[], prev: T[]) => void) => Unsubscribe` | Post-set hook |

### Lifecycle

Same promise lifecycle and identity properties as `state` — `ready`, `settled`, `hydrated`, `destroyed`, `scope`, `key`, `isDestroyed`, `destroy()`.

---

## `effect(deps, fn)`

```ts
function effect<TDeps extends ReadonlyArray<BaseInstance<unknown>>>(
  deps: TDeps,
  fn: (values: DepValues<TDeps>) => (() => void) | undefined,
): EffectHandle
```

Runs a side effect when dependencies change.

| Parameter | Type | Description |
|-----------|------|-------------|
| `deps` | `ReadonlyArray<BaseInstance>` | State instances to track |
| `fn` | `(values) => cleanup \| undefined` | Effect callback — receives current dependency values. May return a cleanup function. |

**Returns** `EffectHandle`

```ts
interface EffectHandle {
  stop(): void
}
```

### Behavior
- **Immediate execution** — runs synchronously at creation with current values.
- **Re-runs on change** — any dependency update triggers re-execution.
- **Cleanup** — if the callback returns a function, it runs before the next execution and on `stop()`.
- **Cleanup sequence** — (1) previous cleanup runs, (2) callback runs with new values, (3) new cleanup stored.
- **Framework-agnostic** — works in React, Vue, Svelte, vanilla JS, or Node.
