import { notify } from '../batch.js'
import { getConfig, log } from '../config.js'
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

	// Start with the fallback storage synchronously so get()/set() work immediately
	const fallbackStorage = fallbackScope === 'tab' ? sessionStorage : localStorage
	let delegate: Adapter<T> = createStorageAdapter(fallbackStorage, key, options)

	let isDestroyed = false

	// ---------------------------------------------------------------------------
	// Initialization — try to upgrade to a real Storage Bucket
	// ---------------------------------------------------------------------------

	const ready = (async (): Promise<void> => {
		if (!isBucketSupported()) return

		try {
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

			if (!bucketManager) return

			const bucket = await bucketManager.open(bucketOptions.name, openOptions)

			const storage = await bucket.localStorage()

			if (isDestroyed) return

			// Capture any value the user wrote to the fallback during init
			const currentValue = delegate.get()
			const hadUserWrite = !shallowEqual(currentValue, defaultValue)

			// Swap to the bucket delegate
			delegate.destroy?.()
			delegate = createStorageAdapter(storage, key, options)

			// Check if bucket data expired — fallback had data but bucket is empty
			const bucketValue = delegate.get()

			if (hadUserWrite && shallowEqual(bucketValue, defaultValue)) {
				getConfig().onExpire?.({ key, scope: 'bucket', expiredAt: Date.now() })
			}

			// Migrate: if user wrote during init, carry that value into the bucket
			if (hadUserWrite) {
				delegate.set(currentValue)
			}
		} catch {
			// Storage Buckets failed — keep using the fallback delegate
		}

		if (isDestroyed) return

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
			return delegate.get()
		},

		set(value) {
			delegate.set(value)

			lastNotifiedValue = value

			notify(notifyListeners)
		},

		subscribe: listeners.subscribe,

		destroy() {
			isDestroyed = true

			listeners.clear()

			delegate.destroy?.()
		},
	}
}
