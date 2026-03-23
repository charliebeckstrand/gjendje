# Quick start

```ts
import { state } from 'gjendje'

// Pass scope as an option
const theme = state({ theme: 'light' }, { scope: 'local' })

// Or use dot notation
const theme = state.local({ theme: 'light' })

theme.get()        // 'light'
theme.set('dark')  // persisted to localStorage
theme.reset()      // back to 'light'
```

For in-memory state that doesn't persist:

```ts
const user = state({ name: 'John', age: 30 })
```

Use `patch` to update specific properties without spreading:

```ts
user.patch({ name: 'Jane' })
```

[More examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)
