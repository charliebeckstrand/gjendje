import { getConfig, log } from './config.js'
import { createBase, createMemoryState } from './core.js'
import { getRegistered, registerByKey, scopedKey } from './registry.js'
import type { StateInstance, StateOptions } from './types.js'

/**
 * Core state constructor. Accepts a resolved key and full options object.
 *
 * All user-facing overloads (entry object, shorthand, three-arg, etc.)
 * live in `shortcuts.ts` and delegate here after normalizing arguments.
 */
export function createState<T>(key: string, options: StateOptions<T>): StateInstance<T> {
	if (!key) {
		throw new Error('[gjendje] key must be a non-empty string.')
	}

	const config = getConfig()

	if (config.keyPattern && !config.keyPattern.test(key)) {
		throw new Error(
			`[gjendje] Key "${key}" does not match the configured keyPattern ${config.keyPattern}.`,
		)
	}

	const rawScope = options.scope ?? config.scope ?? 'memory'
	const scope = rawScope === 'render' ? 'memory' : rawScope

	const rKey = scopedKey(key, scope)

	const existing = getRegistered<T>(rKey) as StateInstance<T> | undefined

	if (existing && !existing.isDestroyed) {
		if (config.warnOnDuplicate) {
			log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
		}

		return existing
	}

	// Memory scope fast path — single constructor, no adapter, no SSR checks
	if (scope === 'memory' && !options.ssr && !config.ssr) {
		if (options.sync) {
			log(
				'warn',
				`sync: true is ignored for scope "memory". Only "local" and "bucket" scopes support cross-tab sync.`,
			)
		}

		const instance = createMemoryState(key, rKey, options, config)

		registerByKey(rKey, key, scope, instance, config)

		return instance
	}

	// All other scopes go through the full pipeline
	return createBase(key, options)
}
