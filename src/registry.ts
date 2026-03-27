import { type GjendjeConfig, log } from './config.js'
import { safeCallConfig } from './listeners.js'
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

	safeCallConfig(config.onRegister, { key, scope })
}

/**
 * Fast-path register when the caller already looked up the existing entry.
 * Skips the redundant Map.get() that registerByKey performs.
 */
export function registerNew<T>(
	rKey: string,
	key: string,
	scope: Scope,
	instance: BaseInstance<T>,
	config: Readonly<GjendjeConfig>,
	existing: BaseInstance<unknown> | undefined,
): void {
	if (existing !== undefined) {
		// Caller already verified !existing || existing.isDestroyed
		registry.set(rKey, instance)

		return
	}

	if (config.maxKeys !== undefined && registry.size >= config.maxKeys) {
		throw new Error(
			`[gjendje] maxKeys limit (${config.maxKeys}) reached. ` +
				`Cannot register state("${key}") with scope "${scope}".`,
		)
	}

	registry.set(rKey, instance)

	safeCallConfig(config.onRegister, { key, scope })
}

/**
 * Unregister using a pre-computed scoped key.
 */
export function unregisterByKey(rKey: string): void {
	registry.delete(rKey)
}

export function getRegistry(): Map<string, BaseInstance<unknown>> {
	return registry
}

/**
 * Destroy all registered instances and clear the registry.
 * Useful for test teardown, HMR cleanup, or SPA route transitions.
 */
export function destroyAll(): void {
	// Collect values first — destroy() calls unregisterByKey which mutates the map
	const instances = [...registry.values()]

	for (const instance of instances) {
		if (!instance.isDestroyed) {
			instance.destroy()
		}
	}

	registry.clear()
}
