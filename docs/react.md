# React

```ts
import { useStore, useSharedState, useSelector } from 'gjendje/react'
```

_All hooks use `useSyncExternalStore` — safe for concurrent mode and React 19._

---

## `useStore`

```ts
useStore<T>(key: string, options: StateOptions<T>): [T, Setter<T>]
```

Primary hook. Creates state inline — same key + scope shares state across components.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Registry key for the state instance |
| `options` | `StateOptions<T>` | `default`, `scope`, and any other state options |

**Returns** `[value, setter]` — reactive value and a setter that accepts a value or updater function.

```tsx
const [theme, setTheme] = useStore('theme', {
  default: 'light',
  scope: 'local',
})
```

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

```ts
// state.ts
export const themeState = state('theme', {
  default: 'light',
  scope: 'local',
})

// ThemeToggle.tsx
const [theme, setTheme] = useSharedState(themeState)
```

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

## Instance lifecycle

Instances are not owned by components. They live in the registry and persist beyond component lifetimes. Unmounting does not destroy an instance.
