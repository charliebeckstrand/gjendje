# Configure

`configure` allows you to set global values for all state instances.

Call once at your app entry point:

```ts
import { configure } from 'gjendje'

configure({
  // options
})
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

## `registry`

Track state instances in the global registry. Defaults to `true`.

When `true`, calling `state()` twice with the same key + scope returns the cached instance, and instances appear in `getRegistry()`.

When `false`, registry lookup and insertion are skipped for memory-scoped state. Each `state()` call creates a new instance regardless of key. This eliminates the primary bottleneck in high-throughput creation — V8's `Map` operations on a growing registry cap at ~1.5M ops/s, while skipping them reaches ~6M ops/s.

> Useful for apps that create many short-lived or uniquely-keyed memory states (e.g. per-component state in React) and don't rely on duplicate detection.

```ts
configure({ registry: false })

// Each call creates a new instance — no duplicate detection
const a = state('counter', { default: 0 })
const b = state('counter', { default: 0 })
a !== b // true
```

Persistent scopes (`local`, `session`, `bucket`) require the registry for deduplication and storage coordination. If `registry: false` is set alongside a global `scope` that requires the registry, a warning is emitted and the registry remains enabled for that scope.

```ts
configure({ registry: false, scope: 'local' })
// console.warn: [gjendje] registry: false has no effect on scope "local" — persistent scopes always use the registry.
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

Enable cross-tab sync for all syncable scopes (`local`, `bucket`).

Non-syncable scopes (`memory`, `session`, `url`, `server`) emit a warning and ignore.

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

```ts
interface ChangeContext {
  key: string
  scope: Scope
  value: unknown
  previousValue: unknown
}
```

Fires whenever any state instance's value changes, whether via `set()` or `reset()`.

> Useful for global devtools, analytics, or debugging.

```ts
configure({
  onChange: ({ key, scope, value, previousValue }) => {
    console.log(`[${key}] changed:`, previousValue, '→', value)
  },
})
```

---

### `onDestroy`

```ts
interface DestroyContext {
  key: string
  scope: Scope
}
```

Fires when any state instance is destroyed.

> Useful for cleanup analytics, debugging memory leaks, or ensuring dependent systems are notified.

```ts
configure({
  onDestroy: ({ key, scope }) => {
    console.log(`State destroyed: ${key} (${scope})`)
  },
})
```

---

### `onError`

```ts
interface ErrorContext {
  key: string
  scope: Scope
  error: unknown
}
```

Register a global error handler that fires on storage, migration, and hydration failures.

> Useful for reporting to error tracking services.

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

```ts
interface ExpireContext {
  key: string
  scope: Scope
  expiredAt: number
}
```

Fires when a storage bucket's data has expired.

> Useful for tracking cache lifetimes and triggering data refetches.

_Only fires for `bucket` scope instances when the Storage Buckets API is available and the bucket's data has been evicted._

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

```ts
interface HydrateContext {
  key: string
  scope: Scope
  serverValue: unknown
  clientValue: unknown
}
```

Fires after SSR hydration completes for an instance. Receives both the server-rendered value and the client-side storage value. 

> Useful for detecting mismatches and debugging hydration issues.

_Only fires for instances with SSR enabled on browser scopes._

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

```ts
interface InterceptContext {
  key: string
  scope: Scope
  original: unknown
  intercepted: unknown
}
```

Fires when an interceptor modifies a value during `set()` or `reset()`. 

> Useful for debugging and logging interceptor activity.

_Only fires when the intercepted value differs from the original (using `Object.is`). Does not fire when interceptors return the same value they received._

```ts
configure({
  onIntercept: ({ key, scope, original, intercepted }) => {
    console.log(`[${key}] intercepted:`, original, '→', intercepted)
  },
})
```

---

### `onMigrate`

```ts
interface MigrateContext {
  key: string
  scope: Scope
  fromVersion: number
  toVersion: number
  data: unknown
}
```

Fires after a migration chain runs during a read from storage. Receives the version range and the final migrated data.

> Useful for tracking schema migrations in production.

```ts
configure({
  onMigrate: ({ key, scope, fromVersion, toVersion, data }) => {
    analytics.track('state_migrated', { key, fromVersion, toVersion })
  },
})
```

---

### `onQuotaExceeded`

```ts
interface QuotaExceededContext {
  key: string
  scope: Scope
  error: unknown
}
```

Fires specifically when a storage write fails due to quota limits (`QuotaExceededError`).

_Only fires for `DOMException` with `name === 'QuotaExceededError'`._

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

```ts
interface RegisterContext {
  key: string
  scope: Scope
}
```

Fires when a new state instance is registered in the global registry. Fires again if an instance is destroyed and re-created with the same key + scope.

_Does not fire for duplicate key + scope lookups that return a cached instance._

```ts
configure({
  onRegister: ({ key, scope }) => {
    console.log(`New state registered: ${key} (${scope})`)
  },
})
```

---

### `onReset`

```ts
interface ResetContext {
  key: string
  scope: Scope
  previousValue: unknown
}
```

Fires when any state instance's `reset()` method is called.

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

```ts
interface SyncContext {
  key: string
  scope: Scope
  value: unknown
  source: 'remote'
}
```

Fires when a cross-tab sync event updates a value from another tab.

> Useful for conflict resolution or showing "updated in another tab" notifications.

_Only fires for instances with `sync: true` on syncable scopes (`local`, `bucket`)._

```ts
configure({
  onSync: ({ key, scope, value, source }) => {
    showToast(`"${key}" was updated in another tab`)
  },
})
```

---

### `onValidationFail`

```ts
interface ValidationFailContext {
  key: string
  scope: Scope
  value: unknown
}
```

Fires when a `validate` function rejects a value read from storage.

> Useful for detecting schema drift and tracking how often stored data fails validation.

```ts
configure({
  onValidationFail: ({ key, scope, value }) => {
    analytics.track('validation_failed', { key, scope, value })
  },
})
```
