import { createBase } from './core.js'
import { safeCall } from './listeners.js'
import type { BaseInstance, Listener, StateOptions, Unsubscribe } from './types.js'
import { isRecord } from './utils.js'
import { addWatcher } from './watchers.js'

type WatcherMap<T> = Map<PropertyKey, Set<Listener<T[]>>>

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

	// Per-key watchers — lazily allocated on first watch() to avoid
	// Map + subscription overhead for collections that never use watch().
	let watchers: WatcherMap<T> | undefined

	let prevItems: T[]

	let unsubscribe: Unsubscribe | undefined

	function ensureWatchers(): WatcherMap<T> {
		if (watchers) return watchers

		const w: WatcherMap<T> = new Map()

		watchers = w

		prevItems = base.get()

		unsubscribe = base.subscribe((next) => {
			if (w.size === 0) {
				prevItems = next

				return
			}

			// Single pass: iterate items once, checking all watched keys per item.
			// This is O(items + keys) instead of the previous O(items × keys).
			const lengthChanged = next.length !== prevItems.length

			if (lengthChanged) {
				// Length change implies all watched keys changed — notify all directly
				for (const [, listeners] of w) {
					for (const listener of listeners) {
						safeCall(listener, next)
					}
				}

				prevItems = next

				return
			}

			const len = next.length

			let changedKeys: Set<PropertyKey> | undefined

			for (let i = 0; i < len; i++) {
				const prev = prevItems[i]

				const curr = next[i]

				if (prev === curr) continue

				const p = isRecord(prev) ? prev : undefined

				const n = isRecord(curr) ? curr : undefined

				if (!p || !n) {
					// Non-object items changed — notify all watched keys directly
					for (const [, listeners] of w) {
						for (const listener of listeners) {
							safeCall(listener, next)
						}
					}

					prevItems = next

					return
				}

				for (const watchKey of w.keys()) {
					if (changedKeys?.has(watchKey)) continue

					if (!Object.is(p[watchKey], n[watchKey])) {
						if (!changedKeys) changedKeys = new Set()

						changedKeys.add(watchKey)
					}
				}

				// Early exit when all keys are flagged
				if (changedKeys && changedKeys.size === w.size) break
			}

			if (changedKeys) {
				for (const watchKey of changedKeys) {
					const listeners = w.get(watchKey)

					if (listeners) {
						for (const listener of listeners) {
							safeCall(listener, next)
						}
					}
				}
			}

			prevItems = next
		})

		return w
	}

	// Delegate to base via prototype to inherit all BaseInstance methods and
	// getters (ready, settled, isDestroyed, etc.) without manual forwarding.
	// Only collection-specific methods are defined as own properties.
	const col = Object.create(base) as CollectionInstance<T>

	col.watch = (watchKey: PropertyKey, listener: Listener<T[]>) => {
		return addWatcher(ensureWatchers(), watchKey, listener)
	}

	col.add = (...items: T[]) => {
		base.set(base.get().concat(items))
	}

	col.remove = (predicate: (item: T) => boolean, options?: { one?: boolean }) => {
		const prev = base.get()

		if (options?.one) {
			const idx = prev.findIndex(predicate)

			if (idx === -1) return

			const next = prev.slice()

			next.splice(idx, 1)

			base.set(next)
		} else {
			const next = prev.filter((item) => !predicate(item))

			if (next.length !== prev.length) {
				base.set(next)
			}
		}
	}

	col.update = (
		predicate: (item: T) => boolean,
		patch: Partial<T> | ((item: T) => T),
		options?: { one?: boolean },
	) => {
		const prev = base.get()

		const isFn = typeof patch === 'function'

		if (options?.one) {
			const idx = prev.findIndex(predicate)

			if (idx === -1) return

			const next = prev.slice()

			next[idx] = isFn
				? (patch as (item: T) => T)(prev[idx] as T)
				: ({ ...prev[idx], ...patch } as T)

			base.set(next)
		} else {
			let next: T[] | undefined

			for (let i = 0; i < prev.length; i++) {
				const item = prev[i] as T

				if (predicate(item)) {
					if (!next) next = prev.slice()

					next[i] = isFn ? (patch as (item: T) => T)(item) : ({ ...item, ...patch } as T)
				}
			}

			if (next) {
				base.set(next)
			}
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
		watchers?.clear()

		unsubscribe?.()

		base.destroy()
	}

	return col
}
