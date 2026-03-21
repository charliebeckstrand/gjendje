import { notify } from '../batch.js'
import { getConfig, log } from '../config.js'
import { createListeners } from '../listeners.js'
import { mergeKeys, pickKeys, readAndMigrate, wrapForStorage } from '../persist.js'
import type { Adapter, StateOptions } from '../types.js'

export function createStorageAdapter<T>(
	storage: Storage,
	key: string,
	options: StateOptions<T>,
): Adapter<T> {
	const { default: defaultValue, version, serialize, persist } = options

	const listeners = createListeners<T>()

	function read(): T {
		try {
			const raw = storage.getItem(key)

			if (raw === null) return defaultValue

			let value: T

			if (serialize) {
				try {
					value = serialize.parse(raw)
				} catch {
					return defaultValue
				}
			} else {
				value = readAndMigrate(raw, options, key, options.scope)
			}

			return mergeKeys(value, defaultValue, persist)
		} catch {
			return defaultValue
		}
	}

	function write(value: T): void {
		try {
			const toStore = pickKeys(value, persist)

			const raw = serialize ? serialize.stringify(toStore) : wrapForStorage(toStore, version)

			storage.setItem(key, raw)
		} catch (e) {
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

		lastNotifiedValue = read()

		notify(notifyListeners)
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('storage', onStorageEvent)
	}

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

			if (typeof window !== 'undefined') {
				window.removeEventListener('storage', onStorageEvent)
			}
		},
	}
}
