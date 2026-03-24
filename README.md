<img src="https://raw.githubusercontent.com/charliebeckstrand/gjendje/main/logo.png" alt="Screenshot" width="100" />

# gjendje

![GitHub License](https://img.shields.io/github/license/charliebeckstrand/gjendje)
![NPM Version](https://img.shields.io/npm/v/gjendje)

gjendje is a storage-agnostic state management library for TypeScript and JavaScript. It gives you a single, unified API for reactive state — regardless of where that state lives.

[Learn more](https://github.com/charliebeckstrand/gjendje/blob/main/docs/summary.md)

## Install

```sh
npm install gjendje
```

## Quick start

```ts
import { state } from 'gjendje'

const store = state({ count: 0 })

function increment() {
  store.set((prev) => ({ ...prev, count: prev.count + 1 }))
}

const { counter } = store.get()
```

[Examples](https://github.com/charliebeckstrand/gjendje/blob/main/docs/examples.md)

## Configure 

[Configure guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/configure.md)

## Scopes

`memory`, `local`, `session`, `url`, `bucket`, `server`

[Scope guide](https://github.com/charliebeckstrand/gjendje/blob/main/docs/scopes.md)

## API

`get`, `peek`, `set`, `patch`, `reset`, `destroy`, `subscribe`, `watch`, `intercept`, `onChange`

[API reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/api.md)

## Primitives

`computed`, `select`, `previous`, `readonly`, `collection`, `effect`

[Primitives reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/primitives.md)

## Utilities

`configure`, `batch`, `snapshot`, `shallowEqual`, `withHistory`, `withWatch`, `withServerSession`

[Utilities reference](https://github.com/charliebeckstrand/gjendje/blob/main/docs/utilities.md)

## License

MIT

## Icon

Created by [Gulraiz](https://www.flaticon.com/authors/gulraiz)
