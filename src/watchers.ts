import { safeCall } from './listeners.js'
import type { Listener, Unsubscribe } from './types.js'
import { isRecord } from './utils.js'

/**
 * Register a listener for a specific key in a watcher map.
 * Returns an unsubscribe function that removes the listener
 * and cleans up the key entry when no listeners remain.
 */
export function addWatcher<T>(
	watchers: Map<PropertyKey, Set<Listener<T>>>,
	watchKey: PropertyKey,
	listener: Listener<T>,
): Unsubscribe {
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

/**
 * Notify watchers whose watched key changed between prev and next.
 * Compares values using Object.is for each watched key.
 */
export function notifyWatchers(
	watchers: Map<PropertyKey, Set<Listener<unknown>>>,
	prev: unknown,
	next: unknown,
): void {
	const prevObj = isRecord(prev) ? prev : undefined

	const nextObj = isRecord(next) ? next : undefined

	for (const [watchKey, listeners] of watchers) {
		const prevVal = prevObj?.[watchKey]

		const nextVal = nextObj?.[watchKey]

		if (!Object.is(prevVal, nextVal)) {
			for (const listener of listeners) {
				safeCall(listener, nextVal)
			}
		}
	}
}
