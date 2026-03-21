import { getConfig, log } from './config.js'
import { createBase } from './core.js'
import { scopedKey } from './registry.js'
import type { StateInstance, StateOptions } from './types.js'

interface CachedInstance {
	readonly isDestroyed: boolean
}

// Caches the StateInstance returned to consumers.
// The registry in core.ts caches the same instance (shared by
// both state() and collection()), while this cache ensures
// duplicate state() calls return the same reference.
const instanceCache = new Map<string, CachedInstance>()

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
 * ```
 */
export function state<T>(key: string, options: StateOptions<T>): StateInstance<T> {
	const scope = options.scope ?? getConfig().scope ?? 'render'

	const ck = scopedKey(key, scope)

	const cached = instanceCache.get(ck) as StateInstance<T> | undefined

	if (cached && !cached.isDestroyed) {
		if (getConfig().warnOnDuplicate) {
			log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
		}

		return cached
	}

	const instance = createBase(key, options)

	instanceCache.set(ck, instance)

	return instance
}
