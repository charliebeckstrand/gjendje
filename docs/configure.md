# Configure

Sets global defaults for all state instances.

```ts
import { configure } from 'gjendje'

configure({
  scope: 'local',
})
```

```ts
const theme = state({ theme: 'light' })

theme.scope // 'local' — derived from configure
```

---

## `scope`

Sets a scope when `scope` is omitted from `state()`.

```ts
configure({ scope: 'local' })

const theme = state({ theme: 'light' })

theme.scope // 'local'

// Per-instance scope always takes precedence
const temp = state({ temp: 0 }, { scope: 'memory' })

temp.scope // 'memory'
```

---

## `keyPattern`

Enforce a naming convention for all state keys. Throws on `state()` if the key does not match.

> Useful for preventing accidental spaces, special characters, or long keys that may break URL scope.

```ts
configure({ keyPattern: /^[a-z][a-z0-9:_-]*$/ })

state('user-prefs', { default: {} })  // ok
state('User Prefs!', { default: {} }) // throws
```
---

## `logLevel`

Control the verbosity of internal logs.

| Level | Behavior |
|-------|----------|
| `'silent'` | No console output |
| `'debug'` | All messages including hydration fallbacks |
| `'warn'` | Warnings and errors (default) |
| `'error'` | Errors only |

```ts
configure({ logLevel: 'silent' }) // suppress all logs
configure({ logLevel: 'debug' })  // verbose — useful during development
```

---

## `maxKeys`

Limit the total number of registered state instances. Throws when the limit is exceeded.

> Useful for catching dynamic key generation patterns that cause memory leaks.

```ts
configure({ maxKeys: 100 })

// After 100 state instances, the next state() call throws
state('key-101', 0) // Error: maxKeys limit (100) reached
```

---

## `prefix`

Prepend a namespace to all storage keys.

```ts
configure({ prefix: 'myapp' })

const theme = state.local({ theme: 'light' })
```

Per-instance override:

```ts
// Use a different prefix
state.local({ theme: 'light' }, { prefix: 'other' })

// Disable prefix entirely
state.local({ 'raw-key': 0 }, { prefix: false })
```

---

## `requireValidation`

When enabled, any `state()` call with a persistent scope (`local`, `session`, `bucket`) must include a `validate` option.

```ts
configure({ requireValidation: true })

// Throws — no validate function
state.local({ theme: 'light' })

// Works — validate provided
state.local({ theme: 'light' }, {
  validate: (v): v is string => typeof v === 'string',
})
```

---

## `ssr`

Enable server-side rendering globally. All browser-scope instances get SSR safety automatically.

```ts
configure({ ssr: true })

const theme = state.local({ theme: 'light' })
```

When SSR is enabled:
- On the server: browser scopes silently fall back to `memory`
- On the client before hydration: uses the default value to match server output
- On the client after hydration: reads real storage and emits an update if different

---

## `sync`

Enable cross-tab sync for all syncable scopes (`local`, `bucket`). Non-syncable scopes (`memory`, `session`, `url`, `server`) emit a warning and ignore.


```ts
configure({ sync: true })

const theme = state.local({ theme: 'light' })
```

---

## `warnOnDuplicate`

Emit a console warning when `state()` is called with a key + scope combination that already exists.

> Useful for catching accidental collisions during development.

```ts
configure({ warnOnDuplicate: true })

state.local({ theme: 'light' })
state.local({ theme: 'light' })
// console.warn: [gjendje] Duplicate state("theme") with scope "local". Returning cached instance.
```

---

## Events

### `onChange`

Fires whenever any state instance's value changes, whether via `set()` or `reset()`.

> Useful for global devtools, analytics, or debugging.

```ts
interface ChangeContext {
  key: string
  scope: Scope
  value: unknown
  previousValue: unknown
}
```

```ts
configure({
  onChange: ({ key, scope, value, previousValue }) => {
    console.log(`[${key}] changed:`, previousValue, '→', value)
  },
})
```

---

### `onDestroy`

Fires when any state instance is destroyed.

> Useful for cleanup analytics, debugging memory leaks, or ensuring dependent systems are notified.

```ts
interface DestroyContext {
  key: string
  scope: Scope
}
```

```ts
configure({
  onDestroy: ({ key, scope }) => {
    console.log(`State destroyed: ${key} (${scope})`)
  },
})
```

---

### `onError`

Register a global error handler that fires on storage, migration, and hydration failures.

> Useful for reporting to error tracking services.

```ts
interface ErrorContext {
  key: string
  scope: Scope
  error: unknown
}
```

