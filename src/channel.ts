import { createListeners } from './listeners.js'
import type { Listener, Unsubscribe } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelInstance<T> {
	readonly key: string
	emit(payload: T): void
	subscribe(listener: Listener<T>): Unsubscribe
	destroy(): void
	readonly isDestroyed: boolean
}

export interface ChannelOptions {
	key?: string
}

// ---------------------------------------------------------------------------
// Auto-incrementing key counter
// ---------------------------------------------------------------------------

let channelCounter = 0

// ---------------------------------------------------------------------------
// channel
// ---------------------------------------------------------------------------

/**
 * Create a lightweight pub/sub event channel.
 * No state is stored — fire-and-forget.
 *
 * ```ts
 * const onClick = channel<{ x: number; y: number }>('click')
 *
 * const unsub = onClick.subscribe(({ x, y }) => console.log(x, y))
 * onClick.emit({ x: 100, y: 200 })
 *
 * // Later — tear down all subscriptions
 * onClick.destroy()
 * ```
 */
export function channel<T>(nameOrOptions?: string | ChannelOptions): ChannelInstance<T> {
	const resolvedKey =
		typeof nameOrOptions === 'string'
			? nameOrOptions
			: (nameOrOptions?.key ?? `channel:${channelCounter++}`)

	const listeners = createListeners<T>()

	let destroyed = false

	return {
		get key() {
			return resolvedKey
		},

		emit(payload: T): void {
			if (destroyed) return

			listeners.notify(payload)
		},

		subscribe(listener: Listener<T>): Unsubscribe {
			return listeners.subscribe(listener)
		},

		destroy(): void {
			if (destroyed) return

			destroyed = true
			listeners.clear()
		},

		get isDestroyed() {
			return destroyed
		},
	}
}
