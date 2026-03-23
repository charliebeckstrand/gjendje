# Quick start

## State

```ts
import { state } from 'gjendje'

const store = state({ count: 0 })
```

## Persist

```ts
const store = state({ theme: 'light' }, { scope: 'local' })
```

```ts
// Optional dot notation shorthand
const store = state.local({ theme: 'light' })
```

## Get

Return the full state:

```ts
store.get()
```

Destructure values:

```ts
const { theme } = store.get()
```

## Set / Patch

Replace entire state:

```ts
store.set({ count: 1 })
```
Update a property using an updater function:

```ts
store.set((prev) => ({ ...prev, count: prev.count + 1 }))
```

Update a property without spreading:

```ts
const user = state({
  name: 'John',
  age: 30,
  city: '',
  state: 'NY',
  zip: '12345'
})

user.patch({ city: 'Schenectady' })
```

Update specific properties:

```ts
user.patch({ name: 'Jane', age: 25 })
```
