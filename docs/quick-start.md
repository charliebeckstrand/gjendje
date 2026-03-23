# Quick start

## State

```ts
import { state } from 'gjendje'

const store = state({ count: 0 })
```

### Persist

```ts
const store = state({ theme: 'light' }, { scope: 'local' })
```

```ts
// Optional dot notation shorthand
const store = state.local({ theme: 'light' })
```

### Getting values

Return the full state:

```ts
store.get()
```

Destructure specific values:

```ts
const { theme } = store.get()
```

### Updating values

Replace the entire state:

```ts
store.set({ count: 1 })
```
Use an updater function:

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

---

**Next:** [Examples](examples.md) · [API reference](api.md) · [Scopes](scopes.md) · [Persistence](persistence.md) · [Primitives](primitives.md) · [Configure](configure.md)
