import type { Scope } from '../types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoggerOptions {
	/**
	 * Custom log function. Defaults to styled `console.log` with grouping.
	 * Provide your own to send logs to an external service, file, etc.
	 */
	logger?: (entry: LogEntry) => void

	/**
	 * Filter which keys to log. When provided, only matching keys are logged.
	 */
	filter?: (key: string, scope: Scope) => boolean

	/**
	 * Whether to use console grouping for log output. Defaults to `true`.
	 */
	collapsed?: boolean
}

export interface LogEntry {
	type: 'set' | 'reset' | 'register' | 'destroy'
	key: string
	scope: Scope
	value?: unknown
	previousValue?: unknown
	timestamp: number
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let loggerOptions: LoggerOptions | undefined

let loggerActive = false

// ---------------------------------------------------------------------------
// Default logger
// ---------------------------------------------------------------------------

const SCOPE_COLORS: Record<string, string> = {
	memory: '#9e9e9e',
	session: '#ff9800',
	local: '#4caf50',
	url: '#2196f3',
	server: '#9c27b0',
	bucket: '#795548',
}

function defaultLogger(entry: LogEntry): void {
	const color = SCOPE_COLORS[entry.scope] ?? '#9e9e9e'

	const label = `[gjendje] ${entry.type} "${entry.key}" (${entry.scope})`

	const collapsed = loggerOptions?.collapsed !== false

	if (entry.type === 'register' || entry.type === 'destroy') {
		console.log(`%c${label}`, `color: ${color}; font-weight: bold`)

		return
	}

	const groupMethod = collapsed ? console.groupCollapsed : console.group

	groupMethod(`%c${label}`, `color: ${color}; font-weight: bold`)

	if ('previousValue' in entry) {
		console.log('%cprev', 'color: #9e9e9e; font-weight: bold', entry.previousValue)
	}

	console.log('%cnext', 'color: #4caf50; font-weight: bold', entry.value)

	console.groupEnd()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enable the devtools logger.
 *
 * Logs state changes to the console with color-coded scope labels and
 * grouped old/new values. Provide a custom `logger` function to redirect
 * output elsewhere (e.g. an external logging service).
 *
 * ```ts
 * import { enableLogger } from 'gjendje/devtools'
 *
 * enableLogger()
 *
 * // With options:
 * enableLogger({
 *   collapsed: false,
 *   filter: (key) => key.startsWith('user'),
 *   logger: (entry) => myService.log(entry),
 * })
 * ```
 *
 * Returns a function to disable the logger.
 */
export function enableLogger(options?: LoggerOptions): () => void {
	loggerOptions = options

	loggerActive = true

	return disableLogger
}

/**
 * Disable the devtools logger.
 */
export function disableLogger(): void {
	loggerOptions = undefined

	loggerActive = false
}

/**
 * Whether the logger is currently active.
 */
export function isLoggerEnabled(): boolean {
	return loggerActive
}

// ---------------------------------------------------------------------------
// Integration hooks — called from the devtools orchestrator
// ---------------------------------------------------------------------------

function matchesFilter(key: string, scope: Scope): boolean {
	if (!loggerOptions?.filter) return true

	try {
		return loggerOptions.filter(key, scope)
	} catch (err) {
		console.error('[gjendje] Logger filter threw:', err)

		return false
	}
}

function safeLog(entry: LogEntry): void {
	const logger = loggerOptions?.logger ?? defaultLogger

	try {
		logger(entry)
	} catch (err) {
		console.error('[gjendje] Logger callback threw:', err)
	}
}

/** @internal */
export function logChange(key: string, scope: Scope, value: unknown, previousValue: unknown): void {
	if (!loggerActive) return

	if (!matchesFilter(key, scope)) return

	safeLog({ type: 'set', key, scope, value, previousValue, timestamp: Date.now() })
}

/** @internal */
export function logReset(key: string, scope: Scope, previousValue: unknown): void {
	if (!loggerActive) return

	if (!matchesFilter(key, scope)) return

	safeLog({ type: 'reset', key, scope, previousValue, timestamp: Date.now() })
}

/** @internal */
export function logRegister(key: string, scope: Scope): void {
	if (!loggerActive) return

	if (!matchesFilter(key, scope)) return

	safeLog({ type: 'register', key, scope, timestamp: Date.now() })
}

/** @internal */
export function logDestroy(key: string, scope: Scope): void {
	if (!loggerActive) return

	if (!matchesFilter(key, scope)) return

	safeLog({ type: 'destroy', key, scope, timestamp: Date.now() })
}
