import { notify } from './batch.js'
import { safeCall } from './listeners.js'
import type { BaseInstance, DepValues, Listener, ReadonlyInstance, Unsubscribe } from './types.js'
import { RESOLVED } from './utils.js'

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
 */
export function computed<TDeps extends ReadonlyArray<BaseInstance<unknown>>, TResult>(
	deps: TDeps,
	fn: (values: DepValues<TDeps>) => TResult,
	options?: ComputedOptions,
): ComputedInstance<TResult> {
	const listenerSet = new Set<Listener<TResult>>()

	const instanceKey = options?.key ?? `computed:${computedCounter++}`

	let cached: TResult

	let isDirty = true

	let isDestroyed = false

	let _destroyedPromise: Promise<void> | undefined

	let _resolveDestroyed: (() => void) | undefined

	// Reuse a single array to avoid allocation on every recomputation
	const depValues = new Array(deps.length) as DepValues<TDeps>

	const depLen = deps.length

	function recompute(): TResult {
		if (!isDirty) return cached

		for (let i = 0; i < depLen; i++) {
			const dep = deps[i] as BaseInstance<unknown>

			;(depValues as unknown[])[i] = dep.get()
		}

		cached = fn(depValues)

		isDirty = false

		return cached
	}

	const notifyListeners = () => {
		const prev = cached

		const value = recompute()

		// In diamond dependency graphs (A → [B, C] → D), D gets notified
		// once per intermediate. Skip redundant notifications when the
		// recomputed value is identical to the previous cached value.
		if (value === prev) return

		for (const l of listenerSet) {
			safeCall(l, value)
		}
	}

	const markDirty = () => {
		isDirty = true

		notify(notifyListeners)
	}

	const unsubscribers = new Array(depLen)

	for (let i = 0; i < depLen; i++) {
		const dep = deps[i] as BaseInstance<unknown>

		unsubscribers[i] = dep.subscribe(markDirty)
	}

	// Compute initial value eagerly so first get() is synchronous
	recompute()

	// Short-circuit promise allocation when all deps are memory-scoped.
	// Memory deps always return RESOLVED for ready/hydrated/settled,
	// so we can skip Promise.all entirely in the common case.
	const allDepsImmediate = deps.every((d) => d.ready === RESOLVED)

	const readyPromise = allDepsImmediate
		? RESOLVED
		: Promise.all(deps.map((d) => d.ready)).then(() => undefined)

	const hydratedPromise = allDepsImmediate
		? RESOLVED
		: Promise.all(deps.map((d) => d.hydrated)).then(() => undefined)

	const settledPromise = allDepsImmediate
		? RESOLVED
		: Promise.all(deps.map((d) => d.settled)).then(() => undefined)

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

			if (!_destroyedPromise) {
				_destroyedPromise = new Promise<void>((r) => {
					_resolveDestroyed = r
				})
			}

			return _destroyedPromise
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
			listenerSet.add(listener)

			return () => {
				listenerSet.delete(listener)
			}
		},

		destroy() {
			if (isDestroyed) return

			isDestroyed = true

			for (const unsub of unsubscribers) {
				unsub()
			}

			listenerSet.clear()

			if (_resolveDestroyed) {
				_resolveDestroyed()
			} else {
				_destroyedPromise = RESOLVED
			}
		},
	}
}
