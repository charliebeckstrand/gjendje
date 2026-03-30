/**
 * gjendje/devtools — Redux DevTools integration and enhanced logging.
 *
 * This module is fully tree-shakeable. Only the features you import are
 * included in your bundle. In production, simply don't import this module.
 *
 * @example
 * ```ts
 * import { enableDevTools } from 'gjendje/devtools'
 *
 * if (import.meta.env.DEV) {
 *   enableDevTools()
 * }
 * ```
 */

import { addConfigHook, removeConfigHook } from '../config.js'
import type { Scope } from '../types/index.js'
import {
	disableLogger,
	enableLogger,
	type LoggerOptions,
	logChange,
	logDestroy,
	logRegister,
	logReset,
} from './logger.js'
import {
	connectReduxDevTools,
	disconnectReduxDevTools,
	dispatchChange,
	dispatchDestroy,
	dispatchRegister,
	dispatchReset,
} from './redux-devtools.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevToolsOptions {
	/**
	 * Connect to the Redux DevTools Extension for time-travel debugging.
	 * Defaults to `true`.
	 */
	reduxDevTools?: boolean

	/**
	 * Name shown in the Redux DevTools Extension. Defaults to `'gjendje'`.
	 */
	name?: string

	/**
	 * Enable the enhanced console logger. Defaults to `true`.
	 */
	logger?: boolean

	/**
	 * Options passed to the logger (custom logger function, filter, etc.).
	 */
	loggerOptions?: LoggerOptions
}

// ---------------------------------------------------------------------------
// Hook handlers — dispatched via the config hook registry so they never
// conflict with user-provided callbacks set via configure().
// ---------------------------------------------------------------------------

let devToolsEnabled = false

function devToolsOnChange(ctx: {
	key: string
	scope: Scope
	value: unknown
	previousValue: unknown
}): void {
	dispatchChange(ctx.key, ctx.scope, ctx.value, ctx.previousValue)

	logChange(ctx.key, ctx.scope, ctx.value, ctx.previousValue)
}

function devToolsOnReset(ctx: { key: string; scope: Scope; previousValue: unknown }): void {
	dispatchReset(ctx.key, ctx.scope, ctx.previousValue)

	logReset(ctx.key, ctx.scope, ctx.previousValue)
}

function devToolsOnRegister(ctx: { key: string; scope: Scope }): void {
	dispatchRegister(ctx.key, ctx.scope)

	logRegister(ctx.key, ctx.scope)
}

function devToolsOnDestroy(ctx: { key: string; scope: Scope }): void {
	dispatchDestroy(ctx.key, ctx.scope)

	logDestroy(ctx.key, ctx.scope)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enable gjendje DevTools integration.
 *
 * Registers internal config hooks for `onChange`, `onReset`, `onRegister`,
 * and `onDestroy`. These hooks run alongside — never replace — user-provided
 * callbacks set via `configure()`, so the two cannot overwrite each other.
 *
 * Both Redux DevTools and the logger are enabled by default. Pass options
 * to selectively enable/disable each feature.
 *
 * Returns a function to disable DevTools.
 *
 * ```ts
 * import { enableDevTools } from 'gjendje/devtools'
 *
 * // Enable everything (Redux DevTools + console logger)
 * const disable = enableDevTools()
 *
 * // Redux DevTools only (no console logging)
 * enableDevTools({ logger: false })
 *
 * // Console logger only (no Redux DevTools)
 * enableDevTools({ reduxDevTools: false })
 *
 * // Custom logger
 * enableDevTools({
 *   loggerOptions: {
 *     logger: (entry) => myService.log(entry),
 *     filter: (key) => key.startsWith('user'),
 *   },
 * })
 * ```
 *
 * @remarks
 * Options are only applied on the first call. If DevTools are already enabled,
 * subsequent calls return the disable function without updating options.
 * To change options, call `disableDevTools()` first, then re-enable with new options.
 */
export function enableDevTools(options?: DevToolsOptions): () => void {
	if (devToolsEnabled) {
		return disableDevTools
	}

	// Register hooks — these coexist with user callbacks set via configure()
	addConfigHook('onChange', devToolsOnChange)
	addConfigHook('onReset', devToolsOnReset)
	addConfigHook('onRegister', devToolsOnRegister)
	addConfigHook('onDestroy', devToolsOnDestroy)

	// Connect Redux DevTools
	if (options?.reduxDevTools !== false) {
		connectReduxDevTools(options?.name ? { name: options.name } : undefined)
	}

	// Enable logger
	if (options?.logger !== false) {
		enableLogger(options?.loggerOptions)
	}

	devToolsEnabled = true

	return disableDevTools
}

/**
 * Disable gjendje DevTools integration.
 *
 * Removes the internal config hooks and disconnects from Redux DevTools
 * and the logger. User-provided callbacks are never touched.
 */
export function disableDevTools(): void {
	if (!devToolsEnabled) return

	removeConfigHook('onChange', devToolsOnChange)
	removeConfigHook('onReset', devToolsOnReset)
	removeConfigHook('onRegister', devToolsOnRegister)
	removeConfigHook('onDestroy', devToolsOnDestroy)

	disconnectReduxDevTools()

	disableLogger()

	devToolsEnabled = false
}

/**
 * Whether DevTools integration is currently enabled.
 */
export function isDevToolsEnabled(): boolean {
	return devToolsEnabled
}

export type { LogEntry, LoggerOptions } from './logger.js'

export { disableLogger, enableLogger, isLoggerEnabled } from './logger.js'
// Re-export individual APIs for granular control
export {
	connectReduxDevTools,
	disconnectReduxDevTools,
	isReduxDevToolsConnected,
} from './redux-devtools.js'
