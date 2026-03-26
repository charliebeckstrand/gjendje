import { notify } from '../batch.js'
import { getConfig, log } from '../config.js'
import { createListeners } from '../listeners.js'
import { mergeKeys, pickKeys, readAndMigrate, wrapForStorage } from '../persist.js'
import type { Adapter, StateOptions } from '../types.js'
import { RESOLVED } from '../utils.js'

export function createStorageAdapter<T>(
	storage: Storage,
	key: string,
	options: StateOptions<T>,
): Adapter<T> {
	const { default: defaultValue, version, serialize, persist } = options

	const listeners = createListeners<T>()

	// Read cache — avoids re-parsing when the raw string in storage hasn't changed.
	// `cacheValid` is a fast-path flag: when true, we skip `storage.getItem()`
	// entirely and return the cached value. It is set to true after every
	// successful read/write and invalidated on storage events, parse errors,
	// and destroy.
	let cachedRaw: string | null | undefined
	let cachedValue: T | undefined
	let cacheValid = false

	function parse(raw: string): T {
		if (serialize) {
			return serialize.parse(raw)
		}

		return readAndMigrate(raw, options, key, options.scope)
	}

	function read(): T {
		// Trust-the-cache fast path: skip storage.getItem() when cache is valid.
		// Cache is invalidated by storage events (cross-tab), parse errors, and destroy.
		if (cacheValid) return cachedValue as T

		try {
			const raw = storage.getItem(key)

			if (raw === null) {
				cachedRaw = null
				cachedValue = defaultValue
				cacheValid = true
				return defaultValue
			}

			// Return cached parse result when the raw string is unchanged
			if (raw === cachedRaw) {
				cacheValid = true
				return cachedValue as T
			}

			let value: T

			try {
				value = parse(raw)
			} catch {
				cachedRaw = undefined
				cachedValue = undefined
				cacheValid = false
				return defaultValue
			}

			value = mergeKeys(value, defaultValue, persist)

			cachedRaw = raw
			cachedValue = value
			cacheValid = true

			return value
		} catch {
			return defaultValue
		}
	}

	function write(value: T): void {
		try {
			const toStore = pickKeys(value, persist)

			const raw = serialize ? serialize.stringify(toStore) : wrapForStorage(toStore, version)

			storage.setItem(key, raw)

			// Pre-populate cache so the next read() hits the fast path instead of
			// re-reading from storage. The cached value must match what read() would
			// return: when `persist` is set, pickKeys strips keys on write and
			// mergeKeys re-adds defaults on read, so we merge here too.
			cachedRaw = raw
			cachedValue = persist ? mergeKeys(toStore as T, defaultValue, persist) : value
			cacheValid = true
		} catch (e) {
			// Invalidate cache — write may have partially succeeded
			cachedRaw = undefined
			cachedValue = undefined
			cacheValid = false

			log(
				'error',
				`Failed to write key "${key}" to storage: ${e instanceof Error ? e.message : String(e)}`,
			)

			const isQuotaError =
				e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)

			if (isQuotaError && options.scope) {
				getConfig().onQuotaExceeded?.({ key, scope: options.scope, error: e })
			}
		}
	}

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => listeners.notify(lastNotifiedValue)

	function onStorageEvent(event: StorageEvent): void {
		if (event.storageArea !== storage || event.key !== key) return

		// Invalidate cache — another tab changed storage
		cachedRaw = undefined
		cachedValue = undefined
		cacheValid = false

		lastNotifiedValue = read()

		notify(notifyListeners)
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('storage', onStorageEvent)
	}

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
			cachedRaw = undefined
			cachedValue = undefined
			cacheValid = false

			listeners.clear()

			if (typeof window !== 'undefined') {
				window.removeEventListener('storage', onStorageEvent)
			}
		},
	}
}
