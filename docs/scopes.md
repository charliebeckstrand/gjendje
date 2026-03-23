# Scopes

| Scope     | Backend              |
|-----------|----------------------|
| `memory`  | In-memory (default)  |
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

Enable `sync: true` to broadcast changes to other open tabs via `BroadcastChannel`:

```ts
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

Falls back to `local` or `session` if unavailable.

```ts
const cache = state.bucket({ 'api-cache': null }, {
  bucket: {
    name: 'api',
    quota: '10mb',
    expires: '7d',
    fallback: 'local',
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

Every `server`-scoped `state()` must run inside `withServerSession`.
