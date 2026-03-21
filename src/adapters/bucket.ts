import { notify } from '../batch.js'
import { log } from '../config.js'
import { createListeners } from '../listeners.js'
import type { Adapter, BucketOptions, StateOptions } from '../types.js'
import { shallowEqual } from '../utils.js'
import { createStorageAdapter } from './storage.js'

// ---------------------------------------------------------------------------
// Storage Buckets API ambient types
// ---------------------------------------------------------------------------

interface StorageBucket {
	localStorage(): Promise<Storage>
}

interface StorageBucketManager {
	open(
		name: string,
		options?: {
			persisted?: boolean
			durability?: 'strict' | 'relaxed'
			quota?: number
			expires?: number
		},
	): Promise<StorageBucket>
}

declare global {
	interface Navigator {
		storageBuckets?: StorageBucketManager
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBucketSupported(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		'storageBuckets' in navigator &&
		navigator.storageBuckets != null
	)
}

function parseExpiry(expires: string | number): number | undefined {
	if (typeof expires === 'number') return expires

	const units: Record<string, number> = {
		ms: 1,
		s: 1_000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
		w: 604_800_000,
	}

	const match = expires.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/)

	if (!match || !match[1] || !match[2]) return undefined

	const value = parseFloat(match[1])

	const unit = units[match[2]]

	if (!unit) return undefined

	return Date.now() + value * unit
}

function parseQuota(quota: string | number): number | undefined {
	if (typeof quota === 'number') return quota

	const units: Record<string, number> = {
		b: 1,
		kb: 1_024,
		mb: 1_048_576,
		gb: 1_073_741_824,
	}

	const match = quota.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/)

	if (!match || !match[1] || !match[2]) return undefined

	const value = parseFloat(match[1])

	const unit = units[match[2]]

	if (!unit) return undefined

	return Math.floor(value * unit)
}

// ---------------------------------------------------------------------------
// Bucket adapter
// ---------------------------------------------------------------------------

export function createBucketAdapter<T>(
	key: string,
	bucketOptions: BucketOptions,
	options: StateOptions<T>,
): Adapter<T> {
	const { default: defaultValue } = options
	const fallbackScope = bucketOptions.fallback ?? 'local'

	const listeners = createListeners<T>()

	let lastNotifiedValue: T = defaultValue

	const notifyListeners = () => listeners.notify(lastNotifiedValue)

	// Storage delegate — starts as null, set after ready resolves
	let delegate: Adapter<T> | null = null
	let isDestroyed = false

	function read(): T {
		if (!delegate) return defaultValue

		return delegate.get()
	}

	function write(value: T): void {
		if (!delegate) return

		delegate.set(value)
	}

	// ---------------------------------------------------------------------------
	// Initialization — open the bucket or fall back gracefully
	// ---------------------------------------------------------------------------

	const ready = (async (): Promise<void> => {
		try {
			if (!isBucketSupported()) {
				throw new Error('Storage Buckets not supported')
			}

			const openOptions: Parameters<StorageBucketManager['open']>[1] = {
				persisted: bucketOptions.persisted ?? false,
				durability: 'strict',
			}

			if (bucketOptions.expires != null) {
				const parsed = parseExpiry(bucketOptions.expires)

				if (parsed != null) {
					openOptions.expires = parsed
				} else {
					log(
						'warn',
						`Invalid bucket expires format: "${bucketOptions.expires}". ` +
							'Expected a number or a string like "7d", "24h", "30m".',
					)
				}
			}

			if (bucketOptions.quota != null) {
				const parsed = parseQuota(bucketOptions.quota)

				if (parsed != null) {
					openOptions.quota = parsed
				} else {
					log(
						'warn',
						`Invalid bucket quota format: "${bucketOptions.quota}". ` +
							'Expected a number or a string like "10mb", "50kb", "1gb".',
					)
				}
			}

			const bucketManager = navigator.storageBuckets

			if (!bucketManager) throw new Error('Storage Buckets not supported')

			const bucket = await bucketManager.open(bucketOptions.name, openOptions)

			const storage = await bucket.localStorage()

			delegate = createStorageAdapter(storage, key, options)
		} catch {
			// Yield to ensure get() returns default before ready resolves
			await Promise.resolve()

			// Storage Buckets unavailable or failed — fall back to localStorage/sessionStorage
			const fallbackStorage = fallbackScope === 'tab' ? sessionStorage : localStorage

			delegate = createStorageAdapter(fallbackStorage, key, options)
		}

		// If destroyed during initialization, clean up and bail out
		if (isDestroyed) {
			delegate?.destroy?.()
			delegate = null

			return
		}

		// Notify subscribers if the stored value differs from the default
		const storedValue = delegate.get()

		if (!shallowEqual(storedValue, defaultValue)) {
			lastNotifiedValue = storedValue

			notify(notifyListeners)
		}

		// Forward future storage events from the delegate to our listeners
		delegate.subscribe((value) => {
			lastNotifiedValue = value

			notify(notifyListeners)
		})
	})()

	return {
		ready,

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
			isDestroyed = true

			listeners.clear()

			delegate?.destroy?.()
			delegate = null
		},
	}
}
