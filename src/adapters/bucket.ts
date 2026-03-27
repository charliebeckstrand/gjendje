import { notify } from '../batch.js'
import { getConfig, log, reportError } from '../config.js'
import { createListeners, safeCallConfig } from '../listeners.js'
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

function parseWithUnits(
	input: string | number,
	units: Record<string, number>,
	transform?: (result: number) => number,
): number | undefined {
	if (typeof input === 'number') return input

	const unitKeys = Object.keys(units)
		.sort((a, b) => b.length - a.length)
		.join('|')

	const match = input.toLowerCase().match(new RegExp(`^(\\d+(?:\\.\\d+)?)(${unitKeys})$`))

	if (!match?.[1] || !match[2]) return undefined

	const value = parseFloat(match[1])

	const unit = units[match[2]]

	if (!unit) return undefined

	const result = value * unit

	return transform ? transform(result) : result
}

const EXPIRY_UNITS: Record<string, number> = {
	ms: 1,
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
	w: 604_800_000,
}

const QUOTA_UNITS: Record<string, number> = {
	b: 1,
	kb: 1_024,
	mb: 1_048_576,
	gb: 1_073_741_824,
}

function parseExpiry(expires: string | number): number | undefined {
	return parseWithUnits(expires, EXPIRY_UNITS, (v) => Date.now() + v)
}

function parseQuota(quota: string | number): number | undefined {
	return parseWithUnits(quota, QUOTA_UNITS, Math.floor)
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
	const fallbackStorage = fallbackScope === 'session' ? sessionStorage : localStorage
	let delegate: Adapter<T> = createStorageAdapter(fallbackStorage, key, options)

	let isDestroyed = false

	let delegateUnsub: (() => void) | undefined

	// ---------------------------------------------------------------------------
	// Initialization — try to upgrade to a real Storage Bucket
	// ---------------------------------------------------------------------------

	const ready = (async (): Promise<void> => {
		if (!isBucketSupported()) return

		let hadUserWrite = false

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
			hadUserWrite = !shallowEqual(currentValue, defaultValue)

			// Swap to the bucket delegate
			delegate.destroy?.()
			delegate = createStorageAdapter(storage, key, options)

			// If destroy() was called during the synchronous swap above,
			// clean up the newly created delegate and bail out.
			if (isDestroyed) {
				delegate.destroy?.()

				return
			}

			// Check if bucket data expired — fallback had data but bucket is empty
			const bucketValue = delegate.get()

			if (hadUserWrite && shallowEqual(bucketValue, defaultValue)) {
				safeCallConfig(getConfig().onExpire, { key, scope: 'bucket', expiredAt: Date.now() })
			}

			// Migrate: if user wrote during init, carry that value into the bucket
			if (hadUserWrite) {
				delegate.set(currentValue)
			}
		} catch (err) {
			log(
				'warn',
				`Storage Bucket initialization failed for key "${key}" — using ${fallbackScope} fallback.`,
			)
			reportError(key, 'bucket', err)
		}

		if (isDestroyed) return

		// Notify subscribers if the stored value differs from the default,
		// but only when the value wasn't already written by the user during init.
		// When hadUserWrite is true, the outer set() already notified subscribers
		// and we just migrated that same value into the bucket — a second
		// notification with the same value would be a spurious duplicate.
		if (!hadUserWrite) {
			const storedValue = delegate.get()

			if (!shallowEqual(storedValue, defaultValue)) {
				lastNotifiedValue = storedValue

				notify(notifyListeners)
			}
		}

		// Forward future storage events from the delegate to our listeners
		delegateUnsub = delegate.subscribe((value) => {
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

			delegateUnsub?.()

			listeners.clear()

			delegate.destroy?.()
		},
	}
}
