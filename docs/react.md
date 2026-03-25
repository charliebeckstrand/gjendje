# React

gjendje ships first-class React bindings via `gjendje/react`.

## Installation

```bash
npm install gjendje react
```

## `useGjendje`

A single hook for reading any gjendje instance in React. For writable instances, it returns a `[value, set, reset]` tuple — just like React's `useState`.

```tsx
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/react'

const counter = state({ counter: 0 })

function Counter() {
  const [count, setCount, resetCount] = useGjendje(counter)

  return (
    <div>
      <p>{count}</p>
      <button onClick={() => setCount(prev => prev + 1)}>+</button>
      <button onClick={resetCount}>Reset</button>
    </div>
  )
}
```

## Selectors

Pass a selector to derive a slice. Returns just the value (no tuple). The component only re-renders when the selected value changes (`===`).

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

## Readonly and computed instances

Readonly and computed instances return just the value — no tuple, since there's nothing to set.

```tsx
import { state, computed, readonly } from 'gjendje'
import { useGjendje } from 'gjendje/react'

const price = state({ price: 100 })
const tax = computed([price], ([p]) => p * 0.1)
const total = computed([price, tax], ([p, t]) => p + t)

function PriceSummary() {
  const totalValue = useGjendje(total) // plain number, not a tuple
  return <span>Total: ${totalValue}</span>
}
```

## Collections

Collections are writable, so they return the same `[value, set, reset]` tuple. Use collection methods directly for `add`, `remove`, and `update`.

```tsx
import { collection } from 'gjendje'
import { useGjendje } from 'gjendje/react'

const todos = collection({ todos: [] })

function TodoList() {
  const [items] = useGjendje(todos)

  return (
    <div>
      <p>{items.length} items</p>
      <button onClick={() => todos.add({ text: 'New todo', done: false })}>Add</button>
    </div>
  )
}
```

## Persistent state

Switching storage backends doesn't change how hooks work. The same `useGjendje` call works regardless of scope.

```tsx
// Memory (default)
const [draft, setDraft] = useGjendje(state({ draft: '' }))

// localStorage — persists across sessions
const [theme, setTheme] = useGjendje(state.local({ theme: 'light' }))

// URL — syncs with query params
const [filters, setFilters] = useGjendje(state.url({ filters: { sort: 'date', page: 1 } }))
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

`useGjendje` is fully typed. The return type depends on the instance and whether a selector is used.

```tsx
const counter = state({ counter: 0 })
const user = state({ user: { name: 'Alice', age: 30 } })
const total = computed([counter], ([c]) => c * 2)

// Writable → [number, set, reset]
const [count, setCount, resetCount] = useGjendje(counter)

// With selector → string
const name = useGjendje(user, u => u.name)

// Readonly / computed → number
const totalValue = useGjendje(total)
```

## API

```ts
// Writable instance → [value, set, reset]
function useGjendje<T>(instance: BaseInstance<T>): UseGjendjeResult<T>

// Readonly / computed instance → value
function useGjendje<T>(instance: ReadonlyInstance<T>): T

// With selector → selected value
function useGjendje<T, U>(instance: ReadonlyInstance<T>, selector: (value: T) => U): U
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `ReadonlyInstance<T>` | Any gjendje instance (`state`, `computed`, `select`, `collection`, `readonly`, etc.) |
| `selector` | `(value: T) => U` | Optional. Derives a slice from the value. Returns the slice directly (no tuple). |

**Returns:**
- **Writable instance**: `[value, set, reset]` — familiar tuple like React's `useState`
- **Readonly / computed**: just the value
- **With selector**: just the selected slice

Built on [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) for full compatibility with React 18+ concurrent features.

## Caveats

**Selectors must return stable references.** The selector result is compared with `===` to decide whether to re-render. Selectors that return new objects on every call (e.g., `s => ({ name: s.name })`) will cause unnecessary re-renders. Return primitives or existing references instead:

```tsx
// Bad — new object every time, re-renders on every change
const slice = useGjendje(user, u => ({ name: u.name }))

// Good — primitive, stable reference
const name = useGjendje(user, u => u.name)
```

**`set` and `reset` are not referentially stable.** They are new function references on each render. If you pass them as props to `React.memo` children, wrap them with `useCallback`:

```tsx
const [count, setCount] = useGjendje(counter)

// For memoized children that depend on referential stability
const stableSet = useCallback((v: number) => counter.set(v), [counter])
```
