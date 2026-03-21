import type { Listener, Unsubscribe } from './types.js'

/**
 * Create a lightweight listener set with subscribe, notify, and clear.
 * Used internally by adapters and computed to avoid duplicating
 * the same Set + iterate + add/delete boilerplate.
 */
export function createListeners<T>() {
	const set = new Set<Listener<T>>()

	return {
		notify(value: T): void {
			for (const listener of set) {
				listener(value)
			}
		},

		subscribe(listener: Listener<T>): Unsubscribe {
			set.add(listener)

			return () => {
				set.delete(listener)
			}
		},

		clear(): void {
			set.clear()
		},
	}
}
