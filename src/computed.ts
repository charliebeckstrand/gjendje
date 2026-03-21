import { notify } from './batch.js'
import { createListeners } from './listeners.js'
import type { BaseInstance, ReadonlyInstance } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DepValues<T extends ReadonlyArray<BaseInstance<unknown>>> = {
	[K in keyof T]: T[K] extends BaseInstance<infer V> ? V : never
}

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
	const listeners = createListeners<TResult>()

	const instanceKey = options?.key ?? `computed:${computedCounter++}`

	let cached: TResult

	let isDirty = true
	let isDestroyed = false

	function getDepValues(): DepValues<TDeps> {
		return deps.map((dep) => dep.get()) as DepValues<TDeps>
	}

	function recompute(): TResult {
		if (!isDirty) return cached

		cached = fn(getDepValues())
		isDirty = false

		return cached
	}

	const notifyListeners = () => {
		const value = recompute()

		listeners.notify(value)
	}

	const unsubscribers = deps.map((dep) =>
		dep.subscribe(() => {
			isDirty = true

			notify(notifyListeners)
		}),
	)

	// Compute initial value eagerly so first get() is synchronous
	recompute()

	let resolveDestroyed: () => void

	const destroyedPromise = new Promise<void>((resolve) => {
		resolveDestroyed = resolve
	})

	return {
		key: instanceKey,
		scope: 'render' as const,

		get ready(): Promise<void> {
			return Promise.all(deps.map((d) => d.ready)).then(() => undefined)
		},

		get settled(): Promise<void> {
			return Promise.all(deps.map((d) => d.settled)).then(() => undefined)
		},

		get hydrated(): Promise<void> {
			return Promise.all(deps.map((d) => d.hydrated)).then(() => undefined)
		},

		get destroyed(): Promise<void> {
			return destroyedPromise
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

			for (const unsub of unsubscribers) {
				unsub()
			}

			listeners.clear()

			resolveDestroyed()
		},
	}
}
