import { notify } from './batch.js'
import { createListeners } from './listeners.js'
import type { ReadonlyInstance } from './types.js'
import { createLazyDestroyed } from './utils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A read-only reactive value derived from a single source.
 * Lighter than `computed` — skips multi-dep machinery (no array allocation,
 * no dependency loop). Ideal for projecting a single field or transformation.
 */
export interface SelectInstance<T> extends ReadonlyInstance<T> {}

export interface SelectOptions {
	/** Optional key for debugging and DevTools introspection. */
	key?: string
}

// ---------------------------------------------------------------------------
// Auto-incrementing key counter
// ---------------------------------------------------------------------------

let selectCounter = 0

// ---------------------------------------------------------------------------
// select
// ---------------------------------------------------------------------------

/**
 * Derive a reactive value from a single source instance.
 * A lightweight alternative to `computed` when you only need one dependency —
 * no array allocation, no dependency loop.
 *
 * ```ts
 * const user = state('user', { default: { name: 'Jane', age: 30 } })
 *
 * const userName = select(user, u => u.name)
 *
 * userName.get() // 'Jane'
 * userName.subscribe(name => console.log(name))
 * ```
 */
export function select<TSource, TResult>(
	source: ReadonlyInstance<TSource>,
	fn: (value: TSource) => TResult,
	options?: SelectOptions,
): SelectInstance<TResult> {
	const listeners = createListeners<TResult>()

	const instanceKey = options?.key ?? `select:${selectCounter++}`

	let cached: TResult

	let isDirty = true

	let isDestroyed = false

	function recompute(): TResult {
		if (!isDirty) return cached

		cached = fn(source.get())

		isDirty = false

		return cached
	}

	const notifyListeners = () => {
		const prev = cached
		const value = recompute()

		if (value === prev) return

		listeners.notify(value)
	}

	const markDirty = () => {
		isDirty = true

		notify(notifyListeners)
	}

	const unsubscribe = source.subscribe(markDirty)

	// Compute initial value eagerly so first get() is synchronous
	recompute()

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
			return recompute()
		},

		peek() {
			return cached
		},

		subscribe: listeners.subscribe,

		destroy() {
			if (isDestroyed) return

			isDestroyed = true

			unsubscribe()

			listeners.clear()

			lazyDestroyed.resolve()
		},
	}
}
