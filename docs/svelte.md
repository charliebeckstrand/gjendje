# Svelte

gjendje ships first-class Svelte bindings via `gjendje/svelte`.

## Installation

```bash
npm install gjendje svelte
```

## `useGjendje`

Creates a Svelte-compatible store from any gjendje instance. For writable instances, the store has `set`, `update`, and `subscribe` — the same contract as Svelte's built-in stores, so `$store` syntax works out of the box.

```svelte
<script>
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/svelte'

const counter = state({ counter: 0 })

const count = useGjendje(counter)
</script>

<p>{$count}</p>
<button on:click={() => count.set($count + 1)}>+</button>
<button on:click={() => counter.reset()}>Reset</button>
```

Assigning via `$count = 5` or calling `count.set(5)` calls `counter.set()` under the hood.

## Selectors

Pass a selector to derive a slice. The store only notifies subscribers when the selected value changes (`Object.is`).

```svelte
<script>
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/svelte'

const settings = state.local({ settings: { theme: 'light', fontSize: 14, locale: 'en' } })

// Only triggers when `theme` changes — not when fontSize or locale change
const theme = useGjendje(settings, s => s.theme)
</script>

<button on:click={() => settings.patch({ theme: $theme === 'light' ? 'dark' : 'light' })}>
  {$theme}
</button>
```

## Readonly and computed instances

Readonly and computed instances return a readable store — you can subscribe but not set.

```svelte
<script>
import { state, computed } from 'gjendje'
import { useGjendje } from 'gjendje/svelte'

const price = state({ price: 100 })
const tax = computed([price], ([p]) => p * 0.1)
const total = computed([price, tax], ([p, t]) => p + t)

const totalValue = useGjendje(total)
</script>

<span>Total: ${$totalValue}</span>
```

## Collections

Collections are writable, so the store has `set` and `update`. Use collection methods directly for `add`, `remove`, and `update`.

```svelte
<script>
import { collection } from 'gjendje'
import { useGjendje } from 'gjendje/svelte'

const todos = collection('todos', { default: [] })

const items = useGjendje(todos)
</script>

<p>{$items.length} items</p>
<button on:click={() => todos.add({ text: 'New todo', done: false })}>Add</button>
```

## Persistent state

Switching storage backends doesn't change how the store works.

```svelte
<script>
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/svelte'

// Memory (default)
const draft = useGjendje(state({ draft: '' }))

// localStorage — persists across sessions
const theme = useGjendje(state.local({ theme: 'light' }))

// URL — syncs with query params
const filters = useGjendje(state.url({ filters: { sort: 'date', page: 1 } }))
</script>
```

## Batching

Multiple updates inside `batch()` trigger a single subscriber notification.

```ts
import { batch } from 'gjendje'

batch(() => {
  counter.reset()
  settings.reset()
  filters.reset()
})
// Subscribers fire once, not three times
```

## TypeScript

`useGjendje` is fully typed. The store type depends on the instance and whether a selector is used.

```ts
const counter = state({ counter: 0 })
const user = state({ user: { name: 'Alice', age: 30 } })
const total = computed([counter], ([c]) => c * 2)

// GjendjeWritable<number> — set, update, subscribe
const count = useGjendje(counter)

// GjendjeReadable<string> — subscribe only (selector)
const name = useGjendje(user, u => u.name)

// GjendjeReadable<number> — subscribe only (computed)
const totalValue = useGjendje(total)
```

## API

```ts
// Writable instance → GjendjeWritable<T>
function useGjendje<T>(instance: BaseInstance<T>): GjendjeWritable<T>

// Readonly / computed instance → GjendjeReadable<T>
function useGjendje<T>(instance: ReadonlyInstance<T>): GjendjeReadable<T>

// With selector → GjendjeReadable<U>
function useGjendje<T, U>(instance: ReadonlyInstance<T>, selector: (value: T) => U): GjendjeReadable<U>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `ReadonlyInstance<T>` | Any gjendje instance (`state`, `computed`, `select`, `collection`, `readonly`, etc.) |
| `selector` | `(value: T) => U` | Optional. Derives a slice from the value. Returns a readable store. |

**Returns** a Svelte-compatible store that stays in sync with the gjendje instance:
- **Writable instance**: `GjendjeWritable<T>` — `set`, `update`, `subscribe`
- **Readonly / computed**: `GjendjeReadable<T>` — `subscribe` only
- **With selector**: `GjendjeReadable<U>` — `subscribe` only

The stores implement the [Svelte store contract](https://svelte.dev/docs/svelte-components#script-4-prefix-stores-with-$-to-access-their-values) so the `$` prefix syntax works automatically. Cleanup is handled by Svelte's auto-unsubscription when the component is destroyed.

## Caveats

**Selectors that return new references cause extra notifications.** The selected value is compared with `Object.is` to decide whether to notify. Selectors that return new objects on every call (e.g., `s => ({ name: s.name })`) will trigger on every upstream change. Return primitives or existing references instead:

```svelte
<script>
// Bad — new object every time, notifies on every change
const slice = useGjendje(user, u => ({ name: u.name }))

// Good — primitive, stable reference
const name = useGjendje(user, u => u.name)
</script>
```
