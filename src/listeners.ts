import { reportError } from './config.js'
import type { Listener, Scope, Unsubscribe } from './types.js'

/**
 * Invoke a listener inside a try/catch so that one faulty subscriber
 * cannot silence the rest. Extracted from the notification loop so V8
 * can optimize the loop body independently (simple for-of without
 * exception handling metadata).
 *
 * When `key` and `scope` are provided, the error is also reported
 * through the global `onError` pipeline for centralised error handling.
 */
export function safeCall<T>(listener: Listener<T>, value: T, key?: string, scope?: Scope): void {
	try {
		listener(value)
	} catch (err) {
		console.error('[gjendje] Listener threw:', err)

		if (key !== undefined && scope !== undefined) {
			reportError(key, scope, err)
		}
	}
}

/**
 * Like safeCall but for two-argument change handlers.
 * Extracted so V8 can optimize the caller independently
 * (keeping try/catch out of hot methods like MemoryStateImpl.set).
 *
 * When `key` and `scope` are provided, the error is also reported
 * through the global `onError` pipeline for centralised error handling.
 */
export function safeCallChange<T>(
	handler: (next: T, prev: T) => void,
	next: T,
	prev: T,
	key?: string,
	scope?: Scope,
): void {
	try {
		handler(next, prev)
	} catch (err) {
		console.error('[gjendje] Change handler threw:', err)

		if (key !== undefined && scope !== undefined) {
			reportError(key, scope, err)
		}
	}
}

/**
 * Invoke a global config callback (e.g. `onIntercept`, `onChange`) inside a
 * try/catch so that a faulty user-provided callback cannot crash the state
 * operation that triggered it. Extracted to a separate function so V8 can
 * optimise callers independently (no exception-handling metadata in hot paths).
 */
export function safeCallConfig<A>(fn: ((arg: A) => void) | undefined, arg: A): void {
	if (fn === undefined) return

	try {
		fn(arg)
	} catch (err) {
		console.error('[gjendje] Config callback threw:', err)
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
export function createListeners<T>(key?: string, scope?: Scope) {
	const set = new Set<Listener<T>>()

	return {
		notify(value: T): void {
			for (const listener of set) {
				safeCall(listener, value, key, scope)
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
