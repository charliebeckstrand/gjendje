# Scopes

## Which scope should I use?

**Does this value need to survive a page reload?**

- **No** → `memory`

**Should it be visible in the URL (bookmarkable, shareable)?**

- **Yes** → `url`

**Should it survive after the tab closes?**

- **No** → `session`

**Do you need fine-grained storage control (quota, expiry, isolation)?**

- **Yes** → `bucket`
- **No** → `local`

**Is this server-side, per-request state?**

- **Yes** → `server`

---

## `memory`

```ts
const isOpen = state({ modal: false })
```

---

## `local`

`localStorage`

```ts
const theme = state.local({ theme: 'light' })
```

Enable `sync: true` to broadcast changes to other open tabs via `BroadcastChannel`:

```ts
const theme = state.local({ theme: 'light' }, { sync: true })
```
---

## `session`

`sessionStorage`

```ts
const step = state.session({ 'wizard-step': 1 })
```

---

## `url`

`URLSearchParams`

```ts
const query = state.url({ q: '' })
```

---

## `bucket`

[Storage Buckets API](https://developer.chrome.com/docs/web-platform/storage-buckets). Falls back to `local` or `session` if unavailable.

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

## `server`

`AsyncLocalStorage`

```ts
import { state, withServerSession } from 'gjendje'

const requestId = state.server({ 'request-id': '' })

await withServerSession(async () => {
  requestId.set(crypto.randomUUID())
  // ... handle request
})
```

Every `server`-scoped `state()` must run inside `withServerSession`.
