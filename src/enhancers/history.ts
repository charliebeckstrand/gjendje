import type { BaseInstance, Unsubscribe } from '../types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WithHistoryInstance<T> extends BaseInstance<T> {
	/** Revert to the previous value. No-op if there is no history. */
	undo(): void
	/** Re-apply the last undone value. No-op if there is nothing to redo. */
	redo(): void
	/** Whether undo() will have an effect. */
	readonly canUndo: boolean
	/** Whether redo() will have an effect. */
	readonly canRedo: boolean
	/** Clear all history (past and future). */
	clearHistory(): void
}

export interface HistoryOptions {
	/** Maximum number of entries to keep. Defaults to 50. */
	maxSize?: number
}

// ---------------------------------------------------------------------------
// withHistory
// ---------------------------------------------------------------------------

/**
 * Enhance a state instance with undo/redo capabilities.
 *
 * ```ts
 * const counter = state('counter', { default: 0, scope: 'render' })
 * const h = withHistory(counter)
 *
 * h.set(1)
 * h.set(2)
 * h.undo()   // counter is now 1
 * h.redo()   // counter is now 2
 * ```
 */
export function withHistory<T>(
	instance: BaseInstance<T>,
	options?: HistoryOptions,
): WithHistoryInstance<T> {
	const maxSize = options?.maxSize ?? 50

	const past: T[] = []
	const future: T[] = []

	let isNavigating = false

	const unintercept: Unsubscribe = instance.intercept((next, prev) => {
		if (!isNavigating) {
			past.push(prev)

			if (past.length > maxSize) {
				past.shift()
			}

			// Any new set() clears the redo stack
			future.length = 0
		}

		return next
	})

	return {
		get(): T {
			return instance.get()
		},

		peek(): T {
			return instance.peek()
		},

		set(valueOrUpdater: T | ((prev: T) => T)): void {
			instance.set(valueOrUpdater)
		},

		subscribe(listener) {
			return instance.subscribe(listener)
		},

		reset(): void {
			instance.reset()
		},

		intercept(fn) {
			return instance.intercept(fn)
		},

		use(fn) {
			return instance.use(fn)
		},

		get scope() {
			return instance.scope
		},

		get key() {
			return instance.key
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

		undo(): void {
			if (past.length === 0) return

			const current = instance.get()
			const prev = past.pop() as T

			future.push(current)

			isNavigating = true
			instance.set(prev)
			isNavigating = false
		},

		redo(): void {
			if (future.length === 0) return

			const current = instance.get()
			const next = future.pop() as T

			past.push(current)

			isNavigating = true
			instance.set(next)
			isNavigating = false
		},

		get canUndo(): boolean {
			return past.length > 0
		},

		get canRedo(): boolean {
			return future.length > 0
		},

		clearHistory(): void {
			past.length = 0
			future.length = 0
		},

		destroy(): void {
			unintercept()

			past.length = 0
			future.length = 0

			instance.destroy()
		},
	}
}
