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
 *
 * Snapshots the watcher entries before iterating so that watch/unwatch
 * calls from within a listener don't affect this notification cycle.
 */
export function notifyWatchers(
	watchers: Map<PropertyKey, Set<Listener<unknown>>>,
	prev: unknown,
	next: unknown,
): void {
	const prevObj = isRecord(prev) ? prev : undefined

	const nextObj = isRecord(next) ? next : undefined

	// Snapshot entries so that watch()/unwatch() calls from within a listener
	// don't mutate the Map or Sets during iteration.
	const entries = Array.from(watchers)

	for (let i = 0; i < entries.length; i++) {
		const [watchKey, listenerSet] = entries[i] as [PropertyKey, Set<Listener<unknown>>]

		const prevVal = prevObj?.[watchKey]

		const nextVal = nextObj?.[watchKey]

		if (!Object.is(prevVal, nextVal)) {
			const listeners = Array.from(listenerSet)

			for (let j = 0; j < listeners.length; j++) {
				safeCall(listeners[j] as Listener<unknown>, nextVal)
			}
		}
	}
}
