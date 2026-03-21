import type { Scope } from './types.js'

export type LogLevel = 'silent' | 'warn' | 'error' | 'debug'

export interface ErrorContext {
	key: string
	scope: Scope
	error: unknown
}

export interface DestroyContext {
	key: string
	scope: Scope
}

export interface MigrateContext {
	key: string
	scope: Scope
	fromVersion: number
	toVersion: number
	data: unknown
}

export interface QuotaExceededContext {
	key: string
	scope: Scope
	error: unknown
}

export interface HydrateContext {
	key: string
	scope: Scope
	serverValue: unknown
	clientValue: unknown
}

export interface SyncContext {
	key: string
	scope: Scope
	value: unknown
	source: 'remote'
}

export interface RegisterContext {
	key: string
	scope: Scope
}

export interface GjendjeConfig {
	/** Default scope for all state instances. Defaults to `'render'`. */
	scope?: Scope | undefined

	/** Enforce a naming pattern for state keys. */
	keyPattern?: RegExp | undefined

	/** Control log verbosity for internal warnings and errors. Defaults to `'warn'`. */
	logLevel?: LogLevel | undefined

	/** Cap the total number of registered state instances. */
	maxKeys?: number | undefined

	/** Prepends to all storage keys (e.g. `myapp:theme`) */
	prefix?: string | undefined

	/** Require a validate option for persisted scopes (local, tab, bucket). */
	requireValidation?: boolean | undefined

	/** Enable SSR mode globally for all instances. */
	ssr?: boolean | undefined

	/** Enable cross-tab sync globally for all syncable scopes. */
	sync?: boolean | undefined

	/** Warn when two state() calls use the same key + scope. */
	warnOnDuplicate?: boolean | undefined

	/** Fires when any instance is destroyed. */
	onDestroy?: ((context: DestroyContext) => void) | undefined

	/** Global error handler for storage/migration/validation failures. */
	onError?: ((context: ErrorContext) => void) | undefined

	/** Fires after SSR hydration completes for an instance. */
	onHydrate?: ((context: HydrateContext) => void) | undefined

	/** Fires after a migration chain runs during read. */
	onMigrate?: ((context: MigrateContext) => void) | undefined

	/** Fires when a storage write fails due to quota. */
	onQuotaExceeded?: ((context: QuotaExceededContext) => void) | undefined

	/** Fires when a new state instance is registered. */
	onRegister?: ((context: RegisterContext) => void) | undefined

	/** Fires when a cross-tab sync event updates a value. */
	onSync?: ((context: SyncContext) => void) | undefined
}

let globalConfig: GjendjeConfig = {}

export function configure(config: GjendjeConfig): void {
	globalConfig = { ...globalConfig, ...config }
}

export function getConfig(): Readonly<GjendjeConfig> {
	return globalConfig
}

const LOG_PRIORITY = { debug: 0, warn: 1, error: 2 } as const

/**
 * Internal logger that respects the configured log level.
 */
export function log(level: 'warn' | 'error' | 'debug', message: string): void {
	const configLevel = globalConfig.logLevel ?? 'warn'

	if (configLevel === 'silent') return

	if (LOG_PRIORITY[level] >= LOG_PRIORITY[configLevel]) {
		console[level](`[gjendje] ${message}`)
	}
}

/**
 * Internal error reporter that calls the global onError handler if configured.
 */
export function reportError(key: string, scope: Scope, error: unknown): void {
	globalConfig.onError?.({ key, scope, error })
}
