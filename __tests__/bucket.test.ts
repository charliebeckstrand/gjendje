import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, state } from '../src/index.js'
import { makeStorage } from './helpers.js'

const fallbackStorage = makeStorage()

beforeEach(() => {
	fallbackStorage.clear()

	Object.defineProperty(globalThis, 'localStorage', {
		value: fallbackStorage,
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

	// Remove navigator.storageBuckets by default — tests that need it add it
	Object.defineProperty(globalThis, 'navigator', {
		value: {},
		configurable: true,
		writable: true,
	})

	configure({
		onError: undefined,
		logLevel: undefined,
	})
})

// ---------------------------------------------------------------------------
// Fallback behaviour (no Storage Buckets support)
// ---------------------------------------------------------------------------

describe('bucket scope — fallback', () => {
	it('returns default before ready resolves', () => {
		const prefs = state('bkt-default', {
			default: { theme: 'light' },
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		expect(prefs.get()).toEqual({ theme: 'light' })

		prefs.destroy()
	})

	it('falls back to localStorage when Storage Buckets unavailable', async () => {
		const prefs = state('bkt-fallback', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket', fallback: 'local' },
		})

		await prefs.ready

		prefs.set('dark')

		expect(fallbackStorage.getItem('bkt-fallback')).toBe('"dark"')

		prefs.destroy()
	})

	it('falls back to sessionStorage when fallback is session', async () => {
		const prefs = state('bkt-session-fallback', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket', fallback: 'session' },
		})

		await prefs.ready

		prefs.set('dark')

		expect(sessionStorage.getItem('bkt-session-fallback')).toBe('"dark"')

		prefs.destroy()
	})

	it('ready resolves even when falling back', async () => {
		const prefs = state('bkt-ready-fallback', {
			default: 0,
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		await expect(prefs.ready).resolves.toBeUndefined()

		prefs.destroy()
	})

	it('reads persisted fallback value immediately without notification', async () => {
		fallbackStorage.setItem('bkt-notify', '"dark"')

		const theme = state('bkt-notify', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		// Value is available immediately via fallback — no notification needed
		expect(theme.get()).toBe('dark')

		const listener = vi.fn()

		theme.subscribe(listener)

		await theme.ready

		// No notification — value was already available synchronously
		expect(listener).not.toHaveBeenCalled()

		theme.destroy()
	})

	it('reads stored value after ready resolves', async () => {
		fallbackStorage.setItem('bkt-read', '"dark"')

		const theme = state('bkt-read', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		await theme.ready

		expect(theme.get()).toBe('dark')

		theme.destroy()
	})

	it('get() returns persisted fallback value before ready', () => {
		fallbackStorage.setItem('bkt-before-ready', '"dark"')

		const theme = state('bkt-before-ready', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		// Before awaiting ready — returns persisted value from fallback
		expect(theme.get()).toBe('dark')

		theme.destroy()
	})

	it('set() writes immediately without awaiting ready', () => {
		const theme = state('bkt-set', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		// No await — set works immediately via fallback storage
		theme.set('dark')

		expect(theme.get()).toBe('dark')
		expect(fallbackStorage.getItem('bkt-set')).toBe('"dark"')

		theme.destroy()
	})
})

// ---------------------------------------------------------------------------
// Storage Buckets API support
// ---------------------------------------------------------------------------

describe('bucket scope — native Storage Buckets', () => {
	beforeEach(() => {
		const bucketStorage = makeStorage()

		const mockBucket = {
			localStorage: async () => bucketStorage,
		}

		const mockManager = {
			open: vi.fn().mockResolvedValue(mockBucket),
		}

		Object.defineProperty(globalThis, 'navigator', {
			value: { storageBuckets: mockManager },
			configurable: true,
			writable: true,
		})
	})

	it('opens a named bucket', async () => {
		const prefs = state('bkt-native', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'user-prefs' },
		})

		await prefs.ready

		expect(navigator.storageBuckets?.open).toHaveBeenCalledWith(
			'user-prefs',
			expect.objectContaining({ durability: 'strict' }),
		)

		prefs.destroy()
	})

	it('passes persisted option to bucket open', async () => {
		const prefs = state('bkt-persisted', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'user-prefs', persisted: true },
		})

		await prefs.ready

		expect(navigator.storageBuckets?.open).toHaveBeenCalledWith(
			'user-prefs',
			expect.objectContaining({ persisted: true }),
		)

		prefs.destroy()
	})

	it('parses expires string and passes timestamp', async () => {
		const before = Date.now()

		const prefs = state('bkt-expires', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'user-prefs', expires: '7d' },
		})

		await prefs.ready

		const call = (navigator.storageBuckets?.open as ReturnType<typeof vi.fn>).mock.calls[0]
		const openOptions = call?.[1] as { expires?: number }
		const after = Date.now()

		const sevenDays = 7 * 24 * 60 * 60 * 1000

		expect(openOptions?.expires).toBeGreaterThanOrEqual(before + sevenDays)
		expect(openOptions?.expires).toBeLessThanOrEqual(after + sevenDays)

		prefs.destroy()
	})

	it('parses quota string and passes bytes', async () => {
		const prefs = state('bkt-quota', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'user-prefs', quota: '10mb' },
		})

		await prefs.ready

		const call = (navigator.storageBuckets?.open as ReturnType<typeof vi.fn>).mock.calls[0]
		const openOptions = call?.[1] as { quota?: number }

		expect(openOptions?.quota).toBe(10 * 1024 * 1024)

		prefs.destroy()
	})

	it('reads and writes to the bucket storage', async () => {
		const theme = state('bkt-rw', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'user-prefs' },
		})

		await theme.ready

		theme.set('dark')

		expect(theme.get()).toBe('dark')

		theme.destroy()
	})

	it('throws if bucket option is missing', () => {
		expect(() => {
			state('bkt-no-options', {
				default: 'light',
				scope: 'bucket',
			})
		}).toThrow('[gjendje]')
	})

	it('warns on invalid expires format', async () => {
		const warnings: string[] = []

		const originalWarn = console.warn

		console.warn = (msg: string) => warnings.push(msg)

		try {
			const prefs = state('bkt-bad-expires', {
				default: 'light',
				scope: 'bucket',
				bucket: { name: 'user-prefs', expires: '7 days' },
			})

			await prefs.ready

			expect(warnings.length).toBeGreaterThan(0)
			expect(warnings.some((w) => w.includes('Invalid bucket expires'))).toBe(true)

			prefs.destroy()
		} finally {
			console.warn = originalWarn
		}
	})

	it('warns on invalid quota format', async () => {
		const warnings: string[] = []

		const originalWarn = console.warn

		console.warn = (msg: string) => warnings.push(msg)

		try {
			const prefs = state('bkt-bad-quota', {
				default: 'light',
				scope: 'bucket',
				bucket: { name: 'user-prefs', quota: '10 megabytes' },
			})

			await prefs.ready

			expect(warnings.length).toBeGreaterThan(0)
			expect(warnings.some((w) => w.includes('Invalid bucket quota'))).toBe(true)

			prefs.destroy()
		} finally {
			console.warn = originalWarn
		}
	})
})

