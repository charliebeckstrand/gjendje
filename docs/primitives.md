# Primitives

Reactive primitives that build on top of `state` to handle computed values, collections, and side effects.

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

## `select(source, fn)`

```ts
function select<TSource, TResult>(
  source: ReadonlyInstance<TSource>,
  fn: (value: TSource) => TResult,
  options?: SelectOptions,
): SelectInstance<TResult>
```

Derives a reactive, read-only value from a **single** source instance. A lightweight alternative to `computed` — no array allocation, no dependency loop.

### `select` vs `computed`

Use `select` when deriving from **one** source. Use `computed` when combining **multiple** sources.

```ts
// select — one source, one transformation
const userName = select(user, (u) => u.name)

// computed — multiple sources combined
const greeting = computed([user, locale], ([u, l]) => localize(l, u.name))
```

`select` skips the array allocation and dependency loop that `computed` needs for multi-dep tracking. For a single source, `select` is the simpler and faster choice. For two or more sources, `computed` is the only option.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `ReadonlyInstance<TSource>` | The single source to derive from |
| `fn` | `(value: TSource) => TResult` | Transform function — receives the current source value |
| `options` | `SelectOptions` | Optional — `{ key?: string }` |

**Returns** `SelectInstance<TResult>` — extends `ReadonlyInstance` (no `set` or `reset`).

### Instance methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `() => T` | Current derived value |
| `peek()` | `() => T` | Cached value without reactive tracking |
| `subscribe(fn)` | `(fn: (value: T) => void) => Unsubscribe` | Listen for recomputations |
| `destroy()` | `() => void` | Stop listening to source |

### Behavior
- **Lazy caching** — the transform only runs when the source changes. Repeated `get()` calls return the cached value.
- **Identity check** — skips notification when the derived value is unchanged (`===`).
- **Batching** — participates in `batch()`. Notifications are deferred like any other state.
- **Eager initialization** — the first value is computed synchronously at creation time.
- **Composition** — can derive from `state`, `computed`, or another `select`.

---

## `previous(source)`

```ts
function previous<T>(
  source: ReadonlyInstance<T>,
  options?: PreviousOptions,
): PreviousInstance<T>
```

Tracks the previous value of a source instance. Returns `undefined` until the source changes for the first time. Lighter than `withHistory` — stores only the single prior value, no undo/redo stacks.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `ReadonlyInstance<T>` | The source to track |
| `options` | `PreviousOptions` | Optional — `{ key?: string }` |

**Returns** `PreviousInstance<T>` — extends `ReadonlyInstance<T | undefined>`.

### Instance methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `() => T \| undefined` | The value the source had before the last change |
| `peek()` | `() => T \| undefined` | Same as `get()` |
| `subscribe(fn)` | `(fn: (value: T \| undefined) => void) => Unsubscribe` | Listen for previous-value changes |
| `destroy()` | `() => void` | Stop tracking the source |

### Behavior
- **Undefined initially** — returns `undefined` until the source changes at least once.
- **Single value** — only stores the immediately preceding value, not a full history.
- **Batching** — participates in `batch()`. Notifications are deferred like any other state.

---

## `readonly(instance)`

```ts
function readonly<T>(instance: ReadonlyInstance<T>): ReadonlyInstance<T>
```

Creates a read-only view of any state or computed instance. The returned instance exposes `get`, `peek`, `subscribe`, and lifecycle properties — but no `set`, `reset`, `intercept`, or `onChange`. Zero runtime cost.

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `ReadonlyInstance<T>` | The source instance to wrap |

**Returns** `ReadonlyInstance<T>` — a view with no write methods.

### Instance methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get()` | `() => T` | Current value (delegates to source) |
| `peek()` | `() => T` | Snapshot without reactive tracking |
| `subscribe(fn)` | `(fn: (value: T) => void) => Unsubscribe` | Listen for changes |
| `destroy()` | `() => void` | Delegates to source |

### Behavior
- **Pure delegation** — all reads and subscriptions go through to the source.
- **Type safety** — write methods (`set`, `reset`, `intercept`, `onChange`) are stripped from the type.
- **Lifecycle** — `key`, `scope`, `isDestroyed`, `ready`, `settled`, `hydrated`, `destroyed` all delegate to the source.

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
| `onChange(fn)` | `(fn: (next: T[], prev: T[]) => void) => Unsubscribe` | Post-set handler |

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