```ts
configure({
  onError: ({ key, scope, error }) => {
    Sentry.captureException(error, {
      tags: { gjendjeKey: key, gjendjeScope: scope },
    })
  },
})
```

---

### `onExpire`

Fires when a storage bucket's data has expired. Only fires for `bucket` scope instances when the Storage Buckets API is available and the bucket's data has been evicted.

> Useful for tracking cache lifetimes and triggering data refetches.

```ts
interface ExpireContext {
  key: string
  scope: Scope
  expiredAt: number
}
```

```ts
configure({
  onExpire: ({ key, scope, expiredAt }) => {
    console.log(`Bucket data for "${key}" expired at`, new Date(expiredAt))

    refetchData(key)
  },
})
```

---

### `onHydrate`

Fires after SSR hydration completes for an instance. Receives both the server-rendered value and the client-side storage value. 

> Only fires for instances with SSR enabled on browser scopes.

> Useful for detecting mismatches and debugging hydration issues.

```ts
interface HydrateContext {
  key: string
  scope: Scope
  serverValue: unknown
  clientValue: unknown
}
```

```ts
configure({
  onHydrate: ({ key, scope, serverValue, clientValue }) => {
    if (JSON.stringify(serverValue) !== JSON.stringify(clientValue)) {
      console.warn(`Hydration mismatch for ${key}:`, { serverValue, clientValue })
    }
  },
})
```

---

### `onIntercept`

Fires when an interceptor modifies a value during `set()` or `reset()`. Only fires when the intercepted value differs from the original (using `Object.is`).

> Does not fire when interceptors return the same value they received.

> Useful for debugging and logging interceptor activity.

```ts
interface InterceptContext {
  key: string
  scope: Scope
  original: unknown
  intercepted: unknown
}
```

```ts
configure({
  onIntercept: ({ key, scope, original, intercepted }) => {
    console.log(`[${key}] intercepted:`, original, '→', intercepted)
  },
})
```

---

### `onMigrate`

Fires after a migration chain runs during a read from storage. Receives the version range and the final migrated data.

> Useful for tracking schema migrations in production.

```ts
interface MigrateContext {
  key: string
  scope: Scope
  fromVersion: number
  toVersion: number
  data: unknown
}
```

```ts
configure({
  onMigrate: ({ key, scope, fromVersion, toVersion, data }) => {
    analytics.track('state_migrated', { key, fromVersion, toVersion })
  },
})
```

---

### `onQuotaExceeded`

Fires specifically when a storage write fails due to quota limits (`QuotaExceededError`).

> Only fires for `DOMException` with `name === 'QuotaExceededError'`.

```ts
interface QuotaExceededContext {
  key: string
  scope: Scope
  error: unknown
}
```

```ts
configure({
  onQuotaExceeded: ({ key, scope, error }) => {
    showToast('Storage is full. Some preferences may not be saved.')

    evictOldKeys()
  },
})
```

---

### `onRegister`

Fires when a new state instance is registered in the global registry. 

> Does not fire for duplicate key + scope lookups that return a cached instance.

> Fires again if an instance is destroyed and re-created with the same key + scope.

```ts
interface RegisterContext {
  key: string
  scope: Scope
}
```

```ts
configure({
  onRegister: ({ key, scope }) => {
    console.log(`New state registered: ${key} (${scope})`)
  },
})
```

---

### `onReset`

Fires when any state instance's `reset()` method is called.

```ts
interface ResetContext {
  key: string
  scope: Scope
  previousValue: unknown
}
```

```ts
configure({
  onReset: ({ key, scope, previousValue }) => {
    console.log(`State reset: ${key} (was ${JSON.stringify(previousValue)})`)

    clearDependentCache(key)
  },
})
```

---

### `onSync`

Fires when a cross-tab sync event updates a value from another tab.

> Only fires for instances with `sync: true` on syncable scopes (`local`, `bucket`).

> Useful for conflict resolution or showing "updated in another tab" notifications.

```ts
interface SyncContext {
  key: string
  scope: Scope
  value: unknown
  source: 'remote'
}
```

```ts
configure({
  onSync: ({ key, scope, value, source }) => {
    showToast(`"${key}" was updated in another tab`)
  },
})
```

---

### `onValidationFail`

Fires when a `validate` function rejects a value read from storage.

> Useful for detecting schema drift and tracking how often stored data fails validation.

```ts
interface ValidationFailContext {
  key: string
  scope: Scope
  value: unknown
}
```

```ts
configure({
  onValidationFail: ({ key, scope, value }) => {
    analytics.track('validation_failed', { key, scope, value })
  },
})
```
