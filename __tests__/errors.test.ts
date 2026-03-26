import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	configure,
	GjendjeError,
	HydrationError,
	MigrationError,
	StorageReadError,
	StorageWriteError,
	SyncError,
	state,
	ValidationError,
} from '../src/index.js'
import { makeStorage } from './helpers.js'

// ---------------------------------------------------------------------------
// Error class structure
// ---------------------------------------------------------------------------

describe('error classes', () => {
	it('GjendjeError has key, scope, and message', () => {
		const err = new GjendjeError('test message', 'myKey', 'local')

		expect(err instanceof Error).toBe(true)
		expect(err instanceof GjendjeError).toBe(true)
		expect(err.name).toBe('GjendjeError')
		expect(err.message).toBe('test message')
		expect(err.key).toBe('myKey')
		expect(err.scope).toBe('local')
	})

	it('StorageReadError includes key and scope', () => {
		const cause = new Error('JSON parse failed')

		const err = new StorageReadError('counter', 'local', cause)

		expect(err instanceof GjendjeError).toBe(true)
		expect(err instanceof StorageReadError).toBe(true)
		expect(err.name).toBe('StorageReadError')
		expect(err.key).toBe('counter')
		expect(err.scope).toBe('local')
		expect(err.cause).toBe(cause)
		expect(err.message).toContain('counter')
		expect(err.message).toContain('local')
	})

	it('StorageWriteError includes quota flag', () => {
		const err = new StorageWriteError('bigData', 'session', new Error('quota'), true)

		expect(err instanceof GjendjeError).toBe(true)
		expect(err instanceof StorageWriteError).toBe(true)
		expect(err.name).toBe('StorageWriteError')
		expect(err.isQuotaError).toBe(true)
		expect(err.message).toContain('quota exceeded')

		const nonQuota = new StorageWriteError('key', 'local')

		expect(nonQuota.isQuotaError).toBe(false)
		expect(nonQuota.cause).toBeUndefined()
	})

	it('MigrationError includes version info', () => {
		const err = new MigrationError('settings', 'local', 2, 5, new Error('bad data'))

		expect(err instanceof GjendjeError).toBe(true)
		expect(err instanceof MigrationError).toBe(true)
		expect(err.name).toBe('MigrationError')
		expect(err.fromVersion).toBe(2)
		expect(err.toVersion).toBe(5)
		expect(err.key).toBe('settings')
		expect(err.message).toContain('v2')
		expect(err.message).toContain('v5')
	})

	it('ValidationError includes rejected value', () => {
		const err = new ValidationError('theme', 'session', { invalid: true })

		expect(err instanceof GjendjeError).toBe(true)
		expect(err instanceof ValidationError).toBe(true)
		expect(err.name).toBe('ValidationError')
		expect(err.rejectedValue).toEqual({ invalid: true })
	})

	it('SyncError wraps cause', () => {
		const cause = new TypeError('postMessage failed')

		const err = new SyncError('counter', 'local', cause)

		expect(err instanceof GjendjeError).toBe(true)
		expect(err instanceof SyncError).toBe(true)
		expect(err.name).toBe('SyncError')
		expect(err.cause).toBe(cause)
	})

	it('HydrationError wraps cause', () => {
		const cause = new Error('sessionStorage unavailable')

		const err = new HydrationError('user', 'session', cause)

		expect(err instanceof GjendjeError).toBe(true)
		expect(err instanceof HydrationError).toBe(true)
		expect(err.name).toBe('HydrationError')
		expect(err.cause).toBe(cause)
	})
})

// ---------------------------------------------------------------------------
// Integration: onError receives typed errors
// ---------------------------------------------------------------------------

