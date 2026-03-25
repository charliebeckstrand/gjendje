<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

![NPM Last Update](https://img.shields.io/npm/last-update/gjendje)
![NPM Version](https://img.shields.io/npm/v/gjendje)
![GitHub License](https://img.shields.io/github/license/charliebeckstrand/gjendje)

gjendje is a storage-agnostic state management library for TypeScript and JavaScript. It gives you a single, unified API for reactive state — regardless of where that state lives.

[Learn more](https://github.com/charliebeckstrand/gjendje/blob/main/docs/summary.md#what-gjendje-does)

## Install

```sh
npm install gjendje
```

## Quick start

```ts
import { state } from 'gjendje'

const store = state({ count: 0 })

// set
store.set({ count: 1 })

store.set((prev) => ({ ...prev, count: prev.count + 1 }))

// get
store.get()

const { count } = store.get()

// reset
store.reset()
```

[Examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)

## Framework Bindings

### React

```tsx
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/react'

const counter = state({ counter: 0 })

function Counter() {
  const [count, setCount, resetCount] = useGjendje(counter)

  return <button onClick={() => setCount(prev => prev + 1)}>{count}</button>
}
```

[React guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/react.md)

### Vue

```vue
<script setup>
import { state } from 'gjendje'
import { useGjendje } from 'gjendje/vue'

const counter = state({ counter: 0 })

const count = useGjendje(counter)
</script>

<template>
  <button @click="count++">{{ count }}</button>
</template>
```

[Vue guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/vue.md)

## API

`get`, `peek`, `set`, `patch`, `reset`, `destroy`, `subscribe`, `watch`, `intercept`, `onChange`

[API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md)

## Primitives

`computed`, `select`, `previous`, `readonly`, `collection`, `effect`

[Primitives reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/primitives.md)

## Scopes

`memory`, `local`, `session`, `url`, `bucket`, `server`

[Scope guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md)

## Utilities

`configure`, `batch`, `snapshot`, `shallowEqual`, `withHistory`, `withWatch`, `withServerSession`

[Utilities reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/utilities.md)

## DevTools

[DevTools guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/devtools.md)

## Global Config (`Configure`)

`scope`, `maxKeys`, `prefix`, `requireValidation`, `registry`, `ssr`, `sync`, `warnOnDuplicate`, `onChange`, `onDestroy`, `onError`, `onExpire`, `onHydrate`, `onIntercept`, `onMigrate`, `onQuotaExceeded`, `onRegister`, `onReset`, `onSync`, `onValidationFail`

[Configure guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
