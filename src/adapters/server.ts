import { AsyncLocalStorage } from 'node:async_hooks'
import { notify } from '../batch.js'
import type { Adapter, Listener, Unsubscribe } from '../types.js'

const als = new AsyncLocalStorage<Map<string, unknown>>()

export async function withServerSession<T>(fn: () => T): Promise<T> {
	const store = new Map<string, unknown>()

	return als.run(store, fn)
}

export function createServerAdapter<T>(key: string, defaultValue: T): Adapter<T> {
	const listeners = new Set<Listener<T>>()

	function getStore(): Map<string, unknown> | undefined {
		return als.getStore()
	}

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => {
		for (const listener of listeners) {
			listener(lastNotifiedValue)
		}
	}

	return {
		ready: Promise.resolve(),

		get() {
			const store = getStore()

			if (!store) return defaultValue

			return store.has(key) ? (store.get(key) as T) : defaultValue
		},

		set(value) {
			const store = getStore()

			if (!store) {
				throw new Error(
					'[state] Cannot set server-scoped state outside of a server session. ' +
						'Wrap your request handler with withServerSession().',
				)
			}

			store.set(key, value)

			lastNotifiedValue = value

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
