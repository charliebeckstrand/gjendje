import { type GjendjeConfig, getConfig, log } from './config.js'
import type { BaseInstance, Scope } from './types.js'

export function scopedKey(key: string, scope: Scope): string {
	return `${scope}:${key}`
}

// biome-ignore lint/suspicious/noExplicitAny: BaseInstance is invariant — any is required for heterogeneous storage
const registry = new Map<string, BaseInstance<any>>()

export function getRegistered<T>(rKey: string): BaseInstance<T> | undefined {
	return registry.get(rKey)
}

/**
 * Register using a pre-computed scoped key to avoid redundant string concat.
 * Accepts config to avoid a redundant getConfig() call.
 */
export function registerByKey<T>(
	rKey: string,
	key: string,
	scope: Scope,
	instance: BaseInstance<T>,
	config: Readonly<GjendjeConfig>,
): void {
	const existing = registry.get(rKey)

	if (existing !== undefined) {
		if (existing.isDestroyed) {
			registry.set(rKey, instance)
		} else if (config.warnOnDuplicate) {
			log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
		}

		return
	}

	if (config.maxKeys !== undefined && registry.size >= config.maxKeys) {
		throw new Error(
			`[gjendje] maxKeys limit (${config.maxKeys}) reached. ` +
				`Cannot register state("${key}") with scope "${scope}".`,
		)
	}

	registry.set(rKey, instance)

	config.onRegister?.({ key, scope })
}

/**
 * Unregister using a pre-computed scoped key.
 */
export function unregisterByKey(rKey: string): void {
	registry.delete(rKey)
}

// ---------------------------------------------------------------------------
// Legacy API — used by collection, devtools, etc.
// ---------------------------------------------------------------------------

export function register<T>(key: string, scope: Scope, instance: BaseInstance<T>): void {
	registerByKey(scopedKey(key, scope), key, scope, instance, getConfig())
}

export function unregister(key: string, scope: Scope): void {
	registry.delete(scopedKey(key, scope))
}

export function getRegistry(): Map<string, BaseInstance<unknown>> {
	return registry
}
