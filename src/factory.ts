import { getConfig, log } from './config.js'
import { createBase, createRenderState } from './core.js'
import { getRegistered, registerByKey, scopedKey } from './registry.js'
import type { StateInstance, StateOptions } from './types.js'

type Widen<T> = T extends string
	? string
	: T extends number
		? number
		: T extends boolean
			? boolean
			: T

/**
 * Create a stateful value.
 *
 * Same key + same scope always returns the same instance.
 * Change scope to move state anywhere.
 *
 * ```ts
 * const theme = state('theme', { default: 'light', scope: 'local' })
 * const filters = state('filters', { default: {}, scope: 'url' })
 * const user = state('user', { default: null, scope: 'server' })
 *
 * // Shorthand — pass a default value directly
 * const counter = state('counter', 0)
 * const name = state('name', 'guest')
 * ```
 */
export function state<T>(key: string, options: StateOptions<T>): StateInstance<T>
export function state<T extends string | number | boolean | null | undefined>(
	key: string,
	defaultValue: T,
): StateInstance<Widen<T>>
export function state<T>(key: string, optionsOrDefault: T | StateOptions<T>): StateInstance<T> {
	const options: StateOptions<T> =
		optionsOrDefault !== null &&
		typeof optionsOrDefault === 'object' &&
		'default' in optionsOrDefault
			? optionsOrDefault
			: ({ default: optionsOrDefault } as StateOptions<T>)

	if (!key) {
		throw new Error('[state] key must be a non-empty string.')
	}

	const config = getConfig()

	if (config.keyPattern && !config.keyPattern.test(key)) {
		throw new Error(
			`[gjendje] Key "${key}" does not match the configured keyPattern ${config.keyPattern}.`,
		)
	}

	const scope = options.scope ?? config.scope ?? 'render'

	const rKey = scopedKey(key, scope)

	const existing = getRegistered<T>(rKey) as StateInstance<T> | undefined

	if (existing && !existing.isDestroyed) {
		if (config.warnOnDuplicate) {
			log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
		}

		return existing
	}

	// Render scope fast path — single constructor, no adapter, no SSR checks
	if (scope === 'render' && !options.ssr && !config.ssr) {
		if (options.sync) {
			log(
				'warn',
				`sync: true is ignored for scope "render". Only "local" and "bucket" scopes support cross-tab sync.`,
			)
		}

		const instance = createRenderState(key, rKey, options, config)

		registerByKey(rKey, key, scope, instance, config)

		return instance
	}

	// All other scopes go through the full pipeline
	return createBase(key, options)
}
