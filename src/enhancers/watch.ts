import type { BaseInstance, Listener, Unsubscribe } from '../types.js'
import { addWatcher, notifyWatchers } from '../watchers.js'

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

/**
 * Enhance a state instance with per-key change tracking.
 *
 * The `watch()` method only fires when a specific property of an object
 * value changes, using Object.is for comparison.
 *
 * ```ts
 * const user = state('user', { default: { name: 'Jane', age: 30 } })
 * const w = withWatch(user)
 *
 * w.watch('name', (name) => console.log(name))
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: BaseInstance is invariant — any is required for generic constraint
export function withWatch<TIn extends BaseInstance<any>>(
	instance: TIn,
): TIn & WithWatch<TIn extends BaseInstance<infer T> ? T : unknown> {
	type TOut = TIn & WithWatch<TIn extends BaseInstance<infer T> ? T : unknown>

	let watchers: Map<PropertyKey, Set<Listener<unknown>>> | undefined

	let unsubscribe: Unsubscribe | undefined

	let prev: unknown

	let initialized = false

	// Lazily subscribe to the base instance only when the first watcher is added
	function ensureSubscription() {
		if (unsubscribe || initialized) return

		initialized = true

		prev = instance.get()

		unsubscribe = instance.subscribe((next) => {
			try {
				if (watchers && watchers.size > 0) {
					notifyWatchers(watchers, prev, next)
				}
			} finally {
				prev = next
			}
		})
	}

	// Object.create delegates to instance via prototype, preserving getters
	// (ready, settled, isDestroyed, etc.) without evaluating them eagerly.
	// A spread would snapshot getter values at creation time, breaking reactivity.
	const result = Object.create(instance) as TOut

	result.watch = (watchKey: PropertyKey, listener: Listener<unknown>) => {
		if (!watchers) watchers = new Map()

		ensureSubscription()

		return addWatcher(watchers, watchKey, listener)
	}

	result.destroy = () => {
		watchers?.clear()

		watchers = undefined

		unsubscribe?.()

		unsubscribe = undefined

		initialized = false

		prev = undefined

		instance.destroy()
	}

	return result
}
