import type { BaseInstance } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DepValues<T extends ReadonlyArray<BaseInstance<unknown>>> = {
	[K in keyof T]: T[K] extends BaseInstance<infer V> ? V : never
}

type Cleanup = () => void

export interface EffectHandle {
	/** Stop the effect and run the last cleanup function if any */
	stop(): void
}

// ---------------------------------------------------------------------------
// effect
// ---------------------------------------------------------------------------

/**
 * Run a side effect when state dependencies change.
 * Runs immediately with current values, then re-runs on any change.
 *
 * The callback can return a cleanup function that runs before the next
 * execution and when the effect is stopped.
 *
 * ```ts
 * const stop = effect([theme, fontSize], ([t, f]) => {
 *   document.body.setAttribute('data-theme', t)
 *   document.documentElement.style.fontSize = `${f}px`
 *
 *   return () => {
 *     document.body.removeAttribute('data-theme')
 *   }
 * })
 *
 * // Later — stop listening and clean up
 * stop()
 * ```
 */
export function effect<TDeps extends ReadonlyArray<BaseInstance<unknown>>>(
	deps: TDeps,
	fn: (values: DepValues<TDeps>) => Cleanup | undefined,
): EffectHandle {
	let cleanup: Cleanup | undefined

	let isStopped = false

	// Reuse a single array to avoid allocation on every run
	const depLen = deps.length

	const depValues = new Array(depLen) as DepValues<TDeps>

	function run(): void {
		if (isStopped) return

		// Run previous cleanup before re-executing.
		// Errors in cleanup must not prevent the next effect from running.
		if (cleanup) {
			try {
				cleanup()
			} catch (err) {
				console.error('[gjendje] Effect cleanup threw:', err)
			}

			cleanup = undefined
		}

		for (let i = 0; i < depLen; i++) {
			const dep = deps[i] as BaseInstance<unknown>

			;(depValues as unknown[])[i] = dep.get()
		}

		cleanup = fn(depValues)
	}

	// Subscribe to all dependencies — single shared callback avoids per-dep closures
	const unsubscribers = new Array(depLen)

	for (let i = 0; i < depLen; i++) {
		const dep = deps[i] as BaseInstance<unknown>

		unsubscribers[i] = dep.subscribe(run)
	}

	// Run immediately with current values
	run()

	return {
		stop() {
			if (isStopped) return

			isStopped = true

			for (let i = 0; i < depLen; i++) {
				unsubscribers[i]()
			}

			if (cleanup) {
				try {
					cleanup()
				} catch (err) {
					console.error('[gjendje] Effect cleanup threw:', err)
				}

				cleanup = undefined
			}
		},
	}
}
