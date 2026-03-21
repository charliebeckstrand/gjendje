import { getConfig, log } from './config.js'
import { createBase } from './core.js'
import { withWatch } from './enhancers/watch.js'
import { scopedKey } from './registry.js'
import type { StateInstance, StateOptions } from './types.js'

interface CachedInstance {
	readonly isDestroyed: boolean
}

// Caches the withWatch-enhanced StateInstance returned to consumers.
// The registry in core.ts caches the underlying BaseInstance (shared by
// both state() and collection()), while this cache stores the final
// enhanced wrapper so withWatch isn't re-applied on duplicate calls.
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
	const config = getConfig()

	const scope = options.scope ?? config.defaultScope ?? 'render'

	const ck = scopedKey(key, scope)

	const cached = instanceCache.get(ck) as StateInstance<T> | undefined

	if (cached && !cached.isDestroyed) {
		if (config.warnOnDuplicate) {
			log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
		}

		return cached
	}

	const base = createBase(key, options)

	const instance = withWatch(base) as StateInstance<T>

	instanceCache.set(ck, instance)

	return instance
}
