import { notify } from '../batch.js'
import type { Adapter, Listener, Unsubscribe } from '../types.js'

export function createRenderAdapter<T>(defaultValue: T): Adapter<T> {
	let current = defaultValue

	const listeners = new Set<Listener<T>>()

	const notifyListeners = () => {
		for (const listener of listeners) {
			listener(current)
		}
	}

	return {
		ready: Promise.resolve() as Promise<void>,

		get() {
			return current
		},

		set(value) {
			current = value

			notify(notifyListeners)
		},

		subscribe(listener: Listener<T>): Unsubscribe {
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
