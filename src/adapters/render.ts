import { notify } from '../batch.js'
import { createListeners } from '../listeners.js'
import type { Adapter } from '../types.js'

export function createRenderAdapter<T>(defaultValue: T): Adapter<T> {
	let current = defaultValue

	const listeners = createListeners<T>()

	const notifyListeners = () => listeners.notify(current)

	return {
		ready: Promise.resolve(),

		get() {
			return current
		},

		set(value) {
			current = value

			notify(notifyListeners)
		},

		subscribe: listeners.subscribe,

		destroy() {
			listeners.clear()
		},
	}
}
