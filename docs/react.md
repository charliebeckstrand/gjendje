# React

```ts
import {
  useStore,
  useSharedState,
  useStateInstance,
  useWatch,
  useSelector,
  useStoreValue,
  useCollection,
  useReady,
  useBucket,
} from 'gjendje/react'
```

_All hooks use `useSyncExternalStore` — safe for concurrent mode and React 19._

---

## `useStore`

```ts
useStore<T>(key: string, options?: StateOptions<T>): [T, Setter<T>]
```

Primary hook. Same key + scope shares state across components.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Registry key for the state instance |
| `options` | `StateOptions<T>` | Optional. `default`, `scope`, and any other state options |

**Returns** `[value, setter]` — reactive value and a setter that accepts a value or updater function.

---

## `useSharedState`

```ts
useSharedState<T>(instance: StateInstance<T>): [T, Setter<T>]
```

Consume a module-level instance directly. No context or prop drilling.

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `StateInstance<T>` | A pre-defined `state()` instance |

**Returns** `[value, setter]` — same as `useStore`.

---

## `useStateInstance`

```ts
useStateInstance<T>(key: string, options?: StateOptions<T>): StateInstance<T>
```

Returns the full instance for direct access to `peek()`, `watch()`, `reset()`, and `ready`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Registry key for the state instance |
| `options` | `StateOptions<T>` | Optional. `default`, `scope`, and any other state options |

**Returns** `StateInstance<T>` — the underlying instance, re-renders on value changes.

---

## `useWatch`

```ts
useWatch<T, K extends keyof T>(instance: StateInstance<T>, key: K): T[K]
```

Subscribe to a specific key within an object value. Only re-renders when that key changes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `StateInstance<T>` | The state instance to observe |
| `key` | `K` | The object key to subscribe to |

**Returns** `T[K]` — the current value of that key.

---

## `useCollection`

```ts
useCollection<T>(key: string, options?: CollectionOptions<T>): CollectionInstance<T>
```

Returns the full `CollectionInstance` with all mutation methods. Re-renders on any array change.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Registry key for the collection |
| `options` | `CollectionOptions<T>` | Optional. `default`, `scope`, and any other collection options |

**Returns** `CollectionInstance<T>` — includes `get()`, `add()`, `remove()`, `clear()`, and other mutation methods.

---

## `useReady`

```ts
useReady(instance: StateInstance<unknown>): boolean
```

Returns `false` until `.ready` resolves. Useful for async scopes like `bucket`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `StateInstance<unknown>` | The state instance to check |

**Returns** `boolean` — `true` once the instance is hydrated.

---

## `useBucket`

```ts
useBucket<T>(key: string, options?: BucketOptions<T>): [T, Setter<T>, boolean]
```

Combines `useStore` + `useReady`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Registry key for the state instance |
| `options` | `BucketOptions<T>` | Optional. `default`, `bucket` config, and any other state options |

**Returns** `[value, setter, isReady]` — reactive value, setter, and hydration status.

---

## `useSelector`

```ts
useSelector<T, S>(
  instance: StateInstance<T>,
  selector: (value: T) => S,
  isEqual?: (a: S, b: S) => boolean,
): S
```

Derives a value from state and only re-renders when the selected slice changes. Accepts an optional equality function (defaults to `Object.is`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `StateInstance<T>` | The state instance to select from |
| `selector` | `(value: T) => S` | Function that extracts a slice of state |
| `isEqual` | `(a: S, b: S) => boolean` | Optional. Controls re-render sensitivity. Defaults to `Object.is` |

**Returns** `S` — the selected value. Only triggers re-render when `isEqual` reports a change.

```tsx
const theme = useSelector(prefsState, (p) => p.theme)
// re-renders only when prefs.theme changes
```

---

## `useStoreValue`

```ts
useStoreValue<T>(instance: StateInstance<T>): T
```

Read-only hook. Lighter alternative to `useSharedState` when you only need the value without a setter.

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `StateInstance<T>` | The state instance to observe |

**Returns** `T` — the current value. Re-renders on changes.

```tsx
const theme = useStoreValue(themeState)
```

---

## Instance lifecycle

Instances are not owned by components. They live in the registry and persist beyond component lifetimes. Unmounting does not destroy an instance.
