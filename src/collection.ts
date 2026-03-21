import { createBase } from './core.js'
import type { BaseInstance, Listener, StateOptions, Unsubscribe } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectionInstance<T> extends BaseInstance<T[]> {
	/** Read the current value without any reactive implications */
	peek(): T[]

	/**
	 * Watch a specific key across all items.
	 * Fires whenever any item's value for that key changes.
	 * Receives the full updated array.
	 */
	watch<K extends T extends object ? keyof T : never>(
		key: K,
		listener: (items: T[]) => void,
	): Unsubscribe

	/** Add one or more items to the end of the collection */
	add(...items: T[]): void

	/**
	 * Remove all items matching the predicate.
	 * Pass `{ one: true }` to remove only the first match.
	 */
	remove(predicate: (item: T) => boolean, options?: { one?: boolean }): void

	/**
	 * Update all items matching the predicate with a partial patch or updater.
	 * Pass `{ one: true }` to update only the first match.
	 */
	update(
		predicate: (item: T) => boolean,
		patch: Partial<T> | ((item: T) => T),
		options?: { one?: boolean },
	): void

	/** Find the first item matching the predicate */
	find(predicate: (item: T) => boolean): T | undefined

	/** Find all items matching the predicate */
	findAll(predicate: (item: T) => boolean): T[]

	/** True if any item matches the predicate */
	has(predicate: (item: T) => boolean): boolean

	/** Number of items in the collection */
	readonly size: number

	/** Remove all items */
	clear(): void
}

// ---------------------------------------------------------------------------
// collection
// ---------------------------------------------------------------------------

/**
 * Reactive array state with first-class mutation methods.
 * Supports all the same scopes, SSR, validation, and migration as state().
 *
 * ```ts
 * const todos = collection('todos', {
 *   default: [] as Todo[],
 *   scope: 'local',
 * })
 *
 * todos.add({ id: '1', text: 'Buy milk', done: false })
 * todos.update((t) => t.id === '1', { done: true })
 * todos.remove((t) => t.done)
 * todos.get()  // Todo[]
 * ```
 */
export function collection<T>(key: string, options: StateOptions<T[]>): CollectionInstance<T> {
	const base: BaseInstance<T[]> = createBase(key, options)

	// Per-key watchers — fires when that key's value changes on any item
	const watchers = new Map<PropertyKey, Set<Listener<T[]>>>()

	let prevItems = base.get()

	const unsubscribe = base.subscribe((next) => {
		if (watchers.size === 0) {
			prevItems = next

			return
		}

		// Single pass: iterate items once, checking all watched keys per item.
		// This is O(items + keys) instead of the previous O(items × keys).
		const changedKeys = new Set<PropertyKey>()

		const lengthChanged = next.length !== prevItems.length

		if (lengthChanged) {
			// Length change means all keys are potentially affected
			for (const watchKey of watchers.keys()) {
				changedKeys.add(watchKey)
			}
		} else {
			const len = next.length

			for (let i = 0; i < len; i++) {
				const prev = prevItems[i]
				const curr = next[i]

				if (prev === curr) continue

				const isObj =
					prev !== null && curr !== null && typeof prev === 'object' && typeof curr === 'object'

				if (!isObj) {
					// Non-object items changed — flag all watched keys
					for (const watchKey of watchers.keys()) {
						changedKeys.add(watchKey)
					}

					break
				}

				const p = prev as Record<PropertyKey, unknown>
				const n = curr as Record<PropertyKey, unknown>

				for (const watchKey of watchers.keys()) {
					if (!changedKeys.has(watchKey) && !Object.is(p[watchKey], n[watchKey])) {
						changedKeys.add(watchKey)
					}
				}

				// Early exit when all keys are flagged
				if (changedKeys.size === watchers.size) break
			}
		}

		for (const watchKey of changedKeys) {
			const listeners = watchers.get(watchKey)

			if (listeners) {
				for (const listener of listeners) {
					listener(next)
				}
			}
		}

		prevItems = next
	})

	const originalDestroy = base.destroy.bind(base)

	// Delegate to base via prototype to inherit all BaseInstance methods and
	// getters (ready, settled, isDestroyed, etc.) without manual forwarding.
	// Only collection-specific methods are defined as own properties.
	const col = Object.create(base) as CollectionInstance<T>

	col.watch = (watchKey: PropertyKey, listener: Listener<T[]>) => {
		let listeners = watchers.get(watchKey)

		if (!listeners) {
			listeners = new Set()

			watchers.set(watchKey, listeners)
		}

		listeners.add(listener)

		return () => {
			listeners.delete(listener)

			if (listeners.size === 0) {
				watchers.delete(watchKey)
			}
		}
	}

	col.add = (...items: T[]) => {
		base.set((prev) => [...prev, ...items])
	}

	col.remove = (predicate: (item: T) => boolean, options?: { one?: boolean }) => {
		if (options?.one) {
			base.set((prev) => {
				const idx = prev.findIndex(predicate)

				if (idx === -1) return prev

				const next = prev.slice()

				next.splice(idx, 1)

				return next
			})
		} else {
			base.set((prev) => {
				const next = prev.filter((item) => !predicate(item))

				return next.length === prev.length ? prev : next
			})
		}
	}

	col.update = (
		predicate: (item: T) => boolean,
		patch: Partial<T> | ((item: T) => T),
		options?: { one?: boolean },
	) => {
		const applyPatch = typeof patch === 'function' ? patch : (item: T): T => ({ ...item, ...patch })

		if (options?.one) {
			base.set((prev) => {
				const idx = prev.findIndex(predicate)

				if (idx === -1) return prev

				const next = prev.slice()

				next[idx] = applyPatch(prev[idx] as T)

				return next
			})
		} else {
			base.set((prev) => {
				let next: T[] | undefined

				for (let i = 0; i < prev.length; i++) {
					const item = prev[i] as T

					if (predicate(item)) {
						if (!next) next = prev.slice()

						next[i] = applyPatch(item)
					}
				}

				return next ?? prev
			})
		}
	}

	col.find = (predicate: (item: T) => boolean): T | undefined => {
		return base.get().find(predicate)
	}

	col.findAll = (predicate: (item: T) => boolean): T[] => {
		return base.get().filter(predicate)
	}

	col.has = (predicate: (item: T) => boolean): boolean => {
		return base.get().some(predicate)
	}

	col.clear = () => {
		base.set([])
	}

	Object.defineProperty(col, 'size', {
		get() {
			return base.get().length
		},
		enumerable: true,
	})

	col.destroy = () => {
		watchers.clear()

		unsubscribe()

		originalDestroy()
	}

	return col
}
