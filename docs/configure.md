# Configure & Utilities

## Utilities

| Utility | Description |
|---------|-------------|
| `batch(fn)` | Group updates so subscribers are notified once. |
| `withHistory(instance)` | Adds undo/redo to any state instance. |
| `withWatch(instance)` | Adds per-key change tracking to any instance. |
| `snapshot()` | Returns a read-only snapshot of all registered instances. |
| `shallowEqual(a, b)` | Shallow equality check for primitives, arrays, and plain objects. |
| `withServerSession(fn)` | Wraps a callback in `AsyncLocalStorage` context for `server` scope. |
| `configure(config)` | Set global defaults and event handlers. |

---

## `configure()`

```ts
import { configure } from 'gjendje'

configure(config: GjendjeConfig): void
```

Sets global defaults for all state instances. Call once at app startup before creating any state.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `Scope` | `'memory'` | Default scope for all state instances |
| `keyPattern` | `RegExp` | `undefined` | Enforce a naming pattern for state keys |
| `logLevel` | `LogLevel` | `'warn'` | Control log verbosity |
| `maxKeys` | `number` | `undefined` | Cap the total number of registered state instances |
| `prefix` | `string` | `undefined` | Prepends to all storage keys |
| `requireValidation` | `boolean` | `false` | Require a `validate` option for persisted scopes |
| `ssr` | `boolean` | `false` | Enable SSR mode globally |
| `sync` | `boolean` | `false` | Enable cross-tab sync globally for all syncable scopes |
| `warnOnDuplicate` | `boolean` | `false` | Warn on duplicate key + scope |

## Events

| Event | Type | Description |
|-------|------|-------------|
| `onChange` | `(context: ChangeContext) => void` | Fires when any instance's value changes (via `set` or `reset`) |
| `onDestroy` | `(context: DestroyContext) => void` | Fires when any instance is destroyed |
| `onError` | `(context: ErrorContext) => void` | Global error handler |
| `onExpire` | `(context: ExpireContext) => void` | Fires when a storage bucket's data has expired |
| `onHydrate` | `(context: HydrateContext) => void` | Fires after SSR hydration completes |
| `onIntercept` | `(context: InterceptContext) => void` | Fires when an interceptor modifies a value |
| `onMigrate` | `(context: MigrateContext) => void` | Fires after a migration chain runs |
| `onQuotaExceeded` | `(context: QuotaExceededContext) => void` | Fires when a storage write fails due to quota |
| `onRegister` | `(context: RegisterContext) => void` | Fires when a new instance is registered |
| `onReset` | `(context: ResetContext) => void` | Fires when any instance is reset to its default value |
| `onSync` | `(context: SyncContext) => void` | Fires when a cross-tab sync event arrives |
| `onValidationFail` | `(context: ValidationFailContext) => void` | Fires when a `validate` function rejects a stored value |

---

## `keyPattern`

Enforce a naming convention for all state keys. Throws on `state()` if the key does not match.

```ts
configure({ keyPattern: /^[a-z][a-z0-9:_-]*$/ })

state('user-prefs', { default: {} })  // ok
state('User Prefs!', { default: {} }) // throws
```

Useful for preventing accidental spaces, special characters, or overly long keys that may break URL scope.

---

## `logLevel`

Control the verbosity of internal gjendje logs.

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

Limit the total number of registered state instances. Throws when the limit is exceeded. Useful for catching dynamic key generation patterns that cause memory leaks.

```ts
configure({ maxKeys: 100 })

// After 100 state instances, the next state() call throws
state('key-101', 0) // Error: maxKeys limit (100) reached
```

Slots are freed when instances are destroyed.

---

## `prefix`

Prepend a namespace to all storage keys. Prevents collisions between apps sharing the same storage.

```ts
configure({ prefix: 'myapp' })

const theme = state.local({ theme: 'light' })
// Stored under key "myapp:theme" in localStorage
```

Per-instance override:

```ts
// Use a different prefix
state.local({ theme: 'light' }, { prefix: 'other' })
// Stored under "other:theme"

// Disable prefix entirely
state.local({ 'raw-key': 0 }, { prefix: false })
// Stored under "raw-key"
```

---

## `requireValidation`

When enabled, any `state()` call with a persistent scope (`local`, `session`, `bucket`) must include a `validate` option. Throws otherwise.

