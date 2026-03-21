import { getConfig, log, reportError } from '../config.js'
import { createListeners } from '../listeners.js'
import type { Adapter, Scope, Unsubscribe } from '../types.js'

/**
 * Wraps an existing adapter with BroadcastChannel support so that
 * set() calls are broadcast to — and received from — other tabs.
 */
export function withSync<T>(adapter: Adapter<T>, key: string, scope?: Scope): Adapter<T> {
	const channelName = `state:${key}`

	const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null

	const listeners = createListeners<T>()

	adapter.subscribe((value) => {
		listeners.notify(value)
	})

	if (channel) {
		channel.onmessage = (event: MessageEvent) => {
			if (event.data == null || typeof event.data !== 'object' || !('value' in event.data)) return

			const value = event.data.value as T

			try {
				// Write through the underlying adapter so versioning and custom
				// serializers are applied consistently. The adapter subscription
				// (above) already notifies our listeners.
				adapter.set(value)

				if (scope) {
					getConfig().onSync?.({ key, scope, value, source: 'remote' })
				}
			} catch (err) {
				log(
					'error',
					`Sync failed for key "${key}": ${err instanceof Error ? err.message : String(err)}`,
				)

				if (scope) {
					reportError(key, scope, err)
				}
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

		subscribe(listener): Unsubscribe {
			return listeners.subscribe(listener)
		},

		destroy() {
			listeners.clear()

			channel?.close()

			adapter.destroy?.()
		},
	}
}
