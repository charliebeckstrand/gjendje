import { AsyncLocalStorage } from 'node:async_hooks'
import { notify } from '../batch.js'
import { registerServerAdapter } from '../core.js'
import { createListeners } from '../listeners.js'
import type { Adapter } from '../types.js'

const als = new AsyncLocalStorage<Map<string, unknown>>()

export async function withServerSession<T>(fn: () => T): Promise<T> {
	const store = new Map<string, unknown>()

	return als.run(store, fn)
}

export function createServerAdapter<T>(key: string, defaultValue: T): Adapter<T> {
	const listeners = createListeners<T>(key, 'server')

	function getStore(): Map<string, unknown> | undefined {
		return als.getStore()
	}

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => listeners.notify(lastNotifiedValue)

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
					'[gjendje] Cannot set server-scoped state outside of a server session. ' +
						'Wrap your request handler with withServerSession().',
				)
			}

			store.set(key, value)

			lastNotifiedValue = value

			notify(notifyListeners)
		},

		subscribe: listeners.subscribe,

		destroy() {
			listeners.clear()
		},
	}
}

// Self-register so core.ts doesn't need a static import of this module,
// which would pull node:async_hooks into client bundles.
registerServerAdapter(createServerAdapter)