// ---------------------------------------------------------------------------
// Destroy during initialization
// ---------------------------------------------------------------------------

describe('bucket scope — destroy during init', () => {
	it('does not leak delegate when destroyed before ready', async () => {
		const prefs = state('bkt-destroy-early', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		const listener = vi.fn()

		prefs.subscribe(listener)

		// Destroy immediately before ready resolves
		prefs.destroy()

		// Let the async init complete
		await new Promise((r) => setTimeout(r, 10))

		// Listener should not have been called after destroy
		expect(listener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// Bucket initialization error reporting
// ---------------------------------------------------------------------------

describe('bucket scope — error reporting', () => {
	it('reports error via onError when Storage Buckets API throws', async () => {
		const onError = vi.fn()

		configure({ onError, logLevel: 'silent' })

		Object.defineProperty(globalThis, 'navigator', {
			value: {
				storageBuckets: {
					open: () => Promise.reject(new Error('bucket API failure')),
				},
			},
			configurable: true,
			writable: true,
		})

		const s = state('bkt-err-report', {
			default: 'fallback-val',
			scope: 'bucket',
			bucket: { name: 'err-bucket' },
		})

		await s.ready

		expect(onError).toHaveBeenCalledWith({
			key: 'bkt-err-report',
			scope: 'bucket',
			error: expect.any(Error),
		})

		// Falls back gracefully — value still accessible
		expect(s.get()).toBe('fallback-val')
	})
})
