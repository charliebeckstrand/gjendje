import type { Listener, Unsubscribe } from './types.js'

/**
 * Create a lightweight listener set with subscribe, notify, and clear.
 * Used internally by adapters and computed to avoid duplicating
 * the same Set + iterate + add/delete boilerplate.
 *
 * Listener exceptions are caught so that one faulty subscriber
 * cannot silence the rest. Errors are reported via console.error
 * so they remain visible during development.
 */
export function createListeners<T>() {
	const set = new Set<Listener<T>>()

	return {
		notify(value: T): void {
			for (const listener of set) {
				try {
					listener(value)
				} catch (err) {
					// A single listener should never break others, but the
					// error must remain visible for debugging.
					console.error('[gjendje] Listener threw:', err)
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
