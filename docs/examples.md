# Examples

Real-world patterns and recipes.

---

## Theme switcher with cross-tab sync

```ts
import { local } from 'gjendje'

const theme = local({ theme: 'light' as 'light' | 'dark' }, {
  sync: true,
  validate: (v): v is 'light' | 'dark' => v === 'light' || v === 'dark',
})

// Toggle
theme.set((prev) => (prev === 'light' ? 'dark' : 'light'))

// Apply to DOM
theme.subscribe((value) => {
  document.documentElement.setAttribute('data-theme', value)
})
```

Changing theme in one tab updates every open tab instantly.

---

## Form with validation and selective persistence

```ts
import { session, select } from 'gjendje'

interface ContactForm {
  name: string
  email: string
  message: string
  isDirty: boolean
}

const form = session({ 'contact-form': { name: '', email: '', message: '', isDirty: false } }, {
  persist: ['name', 'email', 'message'],
})

// isDirty stays in memory — resets on reload.
// name, email, message survive tab refresh.

const isValid = select(form, (f) =>
  f.name.length > 0 && f.email.includes('@') && f.message.length > 0,
)

// Reject empty names
form.intercept((next, prev) => {
  if (next.name.trim() === '' && prev.name.trim() !== '') return prev

  return { ...next, isDirty: true }
})
```

---

## Todo list with collection

```ts
import { collection, select } from 'gjendje'

interface Todo {
  id: string
  text: string
  done: boolean
}

const todos = collection<Todo>('todos', {
  default: [],
  scope: 'local',
})

// Add
todos.add({ id: crypto.randomUUID(), text: 'Ship it', done: false })

// Toggle
todos.update((t) => t.id === '...', (t) => ({ ...t, done: !t.done }))

// Remove completed
todos.remove((t) => t.done)

// Derived counts
const remaining = select(todos, (items) => items.filter((t) => !t.done).length)
```

---

## Undo/redo with history

```ts
import { state, withHistory } from 'gjendje'

const doc = state({ doc: '' })
const h = withHistory(doc, { maxSize: 100 })

h.set('Hello')
h.set('Hello, world')

h.canUndo  // true
h.undo()   // 'Hello'
h.canRedo  // true
h.redo()   // 'Hello, world'
```

---

## Tracking the previous value

```ts
import { state, previous, effect } from 'gjendje'

const route = state({ route: '/home' })
const prevRoute = previous(route)

effect([route], ([current]) => {
  const from = prevRoute.get()

  if (from) {
    console.log(`Navigated from ${from} to ${current}`)
  }
})

route.set('/settings')
// logs: Navigated from /home to /settings
```

---

## Per-key watchers

```ts
import { state } from 'gjendje'

const user = state({ user: { name: 'Jane', age: 30, role: 'admin' } })

// Only fires when name changes — ignores age and role updates
user.watch('name', (name) => {
  console.log(`Name changed to ${name}`)
})

user.set({ name: 'Jane', age: 31, role: 'admin' })  // nothing
user.set({ name: 'John', age: 31, role: 'admin' })  // logs 'John'
```

---

## Read-only exports

```ts
// store.ts
import { state, readonly } from 'gjendje'

const _count = state({ count: 0 })

// Consumers can read and subscribe, but can't call set() or reset()
export const count = readonly(_count)

// Only this module can write
export function increment() {
  _count.set((n) => n + 1)
}
```

---

## Persisted settings with migration

```ts
import { local } from 'gjendje'

interface Settings {
  colorScheme: 'light' | 'dark'
  fontSize: number
  compact: boolean
}

const settings = local(
  { settings: { colorScheme: 'light', fontSize: 14, compact: false } as Settings },
  {
    version: 3,
    migrate: {
      // v1 → v2: added fontSize
      1: (old: any) => ({ ...old, fontSize: 14 }),
      // v2 → v3: renamed theme → colorScheme, added compact
      2: (old: any) => ({
        colorScheme: old.theme ?? 'light',
        fontSize: old.fontSize,
        compact: false,
      }),
    },
    validate: (v): v is Settings =>
      typeof v === 'object' &&
      v !== null &&
      'colorScheme' in v &&
      'fontSize' in v &&
      'compact' in v,
  },
)
```

Users on v1 migrate through both steps. Users on v2 run only the second. Users on v3 skip migration entirely.

---

## Batching multiple updates

```ts
import { state, computed, batch } from 'gjendje'

const firstName = state({ first: 'Jane' })
const lastName = state({ last: 'Doe' })
const fullName = computed([firstName, lastName], ([f, l]) => `${f} ${l}`)

fullName.subscribe((name) => console.log(name))

// Without batch: subscriber fires twice (once per set)
// With batch: subscriber fires once with final value
batch(() => {
  firstName.set('John')
  lastName.set('Smith')
})
// logs: 'John Smith' (once)
```

---

## Custom serializer for Set

```ts
import { local } from 'gjendje'

const bookmarks = local({ bookmarks: new Set<string>() }, {
  serialize: {
    stringify: (value) => JSON.stringify([...value]),
    parse: (raw) => new Set(JSON.parse(raw)),
  },
})

bookmarks.set((prev) => new Set([...prev, '/docs/api']))
```

---

## Server-scoped request state

```ts
import { server, withServerSession } from 'gjendje'

const requestId = server({ 'request-id': '' })
const currentUser = server({ user: null as User | null })

async function handleRequest(req: Request) {
  return withServerSession(async () => {
    requestId.set(crypto.randomUUID())
    currentUser.set(await authenticate(req))

    // Any code running inside this callback — including
    // deeply nested function calls — can read requestId
    // and currentUser without prop drilling.
    return renderApp()
  })
}
```

---

## URL-driven filters

```ts
import { url, computed } from 'gjendje'

const query = url({ q: '' })
const category = url({ cat: 'all' })

// URL updates automatically: ?q=shoes&cat=sale
query.set('shoes')
category.set('sale')

// Derive filtered results
const results = computed([query, category], ([q, cat]) => {
  return products
    .filter((p) => cat === 'all' || p.category === cat)
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
})
```

Bookmarkable. Shareable. Back button works.