```ts
configure({ requireValidation: true })

// Throws — no validate function
state.local({ theme: 'light' })

// Works — validate provided
state.local({ theme: 'light' }, {
  validate: (v): v is string => typeof v === 'string',
})
```

Non-persistent scopes (`memory`, `url`, `server`) are not affected.

---

## `scope`

Sets a scope when `scope` is omitted from `state()`. Without this, the default is `'memory'`.

```ts
configure({ scope: 'local' })

const theme = state({ theme: 'light' })

theme.scope // 'local'

// Per-instance scope always takes precedence
const temp = state({ temp: 0 }, { scope: 'memory' })

temp.scope // 'memory'
```

---

## `ssr`

Enable SSR mode globally. Equivalent to passing `ssr: true` on every `state()` call.

```ts
configure({ ssr: true })

// All browser-scope instances get SSR safety automatically
const theme = state.local({ theme: 'light' })
```

When SSR is enabled:
- On the server: browser scopes silently fall back to `memory`
- On the client before hydration: uses the default value to match server output
- On the client after hydration: reads real storage and emits an update if different

Per-instance `ssr: false` overrides the global setting.

---

## `sync`

Enable cross-tab sync globally for all syncable scopes (`local`, `bucket`). Equivalent to passing `sync: true` on every `state()` call.

```ts
configure({ sync: true })

// All local/bucket instances automatically sync across tabs
const theme = state.local({ theme: 'light' })
```

Non-syncable scopes (`memory`, `session`, `url`, `server`) emit a warning and ignore the setting.

Per-instance `sync: false` overrides the global setting.

---

## `warnOnDuplicate`

Emit a console warning when `state()` is called with a key + scope combination that already exists. Helpful for catching accidental collisions during development.

```ts
configure({ warnOnDuplicate: true })

state.local({ theme: 'light' })
state.local({ theme: 'light' })
// console.warn: [gjendje] Duplicate state("theme") with scope "local". Returning cached instance.
```

The duplicate still returns the cached instance — this is purely a development aid.

---

## Events

### `onChange`

Fires whenever any state instance's value changes, whether via `set()` or `reset()`. Useful for global devtools, analytics, or debugging.

```ts
configure({
  onChange: ({ key, scope, value, previousValue }) => {
    console.log(`[${key}] changed:`, previousValue, '→', value)
  },
})
```

The `ChangeContext` shape:

```ts
interface ChangeContext {
  key: string
  scope: Scope
  value: unknown
  previousValue: unknown
}
```

Fires after the value has been written to the adapter and after per-instance `onChange` handlers. Does not fire when `isEqual` prevents the update.

---

### `onDestroy`

Fires when any state instance is destroyed. Useful for cleanup analytics, debugging memory leaks, or ensuring dependent systems are notified.

```ts
configure({
  onDestroy: ({ key, scope }) => {
    console.log(`State destroyed: ${key} (${scope})`)
  },
})
```

The `DestroyContext` shape:

```ts
interface DestroyContext {
  key: string
  scope: Scope
}
```

---

### `onError`

Register a global error handler that fires on storage, migration, and hydration failures. Useful for reporting to error tracking services.

```ts
configure({
  onError: ({ key, scope, error }) => {
    Sentry.captureException(error, {
      tags: { gjendjeKey: key, gjendjeScope: scope },
    })
  },
})
```

The `ErrorContext` shape:

```ts
interface ErrorContext {
  key: string
  scope: Scope
  error: unknown
}
```

This handler is called in addition to the normal fallback behavior (falling back to defaults, etc.). It does not prevent the fallback.

---

### `onExpire`

Fires when a storage bucket's data has expired. Detected when the bucket is opened and contains no data, but the fallback storage still has a value from a previous session. Useful for tracking cache lifetimes and triggering data refetches.

```ts
configure({
  onExpire: ({ key, scope, expiredAt }) => {
    console.log(`Bucket data for "${key}" expired at`, new Date(expiredAt))
    refetchData(key)
  },
})
```

The `ExpireContext` shape:

```ts
interface ExpireContext {
  key: string
  scope: Scope
  expiredAt: number
}
```

Only fires for `bucket` scope instances when the Storage Buckets API is available and the bucket's data has been evicted.

---

### `onHydrate`

Fires after SSR hydration completes for an instance. Receives both the server-rendered value and the client-side storage value. Useful for detecting mismatches and debugging hydration issues.

