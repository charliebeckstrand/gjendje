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

export interface ChangeContext {
	key: string
	scope: Scope
	value: unknown
	previousValue: unknown
}

export interface ResetContext {
	key: string
	scope: Scope
	previousValue: unknown
}

export interface InterceptContext {
	key: string
	scope: Scope
	original: unknown
	intercepted: unknown
}

export interface ValidationFailContext {
	key: string
	scope: Scope
	value: unknown
}

export interface ExpireContext {
	key: string
	scope: Scope
	expiredAt: number
}

export interface GjendjeConfig {
	/** Default scope for all state instances. Defaults to `'memory'`. */
	scope?: Scope | undefined

	/** Enforce a naming pattern for state keys. */
	keyPattern?: RegExp | undefined

	/** Control log verbosity for internal warnings and errors. Defaults to `'warn'`. */
	logLevel?: LogLevel | undefined

	/** Cap the total number of registered state instances. */
	maxKeys?: number | undefined

	/** Prepends to all storage keys (e.g. `myapp:theme`) */
	prefix?: string | undefined

	/**
	 * Track state instances in the global registry. Defaults to `true`.
	 *
	 * When `true`, calling `state()` twice with the same key + scope returns the
	 * cached instance, and instances appear in `getRegistry()`.
	 *
	 * When `false`, registry lookup and insertion are skipped for memory-scoped
	 * state. Each `state()` call creates a new instance regardless of key.
	 *
	 * Persistent scopes (`local`, `session`, `bucket`) always use the registry.
	 * Setting `registry: false` alongside a persistent global `scope` emits a
	 * warning and the registry remains enabled for that scope.
	 */
	registry?: boolean | undefined

	/** Require a validate option for persisted scopes (local, session, bucket). */
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

	/** Fires when any state instance's value changes (via set or reset). */
	onChange?: ((context: ChangeContext) => void) | undefined

	/** Fires when any state instance is reset to its default value. */
	onReset?: ((context: ResetContext) => void) | undefined

	/** Fires when an interceptor modifies a value. */
	onIntercept?: ((context: InterceptContext) => void) | undefined

	/** Fires when a validate function rejects a value read from storage. */
	onValidationFail?: ((context: ValidationFailContext) => void) | undefined

	/** Fires when a storage bucket's data has expired. */
	onExpire?: ((context: ExpireContext) => void) | undefined
}

let globalConfig: GjendjeConfig = {}

export const PERSISTENT_SCOPES = new Set<Scope>(['local', 'session', 'bucket'])

export function configure(config: GjendjeConfig): void {
	// Iterate entries so that explicitly passing `undefined` clears a key,
	// which plain spread does not accomplish.
	for (const key of Object.keys(config)) {
		const value = (config as Record<string, unknown>)[key]

		if (value === undefined) {
			delete (globalConfig as Record<string, unknown>)[key]
		} else {
			;(globalConfig as Record<string, unknown>)[key] = value
		}
	}

	if (
		globalConfig.registry === false &&
		globalConfig.scope &&
		PERSISTENT_SCOPES.has(globalConfig.scope)
	) {
		log(
			'warn',
			`registry: false has no effect on scope "${globalConfig.scope}" — persistent scopes always use the registry.`,
		)
	}
}

/**
 * Reset all configuration to defaults. Useful in tests and HMR scenarios.
 */
export function resetConfig(): void {
	globalConfig = {}
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
	if (globalConfig.onError === undefined) return

	try {
		globalConfig.onError({ key, scope, error })
	} catch (err) {
		console.error('[gjendje] onError callback threw:', err)
	}
}
