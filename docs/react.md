# React

gjendje ships first-class React bindings via `gjendje/react`.

## Installation

```bash
npm install gjendje react
```

## `useGjendje`

A single hook for reading any gjendje instance in React. It re-renders your component when the value changes.

```tsx
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/react'

const counter = state({ counter: 0 })

function Counter() {
  const count = useGjendje(counter)

  return (
    <div>
      <p>{count}</p>
      <button onClick={() => counter.set(prev => prev + 1)}>+</button>
      <button onClick={() => counter.reset()}>Reset</button>
    </div>
  )
}
```

## Selectors

Pass an optional selector to derive a slice. The component only re-renders when the selected value changes (compared with `===`).

```tsx
const settings = state.local({ settings: { theme: 'light', fontSize: 14, locale: 'en' } })

function ThemeToggle() {
  // Only re-renders when `theme` changes — not when fontSize or locale change
  const theme = useGjendje(settings, s => s.theme)

  return (
    <button onClick={() => settings.patch({ theme: theme === 'light' ? 'dark' : 'light' })}>
      {theme}
    </button>
  )
}
```

## Works with all primitives

`useGjendje` accepts any gjendje instance — `state`, `computed`, `select`, `collection`, `readonly`, and `withHistory` all work the same way.

```tsx
import { state, computed, collection, readonly } from 'gjendje'
import { useGjendje } from 'gjendje/react'

const price = state({ price: 100 })
const tax = computed([price], ([p]) => p * 0.1)
const total = computed([price, tax], ([p, t]) => p + t)

function PriceSummary() {
  const totalValue = useGjendje(total)
  return <span>Total: ${totalValue}</span>
}
```

```tsx
const todos = collection({ todos: [] })

function TodoCount() {
  const items = useGjendje(todos)
  return <span>{items.length} items</span>
}
```

## Persistent state

Switching storage backends doesn't change how hooks work. The same `useGjendje` call works regardless of scope.

```tsx
// Memory (default)
const draft = state({ draft: '' })

// localStorage — persists across sessions
const theme = state.local({ theme: 'light' })

// URL — syncs with query params
const filters = state.url({ filters: { sort: 'date', page: 1 } })

function App() {
  const currentTheme = useGjendje(theme)
  const currentFilters = useGjendje(filters)
  // ...
}
```

## Batching

Multiple updates inside `batch()` trigger a single re-render.

```tsx
import { batch } from 'gjendje'

function resetAll() {
  batch(() => {
    counter.reset()
    settings.reset()
    filters.reset()
  })
  // Components re-render once, not three times
}
```

## TypeScript

`useGjendje` is fully typed. The return type is inferred from the instance or selector.

```tsx
const user = state({ user: { name: 'Alice', age: 30 } })

// Inferred as { name: string; age: number }
const value = useGjendje(user)

// Inferred as string
const name = useGjendje(user, u => u.name)
```

## API

```ts
function useGjendje<T>(instance: ReadonlyInstance<T>): T
function useGjendje<T, U>(instance: ReadonlyInstance<T>, selector: (value: T) => U): U
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `ReadonlyInstance<T>` | Any gjendje instance (`state`, `computed`, `select`, `collection`, `readonly`, etc.) |
| `selector` | `(value: T) => U` | Optional. Derives a slice from the value. Re-renders only when the slice changes (`===`). |

**Returns** the current value (or selected slice), and re-renders the component when it changes.

Built on [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) for full compatibility with React 18+ concurrent features.
