import { computed } from './computed.js'
import type { ReadonlyInstance } from './types.js'

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
	return computed([source], (values) => fn(values[0] as TSource), {
		key: options?.key ?? `select:${selectCounter++}`,
	})
}
