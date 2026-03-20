import { notify } from '../batch.js'
import { mergeKeys, pickKeys } from '../persist.js'
import type { Adapter, Listener, Serializer, Unsubscribe } from '../types.js'

export function createUrlAdapter<T>(
	key: string,
	defaultValue: T,
	serializer: Serializer<T>,
	persist?: string[],
): Adapter<T> {
	if (typeof window === 'undefined') {
		throw new Error('[state] URL scope is not available in this environment.')
	}

	const listeners = new Set<Listener<T>>()

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
		const params = new URLSearchParams(window.location.search)

		const toStore = pickKeys(value, persist)

		const stringified = serializer.stringify(toStore)

		const isDefault = stringified === serializer.stringify(defaultValue)

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
	}

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => {
		for (const listener of listeners) {
			listener(lastNotifiedValue)
		}
	}

	function onPopState(): void {
		lastNotifiedValue = read()

		notify(notifyListeners)
	}

	window.addEventListener('popstate', onPopState)

	return {
		ready: Promise.resolve() as Promise<void>,

		get() {
			return read()
		},

		set(value) {
			write(value)

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

			window.removeEventListener('popstate', onPopState)
		},
	}
}
