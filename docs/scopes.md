# Scopes

Every `state()` call targets a scope — the storage backend that holds the value. Pick the scope that matches the lifetime you need.

---

## Which scope should I use?

**Does this value need to survive a page reload?**

- **No** → `render`

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

## `render`

**The default scope.** In-memory only. Lost on refresh.

Use for UI state that doesn't need persistence — modal open/closed, form input while typing, drag position.

```ts
const isOpen = state({ modal: false })
```

---

## `session`

Backed by `sessionStorage`. Survives page reloads but is scoped to the tab — opening a new tab starts fresh.

Use for state that should reset when the user opens a new tab but persist through navigation — wizard progress, unsaved draft indicators.

```ts
const step = state.session({ 'wizard-step': 1 })
```

---

## `local`

Backed by `localStorage`. Persists across tabs, reloads, and browser restarts.

Use for user preferences, theme, locale, feature flags — anything that should feel "remembered."

```ts
const theme = state.local({ theme: 'light' })
```

Enable `sync: true` to broadcast changes to other open tabs via `BroadcastChannel`:

```ts
const theme = state.local({ theme: 'light' }, { sync: true })
```

---

## `url`

Backed by `URLSearchParams`. The value is encoded in the URL query string, making it bookmarkable and shareable.

Use for filters, search queries, pagination — state that should be part of the link.

```ts
const query = state.url({ q: '' })
```

---

## `bucket`

Backed by the [Storage Buckets API](https://developer.chrome.com/docs/web-platform/storage-buckets). Provides isolated storage with optional quota limits and expiry. Falls back to `local` or `session` if unavailable.

Use when you need more control than `localStorage` offers — large datasets, cache isolation, or automatic expiry.

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

Bucket scope is async — `await instance.ready` before reading:

```ts
await cache.ready

cache.get()
```

---

## `server`

Backed by Node.js `AsyncLocalStorage`. State is scoped to the current request — isolated between concurrent requests.

Use for request-level context in server-side rendering (user session, request ID, locale).

```ts
import { state, withServerSession } from 'gjendje'

const requestId = state.server({ 'request-id': '' })

await withServerSession(async () => {
  requestId.set(crypto.randomUUID())
  // ... handle request
})
```

Every `server`-scoped `state()` must run inside `withServerSession`.
