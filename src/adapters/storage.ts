import { notify } from '../batch.js'
import { getConfig, log, reportError } from '../config.js'
import { StorageWriteError } from '../errors.js'
import { createListeners, safeCallConfig } from '../listeners.js'
import {
	mergeKeys,
	pickKeys,
	processParsedValue,
	readAndMigrate,
	wrapForStorage,
} from '../persist.js'
import type { Adapter, StateOptions } from '../types.js'
import { RESOLVED } from '../utils.js'

export function createStorageAdapter<T>(
	storage: Storage,
	key: string,
	options: StateOptions<T>,
): Adapter<T> {
	const { default: defaultValue, version, serialize, persist } = options

	const scope = options.scope ?? 'local'

	const listeners = createListeners<T>(key, scope)

	// Read cache — avoids re-parsing when the raw string in storage hasn't changed.
	// `cacheValid` is a fast-path flag: when true, we skip `storage.getItem()`
	// entirely and return the cached value. It is set to true after every
	// successful read/write and invalidated on storage events, parse errors,
	// and destroy.
	let cachedRaw: string | null | undefined
	let cachedValue: T | undefined
	let cacheValid = false

	const backupKey = `${key}:__gjendje_backup`

	function backupRawData(raw: string): void {
		try {
			// Only backup once — preserve the earliest original data.
			if (storage.getItem(backupKey) === null) {
				storage.setItem(backupKey, raw)
				log(
					'warn',
					`Original data for key "${key}" backed up to "${backupKey}" after migration/validation failure.`,
				)
			}
		} catch (backupErr) {
			// Storage may be full — can't backup. Log so the failure is visible
			// and fire onError so programmatic handlers can react (e.g. send to server).
			const scope = options.scope ?? 'local'

			log(
				'error',
				`Failed to backup data for key "${key}" to "${backupKey}" — original data may be lost.`,
			)
			reportError(key, scope, backupErr)
		}
	}

	function parse(raw: string): T {
		if (serialize) {
			// Custom serializer replaces JSON.parse, but the post-parse pipeline
			// (versioned envelope unwrapping, migration, validation) still runs.
			// This ensures users combining serialize + migrate + validate get
			// consistent behavior with the default JSON path.
			const parsed = serialize.parse(raw)

			return processParsedValue(parsed, options, key, options.scope, () => backupRawData(raw))
		}

		return readAndMigrate(raw, options, key, options.scope, () => backupRawData(raw))
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

			let raw: string

			try {
				if (serialize) {
					// When versioning is active, wrap in a version envelope so the
					// read path can detect the stored version and run migrations.
					const payload = version && version > 1 ? { v: version, data: toStore } : toStore

					raw = serialize.stringify(payload as T)
				} else {
					raw = wrapForStorage(toStore, version)
				}
			} catch (serializeErr) {
				// Detect common serialization traps (circular refs, BigInt, etc.)
				// and wrap in a descriptive error before entering the write-error path.
				const scope = options.scope ?? 'local'
				const writeErr = new StorageWriteError(key, scope, serializeErr)

				log(
					'error',
					`Serialization failed for key "${key}" — value may contain circular references, BigInt, or other non-serializable types.`,
				)
				reportError(key, scope, writeErr)

				throw writeErr
			}

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

			const isQuota =
				e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)

			const scope = options.scope ?? 'local'

			const writeErr = new StorageWriteError(key, scope, e, isQuota)

			log('error', writeErr.message)

			if (isQuota) {
				safeCallConfig(getConfig().onQuotaExceeded, { key, scope, error: writeErr })
			}

			reportError(key, scope, writeErr)

			// Re-throw so callers (adapter set, StateImpl) know the write failed
			// and can skip notifications to prevent state/storage divergence.
			throw writeErr
		}
	}

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => listeners.notify(lastNotifiedValue)

	function onStorageEvent(event: StorageEvent): void {
		if (event.storageArea !== storage) return

		if (event.key !== null && event.key !== key) return

		// Invalidate cache — another tab changed this key or cleared storage
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

			try {
				listeners.clear()
			} finally {
				if (typeof window !== 'undefined') {
					window.removeEventListener('storage', onStorageEvent)
				}
			}
		},
	}
}
