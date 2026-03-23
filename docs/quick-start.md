# Quick start

```ts
import { state } from 'gjendje'

// Pass scope as an option
const theme = state({ theme: 'light' }, { scope: 'local' })

// Or use dot notation
const theme = state.local({ theme: 'light' })
```

For in-memory state that doesn't persist, use `state` without a scope:

```ts
const user = state({ name: 'John', age: 30 })
```

## Getting values

Return the full state or destructure specific values:

```ts
user.get()
const { name } = user.get()
```

## Updating values

Replace the entire state with `set`, or use an updater function:

```ts
user.set({ name: 'Jane', age: 25 })
user.set((prev) => ({ ...prev, age: prev.age + 1 }))
```

For object stores, `patch` lets you update specific properties without spreading:

```ts
const form = state({ name: '', email: '', age: 0 })

form.patch({ name: 'Alice' })          // Only updates name
form.patch({ name: 'Bob', age: 30 })   // Update multiple properties at once
```

[More examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)
