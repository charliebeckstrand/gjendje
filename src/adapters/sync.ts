import { getConfig, log, reportError } from '../config.js'
import { SyncError } from '../errors.js'
import { createListeners, safeCallConfig } from '../listeners.js'
import type { Adapter, Scope, Unsubscribe } from '../types.js'

/**
 * Wraps an existing adapter with BroadcastChannel support so that
 * set() calls are broadcast to — and received from — other tabs.
 */
export function withSync<T>(adapter: Adapter<T>, key: string, scope?: Scope): Adapter<T> {
	const channelName = `state:${key}`

	let channel: BroadcastChannel | null = null

	if (typeof BroadcastChannel !== 'undefined') {
		try {
			channel = new BroadcastChannel(channelName)
		} catch (err) {
			const syncErr = new SyncError(key, scope ?? 'local', err)

			log('warn', `Failed to create BroadcastChannel for key "${key}" — cross-tab sync disabled.`)

			if (scope) {
				reportError(key, scope, syncErr)
			}
		}
	}

	const listeners = createListeners<T>(key, scope)

	let isDestroyed = false

	const unsubscribeAdapter = adapter.subscribe((value) => {
		listeners.notify(value)
	})

	if (channel) {
		channel.onmessage = (event: MessageEvent) => {
			// Guard against messages queued before channel.close() completed
			if (isDestroyed) return

			// Validate message shape. BroadcastChannel is same-origin only,
			// but a compromised tab could still send malformed data.
			const msg = event.data

			if (
				msg == null ||
				typeof msg !== 'object' ||
				!('value' in msg) ||
				Object.keys(msg as object).length !== 1
			)
				return

			const value = (msg as Record<'value', T>).value

			try {
				// Write through the underlying adapter so versioning and custom
				// serializers are applied consistently. The adapter subscription
				// (above) already notifies our listeners.
				adapter.set(value)

				if (scope) {
					safeCallConfig(getConfig().onSync, { key, scope, value, source: 'remote' })
				}
			} catch (err) {
				const syncErr = new SyncError(key, scope ?? 'local', err)

				log('error', syncErr.message)

				if (scope) {
					reportError(key, scope, syncErr)
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

			if (channel) {
				try {
					channel.postMessage({ value })
				} catch (err) {
					const syncErr = new SyncError(key, scope ?? 'local', err)

					log('error', syncErr.message)

					if (scope) {
						reportError(key, scope, syncErr)
					}
				}
			}
		},

		subscribe(listener): Unsubscribe {
			return listeners.subscribe(listener)
		},

		destroy() {
			isDestroyed = true

			try {
				unsubscribeAdapter()
				listeners.clear()

				try {
					channel?.close()
				} catch {
					// BroadcastChannel.close() failure is non-critical — the channel
					// will be garbage-collected regardless. Swallow to ensure the
					// remaining cleanup (adapter.destroy) always runs.
				}
			} finally {
				adapter.destroy?.()
			}
		},
	}
}
