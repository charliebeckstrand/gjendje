import { notify } from '../batch.js'
import { createListeners } from '../listeners.js'
import { mergeKeys, pickKeys } from '../persist.js'
import type { Adapter, Serializer } from '../types.js'

export function createUrlAdapter<T>(
	key: string,
	defaultValue: T,
	serializer: Serializer<T>,
	persist?: string[],
): Adapter<T> {
	if (typeof window === 'undefined') {
		throw new Error('[state] URL scope is not available in this environment.')
	}

	const listeners = createListeners<T>()

	// Cache serialized default once — avoids re-serializing on every write()
	const defaultSerialized = serializer.stringify(defaultValue)

	function read(): T {
		try {
			const params = new URLSearchParams(window.location.search)

			const raw = params.get(key)

			if (raw === null) return defaultValue

			return mergeKeys(serializer.parse(decodeURIComponent(raw)), defaultValue, persist)
		} catch {
			return defaultValue
		}
	}

	function write(value: T): void {
		try {
			const params = new URLSearchParams(window.location.search)

			const toStore = pickKeys(value, persist)

			const stringified = serializer.stringify(toStore)

			const isDefault = stringified === defaultSerialized

			if (isDefault) {
				params.delete(key)
			} else {
				params.set(key, encodeURIComponent(stringified))
			}

			const search = params.toString()

			const newUrl = search
				? `${window.location.pathname}?${search}${window.location.hash}`
				: `${window.location.pathname}${window.location.hash}`

			window.history.pushState(null, '', newUrl)
		} catch {
			// Serialization or pushState can fail (e.g. sandboxed iframes,
			// SecurityError). The in-memory value is still updated via set().
		}
	}

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => listeners.notify(lastNotifiedValue)

	function onPopState(): void {
		lastNotifiedValue = read()

		notify(notifyListeners)
	}

	window.addEventListener('popstate', onPopState)

	return {
		ready: Promise.resolve(),

		get() {
			return read()
		},

		set(value) {
			write(value)

			lastNotifiedValue = value

			notify(notifyListeners)
		},

		subscribe: listeners.subscribe,

		destroy() {
			listeners.clear()

			window.removeEventListener('popstate', onPopState)
		},
	}
}
