import { getRegistry } from './registry.js'
import type { Scope } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateSnapshot {
	key: string
	scope: Scope
	value: unknown
	isDestroyed: boolean
}

// ---------------------------------------------------------------------------
// snapshot
// ---------------------------------------------------------------------------

/**
 * Return a read-only snapshot of all registered state instances.
 * Useful for debugging, logging, and DevTools integration.
 *
 * ```ts
 * import { snapshot } from 'gjendje'
 *
 * console.table(snapshot())
 * ```
 */
export function snapshot(): StateSnapshot[] {
	const registry = getRegistry()
	const result: StateSnapshot[] = []

	for (const instance of registry.values()) {
		result.push({
			key: instance.key,
			scope: instance.scope,
			value: instance.isDestroyed ? undefined : instance.get(),
			isDestroyed: instance.isDestroyed,
		})
	}

	return result
}
