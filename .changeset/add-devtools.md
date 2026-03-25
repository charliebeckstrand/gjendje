---
"gjendje": minor
---

## DevTools integration (`gjendje/devtools`)

Added a new `gjendje/devtools` entry point with two features for debugging state management:

### Redux DevTools Extension adapter

- **`enableDevTools()`** — one-call setup that connects to the [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools) and enables the console logger
- **`connectReduxDevTools()`** — standalone Redux DevTools connection
- Dispatches `set`, `reset`, `register`, and `destroy` actions to the DevTools timeline
- **Time-travel debugging** — jumping to a previous state in DevTools replays values into gjendje instances via `JUMP_TO_STATE` / `JUMP_TO_ACTION`
- No-ops silently when the extension is not installed

### Enhanced console logger

- **`enableLogger()`** — color-coded scope labels with console grouping showing previous and next values
- **Custom logger function** — redirect output to external services via `loggerOptions.logger`
- **Key filtering** — only log specific keys via `loggerOptions.filter`
- Collapsed/expanded console groups via `loggerOptions.collapsed`

### Architecture

- Fully tree-shakeable — zero cost when not imported
- Separate entry point keeps DevTools code out of production bundles
- Chains with existing `configure()` callbacks (preserves user-defined `onChange`, `onReset`, `onRegister`, `onDestroy`)
- Size budget: < 2 kB for the full devtools entry point
