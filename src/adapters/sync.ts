import { getConfig } from '../config.js'
import type { Adapter, Listener, Scope, Unsubscribe } from '../types.js'

/**
 * Wraps an existing adapter with BroadcastChannel support so that
 * set() calls are broadcast to — and received from — other tabs.
 */
export function withSync<T>(adapter: Adapter<T>, key: string, scope?: Scope): Adapter<T> {
	const channelName = `state:${key}`

	const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null

	const listeners = new Set<Listener<T>>()

	adapter.subscribe((value) => {
		for (const listener of listeners) {
			listener(value)
		}
	})

	if (channel) {
		channel.onmessage = (event: MessageEvent) => {
			if (event.data == null || typeof event.data !== 'object' || !('value' in event.data)) return

			const value = event.data.value as T

			// Write through the underlying adapter so versioning and custom
			// serializers are applied consistently. The adapter subscription
			// (above) already notifies our listeners.
			adapter.set(value)

			if (scope) {
				getConfig().onSync?.({ key, scope, value, source: 'remote' })
			}
		}
	}

	return {
		get ready() {
			return adapter.ready
		},

		get() {
			return adapter.get()
		},

		set(value) {
			adapter.set(value)

			channel?.postMessage({ value })
		},

		subscribe(listener: Listener<T>): Unsubscribe {
			listeners.add(listener)

			return () => {
				listeners.delete(listener)
			}
		},

		destroy() {
			listeners.clear()

			channel?.close()

			adapter.destroy?.()
		},
	}
}
