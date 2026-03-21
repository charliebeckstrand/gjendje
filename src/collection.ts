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

		for (const [watchKey, listeners] of watchers) {
			// Check if any item's value for this key actually changed
			const keyChanged = (prev: unknown, next: unknown): boolean => {
				if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') {
					return false
				}

				const p = prev as Record<PropertyKey, unknown>
				const n = next as Record<PropertyKey, unknown>

				return !Object.is(p[watchKey], n[watchKey])
			}

			const changed =
				next.length !== prevItems.length ||
				next.some((item, i) => i < prevItems.length && keyChanged(prevItems[i], item))

			if (changed) {
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
			let removed = false

			base.set((prev) =>
				prev.filter((item) => {
					if (!removed && predicate(item)) {
						removed = true

						return false
					}

					return true
				}),
			)
		} else {
			base.set((prev) => prev.filter((item) => !predicate(item)))
		}
	}

	col.update = (
		predicate: (item: T) => boolean,
		patch: Partial<T> | ((item: T) => T),
		options?: { one?: boolean },
	) => {
		const applyPatch = typeof patch === 'function' ? patch : (item: T): T => ({ ...item, ...patch })

		if (options?.one) {
			let updated = false

			base.set((prev) =>
				prev.map((item) => {
					if (!updated && predicate(item)) {
						updated = true

						return applyPatch(item)
					}

					return item
				}),
			)
		} else {
			base.set((prev) => prev.map((item) => (predicate(item) ? applyPatch(item) : item)))
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