```ts
configure({
  onHydrate: ({ key, scope, serverValue, clientValue }) => {
    if (JSON.stringify(serverValue) !== JSON.stringify(clientValue)) {
      console.warn(`Hydration mismatch for ${key}:`, { serverValue, clientValue })
    }
  },
})
```

The `HydrateContext` shape:

```ts
interface HydrateContext {
  key: string
  scope: Scope
  serverValue: unknown
  clientValue: unknown
}
```

Only fires for instances with SSR enabled on browser scopes.

---

### `onIntercept`

Fires when an interceptor modifies a value during `set()` or `reset()`. Only fires when the intercepted value differs from the original (using `Object.is`). Useful for debugging and logging interceptor activity.

```ts
configure({
  onIntercept: ({ key, scope, original, intercepted }) => {
    console.log(`[${key}] intercepted:`, original, '→', intercepted)
  },
})
```

The `InterceptContext` shape:

```ts
interface InterceptContext {
  key: string
  scope: Scope
  original: unknown
  intercepted: unknown
}
```

Does not fire when interceptors return the same value they received.

---

### `onMigrate`

Fires after a migration chain runs during a read from storage. Receives the version range and the final migrated data. Useful for tracking schema migrations in production.

```ts
configure({
  onMigrate: ({ key, scope, fromVersion, toVersion, data }) => {
    analytics.track('state_migrated', { key, fromVersion, toVersion })
  },
})
```

The `MigrateContext` shape:

```ts
interface MigrateContext {
  key: string
  scope: Scope
  fromVersion: number
  toVersion: number
  data: unknown
}
```

This fires each time a stored value is read that requires migration. If you want to track only the first migration per session, debounce on the caller side.

---

### `onQuotaExceeded`

Fires specifically when a storage write fails due to quota limits (`QuotaExceededError`). More targeted than `onError` — lets apps react by evicting old keys or showing a notification.

```ts
configure({
  onQuotaExceeded: ({ key, scope, error }) => {
    showToast('Storage is full. Some preferences may not be saved.')
    evictOldKeys()
  },
})
```

The `QuotaExceededContext` shape:

```ts
interface QuotaExceededContext {
  key: string
  scope: Scope
  error: unknown
}
```

Only fires for `DOMException` with `name === 'QuotaExceededError'`.

---

### `onRegister`

Fires when a new state instance is registered in the global registry. Does not fire for duplicate key + scope lookups that return a cached instance.

```ts
configure({
  onRegister: ({ key, scope }) => {
    console.log(`New state registered: ${key} (${scope})`)
  },
})
```

The `RegisterContext` shape:

```ts
interface RegisterContext {
  key: string
  scope: Scope
}
```

Fires again if an instance is destroyed and re-created with the same key + scope.

---

### `onReset`

Fires when any state instance's `reset()` method is called. Distinct from `onChange` because it signals intent — the user explicitly reset state to its default. Useful for audit trails and clearing dependent caches.

```ts
configure({
  onReset: ({ key, scope, previousValue }) => {
    console.log(`State reset: ${key} (was ${JSON.stringify(previousValue)})`)
    clearDependentCache(key)
  },
})
```

The `ResetContext` shape:

```ts
interface ResetContext {
  key: string
  scope: Scope
  previousValue: unknown
}
```

Does not fire when `isEqual` prevents the update. Both `onReset` and `onChange` fire on a successful reset — `onReset` fires first.

---

### `onSync`

Fires when a cross-tab sync event updates a value from another tab. Useful for conflict resolution or showing "updated in another tab" notifications.

```ts
configure({
  onSync: ({ key, scope, value, source }) => {
    showToast(`"${key}" was updated in another tab`)
  },
})
```

The `SyncContext` shape:

```ts
interface SyncContext {
  key: string
  scope: Scope
  value: unknown
  source: 'remote'
}
```

Only fires for instances with `sync: true` on syncable scopes (`local`, `bucket`).

---

### `onValidationFail`

Fires when a `validate` function rejects a value read from storage. More targeted than `onError` — lets you distinguish corrupted or stale storage data from other error types. Useful for detecting schema drift and tracking how often stored data fails validation.

```ts
configure({
  onValidationFail: ({ key, scope, value }) => {
    analytics.track('validation_failed', { key, scope, value })
  },
})
```

The `ValidationFailContext` shape:

```ts
interface ValidationFailContext {
  key: string
  scope: Scope
  value: unknown
}
```

Fires before falling back to the default value. The `value` is the rejected data as read from storage (after migration, if any).
