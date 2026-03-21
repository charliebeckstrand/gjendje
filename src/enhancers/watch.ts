import type { BaseInstance, Listener, Unsubscribe } from '../types.js'

export interface WithWatch<T> {
	/**
	 * Watch a specific key within an object value.
	 * The listener only fires when that key's value changes,
	 * using Object.is for comparison.
	 *
	 * Returns an unsubscribe function.
	 */
	watch<K extends T extends object ? keyof T : never>(
		key: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe
}

// biome-ignore lint/suspicious/noExplicitAny: constraint must use any for invariant BaseInstance
export function withWatch<TIn extends BaseInstance<any>>(
	instance: TIn,
): TIn & WithWatch<TIn extends BaseInstance<infer T> ? T : unknown> {
	type TOut = TIn & WithWatch<TIn extends BaseInstance<infer T> ? T : unknown>

	const watchers = new Map<PropertyKey, Set<Listener<unknown>>>()

	let prev = instance.get()

	const unsubscribe = instance.subscribe((next) => {
		if (watchers.size === 0) {
			prev = next

			return
		}

		for (const [watchKey, listeners] of watchers) {
			const prevVal =
				prev !== null && typeof prev === 'object'
					? (prev as Record<PropertyKey, unknown>)[watchKey]
					: undefined

			const nextVal =
				next !== null && typeof next === 'object'
					? (next as Record<PropertyKey, unknown>)[watchKey]
					: undefined

			if (!Object.is(prevVal, nextVal)) {
				for (const listener of listeners) {
					listener(nextVal)
				}
			}
		}

		prev = next
	})

	const originalDestroy = instance.destroy.bind(instance)

	// Object.create delegates to instance via prototype, preserving getters
	// (ready, settled, isDestroyed, etc.) without evaluating them eagerly.
	// A spread would snapshot getter values at creation time, breaking reactivity.
	const result = Object.create(instance) as TOut

	result.watch = (watchKey: PropertyKey, listener: Listener<unknown>) => {
		if (!watchers.has(watchKey)) {
			watchers.set(watchKey, new Set())
		}

		const listeners = watchers.get(watchKey)

		if (!listeners) return () => {}

		listeners.add(listener)

		return () => {
			listeners.delete(listener)

			if (listeners.size === 0) {
				watchers.delete(watchKey)
			}
		}
	}

	result.destroy = () => {
		watchers.clear()
		unsubscribe()
		originalDestroy()
	}

	return result
}
