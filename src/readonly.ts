import type { ReadonlyInstance } from './types.js'

// ---------------------------------------------------------------------------
// readonly
// ---------------------------------------------------------------------------

/**
 * Create a read-only view of any state or computed instance.
 * The returned instance exposes `get`, `peek`, `subscribe`, and lifecycle
 * properties — but no `set`, `reset`, `intercept`, or `use`.
 *
 * Near-zero runtime cost — hot-path methods are bound directly to the source
 * instance, avoiding an extra wrapper function call on every access.
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

		get: instance.get.bind(instance),
		peek: instance.peek.bind(instance),
		subscribe: instance.subscribe.bind(instance),
		destroy: instance.destroy.bind(instance),
	}
}
