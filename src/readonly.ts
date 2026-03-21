import type { ReadonlyInstance } from './types.js'

// ---------------------------------------------------------------------------
// readonly
// ---------------------------------------------------------------------------

/**
 * Create a read-only view of any state or computed instance.
 * The returned instance exposes `get`, `peek`, `subscribe`, and lifecycle
 * properties — but no `set`, `reset`, `intercept`, or `use`.
 *
 * Zero runtime cost — delegates to the source via prototype chain.
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
	return {
		get key() {
			return instance.key
		},

		get scope() {
			return instance.scope
		},

		get isDestroyed() {
			return instance.isDestroyed
		},

		get ready() {
			return instance.ready
		},

		get settled() {
			return instance.settled
		},

		get hydrated() {
			return instance.hydrated
		},

		get destroyed() {
			return instance.destroyed
		},

		get() {
			return instance.get()
		},

		peek() {
			return instance.peek()
		},

		subscribe(listener) {
			return instance.subscribe(listener)
		},

		destroy() {
			instance.destroy()
		},
	}
}
