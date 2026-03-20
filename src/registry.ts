import { getConfig, log } from './config.js'
import type { BaseInstance, Scope } from './types.js'

export function scopedKey(key: string, scope: Scope): string {
	return `${scope}:${key}`
}

// biome-ignore lint/suspicious/noExplicitAny: registry stores heterogeneous instances
const registry = new Map<string, BaseInstance<any>>()

export function getRegistered<T>(key: string, scope: Scope): BaseInstance<T> | undefined {
	return registry.get(scopedKey(key, scope))
}

export function register<T>(key: string, scope: Scope, instance: BaseInstance<T>): void {
	const rKey = scopedKey(key, scope)

	if (registry.has(rKey)) {
		const existing = registry.get(rKey)

		if (existing?.isDestroyed) {
			registry.set(rKey, instance)
		} else {
			const config = getConfig()

			if (config.warnOnDuplicate) {
				log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
			}
		}

		return
	}

	const config = getConfig()

	if (config.maxKeys !== undefined && registry.size >= config.maxKeys) {
		throw new Error(
			`[gjendje] maxKeys limit (${config.maxKeys}) reached. ` +
				`Cannot register state("${key}") with scope "${scope}".`,
		)
	}

	registry.set(rKey, instance)

	config.onRegister?.({ key, scope })
}

export function unregister(key: string, scope: Scope): void {
	registry.delete(scopedKey(key, scope))
}

export function getRegistry(): Map<string, BaseInstance<unknown>> {
	return registry
}
