import type { Listener, Unsubscribe } from './types.js'

/**
 * Invoke a listener inside a try/catch so that one faulty subscriber
 * cannot silence the rest. Extracted from the notification loop so V8
 * can optimize the loop body independently (simple for-of without
 * exception handling metadata).
 */
export function safeCall<T>(listener: Listener<T>, value: T): void {
	try {
		listener(value)
	} catch (err) {
		console.error('[gjendje] Listener threw:', err)
	}
}

/**
 * Like safeCall but for two-argument change handlers.
 * Extracted so V8 can optimize the caller independently
 * (keeping try/catch out of hot methods like MemoryStateImpl.set).
 */
export function safeCallChange<T>(handler: (next: T, prev: T) => void, next: T, prev: T): void {
	try {
		handler(next, prev)
	} catch (err) {
		console.error('[gjendje] Change handler threw:', err)
	}
}

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
				safeCall(listener, value)
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
