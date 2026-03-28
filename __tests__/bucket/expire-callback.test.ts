import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, resetConfig, state } from '../../src/index.js'
import { makeStorage } from '../helpers.js'

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'sessionStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'BroadcastChannel', {
		value: class {
			onmessage = null
			postMessage() {}
			close() {}
		},
		configurable: true,
	})

	Object.defineProperty(globalThis, 'navigator', {
		value: {},
		configurable: true,
		writable: true,
	})
})

afterEach(() => {
	resetConfig()
})

describe('onExpire callback', () => {
	it('fires when bucket data has expired', async () => {
		const emptyBucketStorage = makeStorage()

		const mockBucket = {
			localStorage: async () => emptyBucketStorage,
		}

		Object.defineProperty(globalThis, 'navigator', {
			value: { storageBuckets: { open: vi.fn().mockResolvedValue(mockBucket) } },
			configurable: true,
			writable: true,
		})

		const onExpire = vi.fn()

		configure({ onExpire })

		const prefs = state('expire-test', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'expire-bucket' },
		})

		// Write a value during fallback init — sets hadUserWrite = true
		prefs.set('dark')

		await prefs.ready

		expect(onExpire).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'expire-test',
				scope: 'bucket',
				expiredAt: expect.any(Number),
			}),
		)

		prefs.destroy()
	})

	it('does not fire when bucket has stored value', async () => {
		const bucketStorage = makeStorage()

		bucketStorage.setItem('no-expire-test', '"dark"')

		const mockBucket = {
			localStorage: async () => bucketStorage,
		}

		Object.defineProperty(globalThis, 'navigator', {
			value: { storageBuckets: { open: vi.fn().mockResolvedValue(mockBucket) } },
			configurable: true,
			writable: true,
		})

		const onExpire = vi.fn()

		configure({ onExpire })

		const prefs = state('no-expire-test', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'no-expire-bucket' },
		})

		prefs.set('dark')

		await prefs.ready

		expect(onExpire).not.toHaveBeenCalled()

		prefs.destroy()
	})
})
