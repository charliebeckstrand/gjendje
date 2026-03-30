import { WhenTimeoutError } from './errors.js'
import type { DepValues, ReadonlyInstance } from './types/index.js'
import { subscribeAll, unsubscribeAll } from './utilities/common.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhenOptions {
	/** Rejects with WhenTimeoutError if the predicate is not satisfied within this duration (ms). */
	timeout?: number
	/** Rejects with AbortError if the signal is aborted. */
	signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// when
// ---------------------------------------------------------------------------

/**
 * Return a promise that resolves when a predicate over reactive dependencies
 * becomes true.
 *
 * If the predicate is already satisfied with the current values, the returned
 * promise resolves immediately without subscribing.
 *
 * ```ts
 * await when([loading], ([isLoading]) => !isLoading)
 *
 * // With timeout
 * await when([count], ([c]) => c > 10, { timeout: 5000 })
 *
 * // With AbortSignal
 * const controller = new AbortController()
 * await when([status], ([s]) => s === 'done', { signal: controller.signal })
 * ```
 */
export function when<TDeps extends ReadonlyArray<ReadonlyInstance<unknown>>>(
	deps: TDeps,
	predicate: (values: DepValues<TDeps>) => boolean,
	options?: WhenOptions,
): Promise<void> {
	const depLen = deps.length
	const depValues = new Array(depLen) as DepValues<TDeps>

	function readDeps(): void {
		for (let i = 0; i < depLen; i++) {
			const dep = deps[i] as ReadonlyInstance<unknown>

			;(depValues as unknown[])[i] = dep.get()
		}
	}

	// Check synchronously first — avoid subscribing if already satisfied.
	// Wrapped in try/catch so that a throwing predicate returns a rejected
	// promise rather than a synchronous exception (preserving the Promise<void>
	// contract for callers using .catch() instead of await).
	try {
		readDeps()

		if (predicate(depValues)) {
			return Promise.resolve()
		}
	} catch (err) {
		return Promise.reject(err)
	}

	return new Promise<void>((resolve, reject) => {
		let settled = false

		let timerId: ReturnType<typeof setTimeout> | undefined

		let unsubscribers: Array<() => void> | undefined

		function cleanup(): void {
			if (unsubscribers) {
				unsubscribeAll(unsubscribers)
				unsubscribers = undefined
			}

			if (timerId !== undefined) {
				clearTimeout(timerId)
				timerId = undefined
			}

			if (options?.signal) {
				options.signal.removeEventListener('abort', onAbort)
			}
		}

		function settle(action: () => void): void {
			if (settled) return

			settled = true

			cleanup()
			action()
		}

		function onChange(): void {
			try {
				readDeps()

				if (predicate(depValues)) {
					settle(() => resolve())
				}
			} catch (err) {
				settle(() => reject(err))
			}
		}

		function onAbort(): void {
			settle(() => reject(options?.signal?.reason ?? new DOMException('Aborted', 'AbortError')))
		}

		// If the signal is already aborted, reject immediately
		if (options?.signal?.aborted) {
			settle(() => reject(options?.signal?.reason ?? new DOMException('Aborted', 'AbortError')))
			return
		}

		// Subscribe to deps
		unsubscribers = subscribeAll(deps, onChange)

		// Set up timeout
		if (options?.timeout !== undefined) {
			const timeout = options.timeout

			timerId = setTimeout(() => {
				settle(() => reject(new WhenTimeoutError(timeout)))
			}, timeout)
		}

		// Set up abort listener
		if (options?.signal) {
			options.signal.addEventListener('abort', onAbort, { once: true })
		}
	})
}
