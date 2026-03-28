import { notify } from './batch.js'
import { reportError } from './config.js'
import { ComputedError } from './errors.js'
import { safeCall } from './listeners.js'
import type { DepValues, Listener, ReadonlyInstance, Unsubscribe } from './types.js'
import { createLazyDestroyed, RESOLVED } from './utils.js'

// ---------------------------------------------------------------------------
// Derivation helper — extracted so recompute() stays try/catch-free and
// V8 can optimise its hot loop independently.
// ---------------------------------------------------------------------------

function callDerivation<TDeps extends ReadonlyArray<ReadonlyInstance<unknown>>, TResult>(
	fn: (values: DepValues<TDeps>) => TResult,
	depValues: DepValues<TDeps>,
	key: string,
): TResult {
	try {
		return fn(depValues)
	} catch (err) {
		const wrapped = new ComputedError(key, 'memory', err)
		reportError(key, 'memory', wrapped)
		throw wrapped
	}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A read-only reactive value derived from one or more dependencies.
 * Extends ReadonlyInstance — has get, peek, subscribe, ready, and identity,
 * but no set or reset since the value is always determined by its sources.
 */
export interface ComputedInstance<T> extends ReadonlyInstance<T> {}

export interface ComputedOptions {
	/** Optional key for debugging and DevTools introspection. */
	key?: string
}

// ---------------------------------------------------------------------------
// Auto-incrementing key counter
// ---------------------------------------------------------------------------

const NOOP: () => void = () => {}

let computedCounter = 0

// ---------------------------------------------------------------------------
// computed
// ---------------------------------------------------------------------------

/**
 * Derive a reactive value from one or more state dependencies.
 * Recomputes only when a dependency changes. Cached between changes.
 * Participates in batch() — notifications are deferred like any other state.
 *
 * ```ts
 * const firstName = state('firstName', { default: 'Jane' })
 * const lastName = state('lastName', { default: 'Doe' })
 *
 * const fullName = computed([firstName, lastName], ([first, last]) => {
 *   return `${first} ${last}`.trim()
 * })
 *
 * fullName.get()       // 'Jane Doe'
 * fullName.subscribe(name => console.log(name))
 * ```
 *
 * @throws {ComputedError} If the derivation function throws during recomputation.
 */
export function computed<TDeps extends ReadonlyArray<ReadonlyInstance<unknown>>, TResult>(
	deps: TDeps,
	fn: (values: DepValues<TDeps>) => TResult,
	options?: ComputedOptions,
): ComputedInstance<TResult> {
	const listenerSet = new Set<Listener<TResult>>()

	// Fast path: when there is exactly one listener (common in chains),
	// call it directly instead of iterating the Set (avoids iterator allocation).
	let singleListener: Listener<TResult> | undefined

	let listenerCount = 0

	const instanceKey = options?.key ?? `computed:${computedCounter++}`

	let cached: TResult

	let isDirty = true

	let isDestroyed = false

	const lazyDestroyed = createLazyDestroyed()

	// Reuse a single array to avoid allocation on every recomputation
	const depValues = new Array(deps.length) as DepValues<TDeps>

	const depLen = deps.length

	function recompute(): TResult {
		if (!isDirty) return cached

		for (let i = 0; i < depLen; i++) {
			const dep = deps[i] as ReadonlyInstance<unknown>

			;(depValues as unknown[])[i] = dep.get()
		}

		cached = callDerivation(fn, depValues, instanceKey)

		isDirty = false

		return cached
	}

	const notifyListeners = () => {
		if (isDestroyed) return

		const prev = cached

		const value = recompute()

		// In diamond dependency graphs (A → [B, C] → D), D gets notified
		// once per intermediate. Skip redundant notifications when the
		// recomputed value is identical to the previous cached value.
		if (value === prev) return

		if (singleListener !== undefined) {
			safeCall(singleListener, value, instanceKey, 'memory')

			return
		}

		for (const l of listenerSet) {
			safeCall(l, value, instanceKey, 'memory')
		}
	}

	const markDirty = () => {
		if (isDestroyed) return

		isDirty = true

		notify(notifyListeners)
	}

	const unsubscribers = new Array(depLen)

	for (let i = 0; i < depLen; i++) {
		const dep = deps[i] as ReadonlyInstance<unknown>

		unsubscribers[i] = dep.subscribe(markDirty)
	}

	// Compute initial value eagerly so first get() is synchronous
	recompute()

	// Short-circuit promise allocation when all deps are memory-scoped.
	// Memory deps always return RESOLVED for ready/hydrated/settled,
	// so we can skip Promise.all entirely in the common case.
	let readyPromise: Promise<void> = RESOLVED

	let hydratedPromise: Promise<void> = RESOLVED

	let settledPromise: Promise<void> = RESOLVED

	let hasAsyncDep = false

	for (let i = 0; i < depLen; i++) {
		if ((deps[i] as ReadonlyInstance<unknown>).ready !== RESOLVED) {
			hasAsyncDep = true

			break
		}
	}

	if (hasAsyncDep) {
		const readyArr = new Array(depLen)

		const hydratedArr = new Array(depLen)

		const settledArr = new Array(depLen)

		for (let i = 0; i < depLen; i++) {
			const dep = deps[i] as ReadonlyInstance<unknown>

			readyArr[i] = dep.ready
			hydratedArr[i] = dep.hydrated
			settledArr[i] = dep.settled
		}

		readyPromise = Promise.all(readyArr).then(NOOP)

		hydratedPromise = Promise.all(hydratedArr).then(NOOP)

		settledPromise = Promise.all(settledArr).then(NOOP)
	}

	return {
		key: instanceKey,
		scope: 'memory',

		get ready(): Promise<void> {
			return readyPromise
		},

		get settled(): Promise<void> {
			return settledPromise
		},

		get hydrated(): Promise<void> {
			return hydratedPromise
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
				for (const unsub of unsubscribers) {
					unsub()
				}

				unsubscribers.length = 0

				listenerSet.clear()

				listenerCount = 0

				singleListener = undefined
			} finally {
				lazyDestroyed.resolve()
			}
		},
	}
}
