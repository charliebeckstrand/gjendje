import type { ReadonlyInstance } from './types.js'

// ---------------------------------------------------------------------------
// readonly
// ---------------------------------------------------------------------------

/**
 * Create a read-only view of any state or computed instance.
 * The returned instance exposes `get`, `peek`, `subscribe`, and lifecycle
 * properties — but no `set`, `reset`, or `intercept`.
 *
 * Zero runtime cost — delegates to the source via prototype chain.
 * Write methods are shadowed with `undefined` on the wrapper so they
 * cannot be called even from untyped JavaScript.
 *
 * ```ts
 * const theme = state('theme', { default: 'light' })
 *
 * export const themeValue = readonly(theme)
 *
 * themeValue.get()       // 'light'
 * themeValue.set('dark') // TS error — set does not exist
 * ```
 */
export function readonly<T>(instance: ReadonlyInstance<T>): ReadonlyInstance<T> {
	// Shadow write methods so they resolve to undefined on the wrapper itself,
	// preventing writes even from untyped JS callers.
	return Object.create(instance, {
		set: { value: undefined },
		reset: { value: undefined },
		intercept: { value: undefined },
	}) as ReadonlyInstance<T>
}
