# Configure

```ts
import { configure } from 'gjendje'

configure(config: GjendjeConfig): void
```

Sets global defaults for all state instances. Call once at app startup before creating any state.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scope` | `Scope` | `'render'` | Default scope for all state instances |
| `keyPattern` | `RegExp` | `undefined` | Enforce a naming pattern for state keys |
| `logLevel` | `LogLevel` | `'warn'` | Control log verbosity |
| `maxKeys` | `number` | `undefined` | Cap the total number of registered state instances |
| `prefix` | `string` | `undefined` | Prepends to all storage keys |
| `requireValidation` | `boolean` | `false` | Require a `validate` option for persisted scopes |
| `ssr` | `boolean` | `false` | Enable SSR mode globally |
| `sync` | `boolean` | `false` | Enable cross-tab sync globally for all syncable scopes |
| `warnOnDuplicate` | `boolean` | `false` | Warn on duplicate key + scope |
| `onDestroy` | `(context) => void` | `undefined` | Fires when any instance is destroyed |
| `onError` | `(context) => void` | `undefined` | Global error handler |
| `onHydrate` | `(context) => void` | `undefined` | Fires after SSR hydration completes |
| `onMigrate` | `(context) => void` | `undefined` | Fires after a migration chain runs |
| `onQuotaExceeded` | `(context) => void` | `undefined` | Fires when a storage write fails due to quota |
| `onRegister` | `(context) => void` | `undefined` | Fires when a new instance is registered |
| `onSync` | `(context) => void` | `undefined` | Fires when a cross-tab sync event arrives |

---

## `scope`

Sets the default scope when `scope` is omitted from `state()`. Without this, the default is `'render'`.

```ts
configure({ scope: 'local' })

const theme = state('theme', { default: 'light' })

theme.scope // 'local'

// Per-instance scope always takes precedence
const temp = state('temp', { default: 0, scope: 'render' })

temp.scope // 'render'
```

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
state('key-101', { default: 0 }) // Error: maxKeys limit (100) reached
```

Slots are freed when instances are destroyed.

---

## `prefix`

Prepend a namespace to all storage keys. Prevents collisions between apps sharing the same storage.

```ts
configure({ prefix: 'myapp' })

const theme = state('theme', { default: 'light', scope: 'local' })
// Stored under key "myapp:theme" in localStorage
```

Per-instance override:

```ts
// Use a different prefix
state('theme', { default: 'light', scope: 'local', prefix: 'other' })
// Stored under "other:theme"

// Disable prefix entirely
state('raw-key', { default: 0, scope: 'local', prefix: false })
// Stored under "raw-key"
```

---

## `requireValidation`

When enabled, any `state()` call with a persistent scope (`local`, `tab`, `bucket`) must include a `validate` option. Throws otherwise.

```ts
configure({ requireValidation: true })

// Throws — no validate function
state('theme', { default: 'light', scope: 'local' })

// Works — validate provided
state('theme', {
  default: 'light',
  scope: 'local',
  validate: (v): v is string => typeof v === 'string',
})
```

Non-persistent scopes (`render`, `url`, `server`) are not affected.

---

## `ssr`

Enable SSR mode globally. Equivalent to passing `ssr: true` on every `state()` call.

```ts
configure({ ssr: true })

// All browser-scope instances get SSR safety automatically
const theme = state('theme', { default: 'light', scope: 'local' })
```

When SSR is enabled:
- On the server: browser scopes silently fall back to `render`
- On the client before hydration: uses the default value to match server output
- On the client after hydration: reads real storage and emits an update if different

Per-instance `ssr: false` overrides the global setting.

---

## `sync`

Enable cross-tab sync globally for all syncable scopes (`local`, `bucket`). Equivalent to passing `sync: true` on every `state()` call.

```ts
configure({ sync: true })

// All local/bucket instances automatically sync across tabs
const theme = state('theme', { default: 'light', scope: 'local' })
```

Non-syncable scopes (`render`, `tab`, `url`, `server`) emit a warning and ignore the setting.

Per-instance `sync: false` overrides the global setting.

---

## `warnOnDuplicate`

Emit a console warning when `state()` is called with a key + scope combination that already exists. Helpful for catching accidental collisions during development.

```ts
configure({ warnOnDuplicate: true })

state('theme', { default: 'light', scope: 'local' })
state('theme', { default: 'light', scope: 'local' })
// console.warn: [gjendje] Duplicate state("theme") with scope "local". Returning cached instance.
```

The duplicate still returns the cached instance — this is purely a development aid.

---

## `onError`

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

## `onDestroy`

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

## `onHydrate`

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

## `onMigrate`

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

## `onQuotaExceeded`

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

## `onRegister`

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

## `onSync`

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
