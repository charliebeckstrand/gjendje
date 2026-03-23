# Scopes

| Scope     | Backend              |
|-----------|----------------------|
| `memory`  | Default |
| `local`   | `localStorage`       |
| `session` | `sessionStorage`     |
| `url`     | `URLSearchParams`    |
| `bucket`  | Storage Buckets API  |
| `server`  | `AsyncLocalStorage`  |

---

## `memory`

```ts
const isOpen = state({ modal: false })
```

---

## `local` (localStorage)

```ts
const theme = state.local({ theme: 'light' })
```

```ts
// Enable `sync: true` to broadcast changes to other open tabs via `BroadcastChannel`:
const theme = state.local({ theme: 'light' }, { sync: true })
```
---

## `session` (sessionStorage)

```ts
const step = state.session({ 'wizard-step': 1 })
```

---

## `url` (URLSearchParams)

```ts
const query = state.url({ q: '' })
```

---

## `bucket` (Storage Buckets API)

```ts
const cache = state.bucket({ 'api-cache': null }, {
  bucket: {
    name: 'api',
    quota: '10mb',
    expires: '7d',
    fallback: 'local', // Fall back to `local` or `session` if unavailable.
  },
})
```

---

## `server` (AsyncLocalStorage)

```ts
import { state, withServerSession } from 'gjendje'

const requestId = state.server({ 'request-id': '' })

await withServerSession(async () => {
  requestId.set(crypto.randomUUID())
  // ... handle request
})
```

Every `server` scoped `state()` must run inside [`withServerSession`](https://github.com/charliebeckstrand/gjendje/blob/main/docs/utilities#withServerSession.md).
