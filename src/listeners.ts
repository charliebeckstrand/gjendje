import type { Listener, Unsubscribe } from './types.js'

/**
 * Create a lightweight listener set with subscribe, notify, and clear.
 * Used internally by adapters and computed to avoid duplicating
 * the same Set + iterate + add/delete boilerplate.
 *
 * Listener exceptions are caught so that one faulty subscriber
 * cannot silence the rest.
 */
export function createListeners<T>() {
	const set = new Set<Listener<T>>()

	return {
		notify(value: T): void {
			for (const listener of set) {
				try {
					listener(value)
				} catch {
					// Swallow — a single listener should never break others.
					// The consumer's own error handling applies.
				}
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
