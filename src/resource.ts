import { batch } from './batch.js'
import { createBase } from './core.js'
import { ResourceError } from './errors.js'
import { readonly } from './readonly.js'
import type { DepValues, ReadonlyInstance } from './types/index.js'
import { subscribeAll, unsubscribeAll } from './utilities/common.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceInstance<T> {
	readonly data: ReadonlyInstance<T | undefined>
	readonly loading: ReadonlyInstance<boolean>
	readonly error: ReadonlyInstance<ResourceError | undefined>
	refetch(): void
	destroy(): void
	readonly isDestroyed: boolean
}

export interface ResourceOptions<T> {
	key?: string
	initialData?: T
}

// ---------------------------------------------------------------------------
// Auto-incrementing key counter
// ---------------------------------------------------------------------------

let resourceCounter = 0

// ---------------------------------------------------------------------------
// resource — overloaded signatures
// ---------------------------------------------------------------------------

/** Create an async resource without reactive dependencies. */
export function resource<T>(fn: () => Promise<T>, options?: ResourceOptions<T>): ResourceInstance<T>

/** Create an async resource that refetches when reactive dependencies change. */
export function resource<TDeps extends ReadonlyArray<ReadonlyInstance<unknown>>, T>(
	deps: TDeps,
	fn: (values: DepValues<TDeps>) => Promise<T>,
	options?: ResourceOptions<T>,
): ResourceInstance<T>

// ---------------------------------------------------------------------------
// resource — implementation
// ---------------------------------------------------------------------------

export function resource<TDeps extends ReadonlyArray<ReadonlyInstance<unknown>>, T>(
	fnOrDeps: (() => Promise<T>) | TDeps,
	fnOrOptions?: ((values: DepValues<TDeps>) => Promise<T>) | ResourceOptions<T>,
	maybeOptions?: ResourceOptions<T>,
): ResourceInstance<T> {
	// Detect which overload was used
	const hasDeps = Array.isArray(fnOrDeps)

	const deps = hasDeps ? (fnOrDeps as TDeps) : undefined
	const fn = hasDeps
		? (fnOrOptions as (values: DepValues<TDeps>) => Promise<T>)
		: (fnOrDeps as () => Promise<T>)
	const options = hasDeps ? maybeOptions : (fnOrOptions as ResourceOptions<T> | undefined)

	const resourceKey = options?.key ?? `resource:${resourceCounter++}`

	// --- Internal state instances (memory-scoped) ---

	const dataState = createBase(`${resourceKey}:data`, {
		default: options?.initialData as T | undefined,
	})
	const loadingState = createBase(`${resourceKey}:loading`, { default: true })
	const errorState = createBase(`${resourceKey}:error`, {
		default: undefined as ResourceError | undefined,
	})

	const dataReadonly = readonly(dataState)
	const loadingReadonly = readonly(loadingState)
	const errorReadonly = readonly(errorState)

	let fetchId = 0

	let destroyed = false

	let depUnsubscribers: Array<() => void> = []

	if (deps) {
		depUnsubscribers = subscribeAll(deps, () => {
			refetch()
		})
	}

	// --- Core fetch logic ---

	function refetch(): void {
		if (destroyed) return

		const currentFetchId = ++fetchId

		batch(() => {
			loadingState.set(true)
			errorState.set(undefined)
		})

		// Read dep values fresh on each refetch
		let promise: Promise<T>

		try {
			if (deps) {
				const depLen = deps.length
				const depValues = new Array(depLen) as DepValues<TDeps>

				for (let i = 0; i < depLen; i++) {
					const dep = deps[i] as ReadonlyInstance<unknown>

					;(depValues as unknown[])[i] = dep.get()
				}

				promise = fn(depValues)
			} else {
				promise = (fn as () => Promise<T>)()
			}
		} catch (err) {
			batch(() => {
				errorState.set(new ResourceError(resourceKey, err))
				loadingState.set(false)
			})

			return
		}

		promise.then(
			(result) => {
				if (destroyed || fetchId !== currentFetchId) return

				batch(() => {
					dataState.set(result)
					loadingState.set(false)
				})
			},
			(err: unknown) => {
				if (destroyed || fetchId !== currentFetchId) return

				batch(() => {
					errorState.set(new ResourceError(resourceKey, err))
					loadingState.set(false)
				})
			},
		)
	}

	// --- Trigger initial fetch ---

	refetch()

	// --- Public instance ---

	return {
		data: dataReadonly,
		loading: loadingReadonly,
		error: errorReadonly,

		refetch,

		destroy() {
			if (destroyed) return

			destroyed = true

			try {
				unsubscribeAll(depUnsubscribers)
			} finally {
				dataState.destroy()
				loadingState.destroy()
				errorState.destroy()
			}
		},

		get isDestroyed() {
			return destroyed
		},
	}
}
