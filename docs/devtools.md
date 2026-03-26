# DevTools

gjendje ships a dedicated `gjendje/devtools` entry point for debugging. It provides two features:

1. **Redux DevTools Extension** integration with time-travel debugging
2. **Enhanced console logger** with color-coded scope labels and grouped output

Both are fully tree-shakeable — if you don't import `gjendje/devtools`, none of this code ends up in your bundle.

---

## Quick start

```ts
import { enableDevTools } from 'gjendje/devtools'

// Enable in development only
if (import.meta.env.DEV) {
  enableDevTools()
}
```

This enables both the Redux DevTools adapter and the console logger. Call the returned function (or `disableDevTools()`) to turn them off.

---

## Redux DevTools Extension

The [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools) is available for Chrome, Firefox, and Edge. Once installed, gjendje dispatches every `set()`, `patch()`, `reset()`, `register`, and `destroy` event to the DevTools timeline.

### Setup

```ts
import { enableDevTools } from 'gjendje/devtools'

enableDevTools({ name: 'My App' })
```

Or connect to Redux DevTools without the logger:

```ts
import { connectReduxDevTools } from 'gjendje/devtools'

const disconnect = connectReduxDevTools({ name: 'My App' })
```

### Time-travel debugging

Jump to any previous state in the DevTools timeline and gjendje instances update to match. This works via the extension's `JUMP_TO_STATE` / `JUMP_TO_ACTION` messages.

### Action format

Each dispatched action includes:

| Field | Description |
|-------|-------------|
| `type` | `'set'`, `'reset'`, `'register'`, or `'destroy'` |
| `key` | The state instance key |
| `scope` | The storage scope (`'memory'`, `'local'`, etc.) |
| `value` | The new value (for `set`) |
| `previousValue` | The previous value (for `set` and `reset`) |

---

## Console logger

The logger prints state changes with color-coded scope labels and console grouping:

```
▸ [gjendje] set "theme" (local)
    prev: "light"
    next: "dark"
```

### Enable standalone

```ts
import { enableLogger } from 'gjendje/devtools'

const disable = enableLogger()
```

### Custom logger function

Redirect log output to an external service:

```ts
import { enableLogger } from 'gjendje/devtools'

enableLogger({
  logger: (entry) => {
    // entry: { type, key, scope, value, previousValue, timestamp }
    analytics.track('state_change', entry)
  },
})
```

### Filter by key

Only log state changes for specific keys:

```ts
enableLogger({
  filter: (key, scope) => key.startsWith('user'),
})
```

### Expanded groups

By default, console groups are collapsed. Set `collapsed: false` to expand them:

```ts
enableLogger({ collapsed: false })
```

---

## Options reference

### `enableDevTools(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `reduxDevTools` | `boolean` | `true` | Connect to Redux DevTools Extension |
| `name` | `string` | `'gjendje'` | Name shown in Redux DevTools |
| `logger` | `boolean` | `true` | Enable console logger |
| `loggerOptions` | `LoggerOptions` | — | Options for the logger (see below) |

### `LoggerOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logger` | `(entry: LogEntry) => void` | styled console output | Custom log function |
| `filter` | `(key: string, scope: Scope) => boolean` | — | Only log matching keys |
| `collapsed` | `boolean` | `true` | Use collapsed console groups |

---

## Important: enable before creating state

DevTools hooks into gjendje's global `configure()` callbacks. State instances capture the config at creation time, so **enable DevTools before creating your state instances** for full coverage:

```ts
// ✅ Correct — devtools sees all state changes
enableDevTools()
const theme = state.local({ theme: 'light' })

// ❌ Won't work — theme was created before devtools
const theme = state.local({ theme: 'light' })
enableDevTools()
```

---

## Production builds

Since `gjendje/devtools` is a separate entry point, it tree-shakes completely when not imported. Wrap the import in a dev-only condition:

```ts
if (import.meta.env.DEV) {
  const { enableDevTools } = await import('gjendje/devtools')
  enableDevTools()
}
```

Or use your bundler's dead-code elimination with a static condition.
