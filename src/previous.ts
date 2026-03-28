import { notify } from './batch.js'
import { createListeners } from './listeners.js'
import type { ReadonlyInstance } from './types.js'
import { createLazyDestroyed } from './utils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A read-only reactive value that tracks the previous value of a source.
 * Lighter than `withHistory` — stores only the single prior value,
 * no undo/redo stacks.
 */
export interface PreviousInstance<T> extends ReadonlyInstance<T | undefined> {}

export interface PreviousOptions {
	/** Optional key for debugging and DevTools introspection. */
	key?: string
}

// ---------------------------------------------------------------------------
// Auto-incrementing key counter
// ---------------------------------------------------------------------------

let previousCounter = 0

// ---------------------------------------------------------------------------
// previous
// ---------------------------------------------------------------------------

/**
 * Track the previous value of a source instance.
 * Returns `undefined` until the source changes for the first time.
 *
 * ```ts
 * const counter = state('counter', { default: 0 })
 *
 * const prev = previous(counter)
 *
 * prev.get()     // undefined (no prior value yet)
 *
 * counter.set(1)
 * prev.get()     // 0
 *
 * counter.set(2)
 * prev.get()     // 1
 * ```
 */
export function previous<T>(
	source: ReadonlyInstance<T>,
	options?: PreviousOptions,
): PreviousInstance<T> {
	const listeners = createListeners<T | undefined>()

	const instanceKey = options?.key ?? `previous:${previousCounter++}`

	let prev: T | undefined

	let current: T = source.get()

	let isDestroyed = false

	const notifyListeners = () => {
		listeners.notify(prev)
	}

	let unsubscribe: (() => void) | undefined

	try {
		unsubscribe = source.subscribe((next) => {
			const old = prev

			prev = current
			current = next

			if (old !== prev) {
				notify(notifyListeners)
			}
		})
	} catch {
		listeners.clear()

		throw new Error(`[gjendje] previous(): source.subscribe() threw for "${instanceKey}".`)
	}

	const lazyDestroyed = createLazyDestroyed()

	return {
		key: instanceKey,
		scope: 'memory',

		get ready(): Promise<void> {
			return source.ready
		},

		get settled(): Promise<void> {
			return source.settled
		},

		get hydrated(): Promise<void> {
			return source.hydrated
		},

		get destroyed(): Promise<void> {
			return lazyDestroyed.promise
		},

		get isDestroyed() {
			return isDestroyed
		},

		get() {
			return prev
		},

		peek() {
			return prev
		},

		subscribe: listeners.subscribe,

		destroy() {
			if (isDestroyed) return

			isDestroyed = true

			unsubscribe?.()

			listeners.clear()

			lazyDestroyed.resolve()
		},
	}
}
