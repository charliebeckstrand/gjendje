import { notify } from './batch.js'
import { reportError } from './config.js'
import { ComputedError } from './errors.js'
import { safeCall } from './listeners.js'
import type { Listener, ReadonlyInstance, Unsubscribe } from './types.js'
import { createLazyDestroyed, RESOLVED } from './utils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A read-only reactive value derived from a single source.
 * Lighter than `computed` — no array allocation, no dependency loop.
 * Ideal for projecting a single field or transformation.
 */
export interface SelectInstance<T> extends ReadonlyInstance<T> {}

export interface SelectOptions {
	/** Optional key for debugging and DevTools introspection. */
	key?: string
}

// ---------------------------------------------------------------------------
// Auto-incrementing key counter
// ---------------------------------------------------------------------------

const NOOP: () => void = () => {}

let selectCounter = 0

// ---------------------------------------------------------------------------
// Derivation helper — extracted so recompute() stays try/catch-free and
// V8 can optimise its hot loop independently.
// ---------------------------------------------------------------------------

function callSelector<TSource, TResult>(
	fn: (value: TSource) => TResult,
	value: TSource,
	key: string,
): TResult {
	try {
		return fn(value)
	} catch (err) {
		const wrapped = new ComputedError(key, 'memory', err)

		reportError(key, 'memory', wrapped)

		throw wrapped
	}
}

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
 *
 * @throws {ComputedError} If the selector function throws during recomputation.
 */
export function select<TSource, TResult>(
	source: ReadonlyInstance<TSource>,
	fn: (value: TSource) => TResult,
	options?: SelectOptions,
): SelectInstance<TResult> {
	const instanceKey = options?.key ?? `select:${selectCounter++}`

	const listenerSet = new Set<Listener<TResult>>()

	// Fast path: when there is exactly one listener (common case),
	// call it directly instead of iterating the Set.
	let singleListener: Listener<TResult> | undefined

	let listenerCount = 0

	let cached: TResult

	let isDirty = true

	let isDestroyed = false

	const lazyDestroyed = createLazyDestroyed()

	function recompute(): TResult {
		if (!isDirty) return cached

		cached = callSelector(fn, source.get(), instanceKey)

		isDirty = false

		return cached
	}

	const notifyListeners = () => {
		if (isDestroyed) return

		const prev = cached

		const value = recompute()

		if (value === prev) return

		if (singleListener !== undefined) {
			safeCall(singleListener, value, instanceKey, 'memory')

			return
		}

		// Snapshot the listener set before iterating so that subscribe/unsubscribe
		// calls from within a listener don't affect this notification cycle.
		const snapshot = Array.from(listenerSet)

		for (let i = 0; i < snapshot.length; i++) {
			safeCall(snapshot[i] as Listener<TResult>, value, instanceKey, 'memory')
		}
	}

	const markDirty = () => {
		if (isDestroyed) return

		isDirty = true

		notify(notifyListeners)
	}

	const unsub = source.subscribe(markDirty)

	// Compute initial value eagerly so first get() is synchronous
	recompute()

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
			if (isDestroyed) return RESOLVED

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

		subscribe(listener: Listener<TResult>): Unsubscribe {
			if (isDestroyed) return NOOP

			listenerSet.add(listener)

			listenerCount++

			singleListener = listenerCount === 1 ? listener : undefined

			return () => {
				listenerSet.delete(listener)

				listenerCount--

				if (listenerCount === 1) {
					singleListener = listenerSet.values().next().value
				} else {
					singleListener = undefined
				}
			}
		},

		destroy() {
			if (isDestroyed) return

			isDestroyed = true

			try {
				unsub()

				listenerSet.clear()

				listenerCount = 0

				singleListener = undefined
			} finally {
				lazyDestroyed.resolve()
			}
		},
	}
}