describe('onError receives typed errors', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'localStorage', {
			value: makeStorage(),
			configurable: true,
		})

		Object.defineProperty(globalThis, 'window', {
			value: { addEventListener: () => {}, removeEventListener: () => {} },
			configurable: true,
			writable: true,
		})

		configure({ onError: undefined, onValidationFail: undefined, logLevel: 'silent' })
	})

	it('reports StorageWriteError on write failure', () => {
		const onError = vi.fn()

		configure({ onError })

		// Create a storage that throws on setItem
		const failStorage = makeStorage()

		const originalSetItem = failStorage.setItem.bind(failStorage)

		failStorage.setItem = (k: string, v: string) => {
			if (k === 'write-fail') {
				throw new Error('disk full')
			}

			originalSetItem(k, v)
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: failStorage,
			configurable: true,
		})

		const s = state('write-fail', { default: 'hello', scope: 'local' })

		s.set('world')

		expect(onError).toHaveBeenCalledTimes(1)

		const ctx = onError.mock.calls[0]?.[0]

		expect(ctx.error instanceof StorageWriteError).toBe(true)
		expect(ctx.error.key).toBe('write-fail')
		expect(ctx.error.isQuotaError).toBe(false)
		expect(ctx.error.cause instanceof Error).toBe(true)

		s.destroy()
	})

	it('reports StorageWriteError with isQuotaError for quota exceeded', () => {
		const onError = vi.fn()

		const onQuotaExceeded = vi.fn()

		configure({ onError, onQuotaExceeded })

		const failStorage = makeStorage()

		failStorage.setItem = () => {
			const err = new DOMException('Quota exceeded', 'QuotaExceededError')

			throw err
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: failStorage,
			configurable: true,
		})

		const s = state('quota-fail', { default: 0, scope: 'local' })

		s.set(999)

		expect(onError).toHaveBeenCalledTimes(1)

		const ctx = onError.mock.calls[0]?.[0]

		expect(ctx.error instanceof StorageWriteError).toBe(true)
		expect(ctx.error.isQuotaError).toBe(true)

		expect(onQuotaExceeded).toHaveBeenCalledTimes(1)

		const quotaCtx = onQuotaExceeded.mock.calls[0]?.[0]

		expect(quotaCtx.error instanceof StorageWriteError).toBe(true)

		s.destroy()
	})

	it('reports StorageReadError for corrupted storage data', () => {
		const onError = vi.fn()

		configure({ onError })

		const storage = makeStorage()

		storage.setItem('corrupt-key', '{invalid json!!!')

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		// readAndMigrate will catch the JSON.parse error and report it
		const s = state('corrupt-key', { default: 'fallback', scope: 'local' })

		// Should fall back to default
		expect(s.get()).toBe('fallback')

		expect(onError).toHaveBeenCalledTimes(1)

		const ctx = onError.mock.calls[0]?.[0]

		expect(ctx.error instanceof StorageReadError).toBe(true)
		expect(ctx.error.key).toBe('corrupt-key')

		s.destroy()
	})

	it('reports ValidationError when validate rejects stored value', () => {
		const onError = vi.fn()

		const onValidationFail = vi.fn()

		configure({ onError, onValidationFail })

		const storage = makeStorage()

		storage.setItem('val-key', JSON.stringify('not-a-number'))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('val-key', {
			default: 42,
			scope: 'local',
			validate: (v): v is number => typeof v === 'number',
		})

		expect(s.get()).toBe(42)

		expect(onValidationFail).toHaveBeenCalledTimes(1)

		expect(onError).toHaveBeenCalledTimes(1)

		const ctx = onError.mock.calls[0]?.[0]

		expect(ctx.error instanceof ValidationError).toBe(true)
		expect(ctx.error.rejectedValue).toBe('not-a-number')

		s.destroy()
	})

	it('reports MigrationError when a migration function throws', () => {
		const onError = vi.fn()

		configure({ onError })

		const storage = makeStorage()

		storage.setItem('mig-key', JSON.stringify({ v: 1, data: { old: true } }))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('mig-key', {
			default: { updated: false },
			scope: 'local',
			version: 3,
			migrate: {
				1: () => {
					throw new Error('migration v1 broke')
				},
			},
		})

		// Should fall back — the outer catch wraps the partially-migrated result
		expect(s.get()).toBeDefined()

		expect(onError).toHaveBeenCalled()

		const migrationErr = onError.mock.calls.find((call) => call[0]?.error instanceof MigrationError)

		expect(migrationErr).toBeDefined()

		const err = migrationErr?.[0]?.error

		expect(err.fromVersion).toBe(1)
		expect(err.toVersion).toBe(3)

		s.destroy()
	})

	it('errors are distinguishable via instanceof', () => {
		const errors: Error[] = [
			new StorageReadError('k', 'local'),
			new StorageWriteError('k', 'local'),
			new MigrationError('k', 'local', 1, 2),
			new ValidationError('k', 'local', null),
			new SyncError('k', 'local'),
			new HydrationError('k', 'local'),
		]

		for (const err of errors) {
			expect(err instanceof GjendjeError).toBe(true)
			expect(err instanceof Error).toBe(true)
		}

		expect(errors.filter((e) => e instanceof StorageReadError)).toHaveLength(1)
		expect(errors.filter((e) => e instanceof StorageWriteError)).toHaveLength(1)
		expect(errors.filter((e) => e instanceof MigrationError)).toHaveLength(1)
		expect(errors.filter((e) => e instanceof ValidationError)).toHaveLength(1)
		expect(errors.filter((e) => e instanceof SyncError)).toHaveLength(1)
		expect(errors.filter((e) => e instanceof HydrationError)).toHaveLength(1)
	})
})
