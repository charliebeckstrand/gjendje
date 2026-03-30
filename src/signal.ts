import { notify } from './batch.js'
import { createListeners } from './listeners.js'
import type { BaseInstance, Listener, ReadonlyInstance, Unsubscribe } from './types.js'
import { createLazyDestroyed, RESOLVED } from './utils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Signal<T> {
	readonly value: T
	subscribe(listener: Listener<T>): Unsubscribe
}

export interface WritableSignal<T> extends Signal<T> {
	value: T
}

export interface SignalLike<T> {
	readonly value: T
	subscribe(listener: (value: T) => void): () => void
}

export interface FromSignalOptions {
	key?: string
}

// ---------------------------------------------------------------------------
// toSignal
// ---------------------------------------------------------------------------

export function toSignal<T>(instance: BaseInstance<T>): WritableSignal<T>
export function toSignal<T>(instance: ReadonlyInstance<T>): Signal<T>
export function toSignal<T>(instance: ReadonlyInstance<T>): Signal<T> | WritableSignal<T> {
	if (typeof (instance as BaseInstance<T>).set === 'function') {
		const writable = instance as BaseInstance<T>

		return {
			get value() {
				return writable.get()
			},
			set value(v: T) {
				writable.set(v)
			},
			subscribe: writable.subscribe.bind(writable),
		}
	}

	return {
		get value() {
			return instance.get()
		},
		subscribe: instance.subscribe.bind(instance),
	}
}

// ---------------------------------------------------------------------------
// Auto-incrementing key counter
// ---------------------------------------------------------------------------

let signalCounter = 0

// ---------------------------------------------------------------------------
// fromSignal
// ---------------------------------------------------------------------------

export function fromSignal<T>(
	signal: SignalLike<T>,
	options?: FromSignalOptions,
): ReadonlyInstance<T> {
	const listeners = createListeners<T>()

	const instanceKey = options?.key ?? `signal:${signalCounter++}`

	let current: T = signal.value

	let isDestroyed = false

	const notifyListeners = () => {
		listeners.notify(current)
	}

	let unsubscribe: (() => void) | undefined

	try {
		unsubscribe = signal.subscribe((next) => {
			if (!Object.is(current, next)) {
				current = next
				notify(notifyListeners)
			}
		})
	} catch {
		listeners.clear()

		throw new Error(`[gjendje] fromSignal(): signal.subscribe() threw for "${instanceKey}".`)
	}

	const lazyDestroyed = createLazyDestroyed()

	return {
		key: instanceKey,
		scope: 'memory',

		get ready(): Promise<void> {
			return RESOLVED
		},

		get settled(): Promise<void> {
			return RESOLVED
		},

		get hydrated(): Promise<void> {
			return RESOLVED
		},

		get destroyed(): Promise<void> {
			return lazyDestroyed.promise
		},

		get isDestroyed() {
			return isDestroyed
		},

		get() {
			return current
		},

		peek() {
			return current
		},

		subscribe: listeners.subscribe,

		destroy() {
			if (isDestroyed) return

			isDestroyed = true

			try {
				unsubscribe?.()
			} finally {
				listeners.clear()

				lazyDestroyed.resolve()
			}
		},
	}
}
