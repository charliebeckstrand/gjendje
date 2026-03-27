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

import { configure, getConfig } from '../config.js'
import type { Scope } from '../types.js'
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
// Stored original callbacks (for chaining)
// ---------------------------------------------------------------------------

let originalOnChange:
	| ((ctx: { key: string; scope: Scope; value: unknown; previousValue: unknown }) => void)
	| undefined

let originalOnReset:
	| ((ctx: { key: string; scope: Scope; previousValue: unknown }) => void)
	| undefined

let originalOnRegister: ((ctx: { key: string; scope: Scope }) => void) | undefined

let originalOnDestroy: ((ctx: { key: string; scope: Scope }) => void) | undefined

let devToolsEnabled = false

// ---------------------------------------------------------------------------
// Config callback wrappers
// ---------------------------------------------------------------------------

function callOriginal<A>(fn: ((arg: A) => void) | undefined, arg: A): void {
	if (fn === undefined) return

	try {
		fn(arg)
	} catch (err) {
		console.error('[gjendje] DevTools: original config callback threw:', err)
	}
}

function onChangeHandler(ctx: {
	key: string
	scope: Scope
	value: unknown
	previousValue: unknown
}): void {
	callOriginal(originalOnChange, ctx)

	dispatchChange(ctx.key, ctx.scope, ctx.value, ctx.previousValue)

	logChange(ctx.key, ctx.scope, ctx.value, ctx.previousValue)
}

function onResetHandler(ctx: { key: string; scope: Scope; previousValue: unknown }): void {
	callOriginal(originalOnReset, ctx)

	dispatchReset(ctx.key, ctx.scope, ctx.previousValue)

	logReset(ctx.key, ctx.scope, ctx.previousValue)
}

function onRegisterHandler(ctx: { key: string; scope: Scope }): void {
	callOriginal(originalOnRegister, ctx)

	dispatchRegister(ctx.key, ctx.scope)

	logRegister(ctx.key, ctx.scope)
}

function onDestroyHandler(ctx: { key: string; scope: Scope }): void {
	callOriginal(originalOnDestroy, ctx)

	dispatchDestroy(ctx.key, ctx.scope)

	logDestroy(ctx.key, ctx.scope)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enable gjendje DevTools integration.
 *
 * Hooks into the global `configure()` callbacks to dispatch state changes
 * to the Redux DevTools Extension and/or the enhanced console logger.
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
 */
export function enableDevTools(options?: DevToolsOptions): () => void {
	if (devToolsEnabled) {
		return disableDevTools
	}

	const config = getConfig()

	// Store original callbacks for chaining
	originalOnChange = config.onChange

	originalOnReset = config.onReset

	originalOnRegister = config.onRegister

	originalOnDestroy = config.onDestroy

	// Wire devtools into global config
	configure({
		onChange: onChangeHandler,
		onReset: onResetHandler,
		onRegister: onRegisterHandler,
		onDestroy: onDestroyHandler,
	})

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
 * Restores original `configure()` callbacks and disconnects from
 * Redux DevTools and the logger.
 */
export function disableDevTools(): void {
	if (!devToolsEnabled) return

	// Restore original callbacks
	configure({
		onChange: originalOnChange,
		onReset: originalOnReset,
		onRegister: originalOnRegister,
		onDestroy: originalOnDestroy,
	})

	originalOnChange = undefined

	originalOnReset = undefined

	originalOnRegister = undefined

	originalOnDestroy = undefined

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
