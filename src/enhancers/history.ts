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
 * const counter = state('counter', { default: 0, scope: 'memory' })
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

	// Delegate to instance via prototype to inherit all BaseInstance methods
	// and getters without manual forwarding. Only history-specific methods
	// are defined as own properties.
	const result = Object.create(instance) as WithHistoryInstance<T>

	result.undo = (): void => {
		if (past.length === 0) return

		const current = instance.get()

		// Length is checked above — pop() always returns T here
		const prev = past.pop() as T

		future.push(current)

		isNavigating = true

		try {
			instance.set(prev)
		} finally {
			isNavigating = false
		}
	}

	result.redo = (): void => {
		if (future.length === 0) return

		const current = instance.get()

		// Length is checked above — pop() always returns T here
		const next = future.pop() as T

		past.push(current)

		isNavigating = true

		try {
			instance.set(next)
		} finally {
			isNavigating = false
		}
	}

	Object.defineProperty(result, 'canUndo', {
		get(): boolean {
			return past.length > 0
		},
		enumerable: true,
	})

	Object.defineProperty(result, 'canRedo', {
		get(): boolean {
			return future.length > 0
		},
		enumerable: true,
	})

	result.clearHistory = (): void => {
		past.length = 0
		future.length = 0
	}

	result.destroy = (): void => {
		unintercept()

		past.length = 0
		future.length = 0

		instance.destroy()
	}

	return result
}
