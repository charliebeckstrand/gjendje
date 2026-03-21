import { notify } from '../batch.js'
import type { Adapter, Listener } from '../types.js'

const RESOLVED = Promise.resolve()

export function createRenderAdapter<T>(defaultValue: T): Adapter<T> {
	let current = defaultValue

	const listeners = new Set<Listener<T>>()

	const notifyListeners = () => {
		for (const listener of listeners) {
			try {
				listener(current)
			} catch (err) {
				console.error('[gjendje] Listener threw:', err)
			}
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
