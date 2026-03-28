import { notify } from '../batch.js'
import { log, reportError } from '../config.js'
import { StorageWriteError } from '../errors.js'
import { createListeners } from '../listeners.js'
import { mergeKeys, pickKeys } from '../persist.js'
import type { Adapter, Serializer } from '../types.js'
import { RESOLVED } from '../utils.js'

export function createUrlAdapter<T>(
	key: string,
	defaultValue: T,
	serializer: Serializer<T>,
	persist?: string[],
	urlReplace?: boolean,
): Adapter<T> {
	if (typeof window === 'undefined') {
		throw new Error('[gjendje] URL scope is not available in this environment.')
	}

	const listeners = createListeners<T>(key, 'url')

	// Cache serialized default once — avoids re-serializing on every write()
	const defaultSerialized = serializer.stringify(defaultValue)

	// Read cache — avoids re-constructing URLSearchParams + re-parsing when
	// location.search hasn't changed. Same pattern as the storage adapter cache.
	let cachedSearch: string | undefined
	let cachedValue: T = defaultValue

	function read(): T {
		try {
			const search = window.location.search

			if (search === cachedSearch) return cachedValue

			const params = new URLSearchParams(search)

			const raw = params.get(key)

			if (raw === null) {
				cachedSearch = search
				cachedValue = defaultValue
				return defaultValue
			}

			// URLSearchParams.get() already decodes percent-encoding,
			// so no additional decodeURIComponent is needed.
			const value = mergeKeys(serializer.parse(raw), defaultValue, persist)

			cachedSearch = search
			cachedValue = value

			return value
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
				// URLSearchParams.set() encodes values automatically,
				// so no additional encodeURIComponent is needed.
				params.set(key, stringified)
			}

			const search = params.toString()

			const newUrl = search
				? `${window.location.pathname}?${search}${window.location.hash}`
				: `${window.location.pathname}${window.location.hash}`

			if (urlReplace) {
				window.history.replaceState(null, '', newUrl)
			} else {
				window.history.pushState(null, '', newUrl)
			}

			// Pre-populate cache so the next read() hits the fast path.
			// Use the new search string (with '?' prefix) to match location.search.
			cachedSearch = search ? `?${search}` : ''
			cachedValue = persist ? mergeKeys(toStore as T, defaultValue, persist) : value
		} catch (e) {
			// Invalidate cache since URL state is uncertain.
			cachedSearch = undefined

			const writeErr = new StorageWriteError(key, 'url', e)

			log('error', writeErr.message)
			reportError(key, 'url', writeErr)

			// Re-throw so callers know the write failed and can skip
			// notifications to prevent state/URL divergence.
			throw writeErr
		}
	}

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => listeners.notify(lastNotifiedValue)

	function onPopState(): void {
		// Invalidate cache — URL changed via browser navigation
		cachedSearch = undefined

		lastNotifiedValue = read()

		notify(notifyListeners)
	}

	window.addEventListener('popstate', onPopState)

	return {
		ready: RESOLVED,

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
			try {
				listeners.clear()
			} finally {
				window.removeEventListener('popstate', onPopState)
			}
		},
	}
}
