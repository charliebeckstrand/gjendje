# Vue

gjendje ships first-class Vue bindings via `gjendje/vue`.

## Installation

```bash
npm install gjendje vue
```

## `useGjendje`

A composable that returns a reactive `Ref` synced with any gjendje instance. For writable instances the ref is two-way — assign to `.value` to update the state.

```vue
<script setup>
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/vue'

const counter = state({ counter: 0 })

const count = useGjendje(counter)
</script>

<template>
  <p>{{ count }}</p>
  <button @click="count++">+</button>
  <button @click="counter.reset()">Reset</button>
</template>
```

Writing to `count.value` (or `count++` in templates) calls `counter.set()` under the hood.

## Selectors

Pass a selector to derive a slice. The ref only triggers updates when the selected value changes.

```vue
<script setup>
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/vue'

const settings = state.local({ settings: { theme: 'light', fontSize: 14, locale: 'en' } })

// Only triggers when `theme` changes — not when fontSize or locale change
const theme = useGjendje(settings, s => s.theme)
</script>

<template>
  <button @click="settings.patch({ theme: theme === 'light' ? 'dark' : 'light' })">
    {{ theme }}
  </button>
</template>
```

## Readonly and computed instances

Readonly and computed instances return a read-only `Ref` — you can read `.value` but not assign to it.

```vue
<script setup>
import { state, computed } from 'gjendje'
import { useGjendje } from 'gjendje/vue'

const price = state({ price: 100 })
const tax = computed([price], ([p]) => p * 0.1)
const total = computed([price, tax], ([p, t]) => p + t)

const totalValue = useGjendje(total)
</script>

<template>
  <span>Total: ${{ totalValue }}</span>
</template>
```

## Collections

Collections return a writable ref. Use collection methods directly for `add`, `remove`, and `update`.

```vue
<script setup>
import { collection } from 'gjendje'
import { useGjendje } from 'gjendje/vue'

const todos = collection('todos', { default: [] })

const items = useGjendje(todos)
</script>

<template>
  <p>{{ items.length }} items</p>
  <button @click="todos.add({ text: 'New todo', done: false })">Add</button>
</template>
```

## Persistent state

Switching storage backends doesn't change how the composable works.

```vue
<script setup>
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/vue'

// Memory (default)
const draft = useGjendje(state({ draft: '' }))

// localStorage — persists across sessions
const theme = useGjendje(state.local({ theme: 'light' }))

// URL — syncs with query params
const filters = useGjendje(state.url({ filters: { sort: 'date', page: 1 } }))
</script>
```

## Batching

Multiple updates inside `batch()` trigger a single Vue reactivity flush.

```ts
import { batch } from 'gjendje'

batch(() => {
  counter.reset()
  settings.reset()
  filters.reset()
})
// Watchers and templates update once, not three times
```

## TypeScript

`useGjendje` is fully typed. The ref type is inferred from the instance.

```ts
const counter = state({ counter: 0 })
const user = state({ user: { name: 'Alice', age: 30 } })
const total = computed([counter], ([c]) => c * 2)

// Ref<number> — two-way
const count = useGjendje(counter)

// Readonly<Ref<string>> — from selector
const name = useGjendje(user, u => u.name)

// Readonly<Ref<number>> — computed is read-only
const totalValue = useGjendje(total)
```

## API

```ts
// Writable instance → Ref<T> (two-way)
function useGjendje<T>(instance: BaseInstance<T>): Ref<T>

// Readonly / computed instance → Readonly<Ref<T>>
function useGjendje<T>(instance: ReadonlyInstance<T>): Readonly<Ref<T>>

// With selector → Readonly<Ref<U>>
function useGjendje<T, U>(instance: ReadonlyInstance<T>, selector: (value: T) => U): Readonly<Ref<U>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `instance` | `ReadonlyInstance<T>` | Any gjendje instance (`state`, `computed`, `select`, `collection`, `readonly`, etc.) |
| `selector` | `(value: T) => U` | Optional. Derives a slice from the value. Returns a read-only ref. |

**Returns** a reactive `Ref` that stays in sync with the gjendje instance. Cleanup is automatic via `onScopeDispose`.

Built on Vue's [`customRef`](https://vuejs.org/api/reactivity-advanced.html#customref) for native integration with Vue's reactivity system.
