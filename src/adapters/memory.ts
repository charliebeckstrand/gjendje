import { notify } from '../batch.js'
import { safeCall } from '../listeners.js'
import type { Adapter, Listener } from '../types.js'
import { RESOLVED } from '../utils.js'

export function createMemoryAdapter<T>(defaultValue: T): Adapter<T> {
	let current = defaultValue

	const listeners = new Set<Listener<T>>()

	const notifyListeners = () => {
		// Snapshot to protect against subscribe/unsubscribe during iteration,
		// consistent with createListeners and MemoryStateImpl.
		const snapshot = Array.from(listeners)

		for (let i = 0; i < snapshot.length; i++) {
			safeCall(snapshot[i] as Listener<T>, current)
		}
	}

	return {
		ready: RESOLVED,

		get() {
			return current
		},

		set(value) {
			current = value

			notify(notifyListeners)
		},

		subscribe(listener) {
			listeners.add(listener)

			return () => {
				listeners.delete(listener)
			}
		},

		destroy() {
			listeners.clear()
		},
	}
}
