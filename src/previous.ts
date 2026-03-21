import { notify } from './batch.js'
import { createListeners } from './listeners.js'
import type { ReadonlyInstance } from './types.js'

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

	const unsubscribe = source.subscribe((next) => {
		const old = prev

		prev = current
		current = next

		if (old !== prev) {
			notify(() => listeners.notify(prev))
		}
	})

	// Lazy destroyed promise — only allocated if someone awaits it
	let destroyedPromise: Promise<void> | undefined

	let resolveDestroyed: (() => void) | undefined

	return {
		key: instanceKey,
		scope: 'render' as const,

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
			if (!destroyedPromise) {
				destroyedPromise = new Promise<void>((resolve) => {
					resolveDestroyed = resolve
				})
			}

			return destroyedPromise
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

			unsubscribe()

			listeners.clear()

			if (resolveDestroyed) {
				resolveDestroyed()
			} else {
				destroyedPromise = Promise.resolve()
			}
		},
	}
}
