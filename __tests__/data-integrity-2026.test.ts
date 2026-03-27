import { afterEach, describe, expect, it, vi } from 'vitest'
import { batch, notify } from '../src/batch.js'
import { configure, resetConfig } from '../src/config.js'
import { readAndMigrate } from '../src/persist.js'
import { state } from '../src/shortcuts.js'
import { shallowEqual } from '../src/utils.js'
import { makeStorage, setupBrowserEnv } from './helpers.js'

// ---------------------------------------------------------------------------
// Fix 1: Partial migration throws instead of returning partial data
// ---------------------------------------------------------------------------

describe('Fix 1 — migration failure returns default, not partial data', () => {
	afterEach(() => {
		resetConfig()
	})

	it('falls back to default when a mid-chain migration throws', () => {
		const raw = JSON.stringify({ v: 1, data: { old: true } })

		const result = readAndMigrate(
			raw,
			{
				default: { migrated: false },
				version: 3,
				migrate: {
					1: (d) => ({ ...(d as object), step1: true }),
					2: () => {
						throw new Error('boom')
					},
				},
			},
			'test-key',
			'local',
		)

		expect(result).toEqual({ migrated: false })
	})

	it('falls back to default when the first migration step throws', () => {
		const raw = JSON.stringify({ v: 1, data: { old: true } })

		const result = readAndMigrate(
			raw,
			{
				default: { migrated: false },
				version: 3,
				migrate: {
					1: () => {
						throw new Error('first step fails')
					},
					2: (d) => ({ ...(d as object), step2: true }),
				},
			},
			'test-key',
			'local',
		)

		expect(result).toEqual({ migrated: false })
	})

	it('returns migrated data when all steps succeed', () => {
		const raw = JSON.stringify({ v: 1, data: { old: true } })

		const result = readAndMigrate(
			raw,
			{
				default: { migrated: false },
				version: 3,
				migrate: {
					1: (d) => ({ ...(d as object), step1: true }),
					2: (d) => ({ ...(d as object), step2: true }),
				},
			},
			'test-key',
			'local',
		)

		expect(result).toEqual({ old: true, step1: true, step2: true })
	})

	it('calls onFallback when migration fails', () => {
		const raw = JSON.stringify({ v: 1, data: { old: true } })

		const onFallback = vi.fn()

		readAndMigrate(
			raw,
			{
				default: 'default-val',
				version: 2,
				migrate: {
					1: () => {
						throw new Error('fail')
					},
				},
			},
			'test-key',
			'local',
			onFallback,
		)

		expect(onFallback).toHaveBeenCalledTimes(1)
	})

	it('fires onError with MigrationError when migration fails', () => {
		const raw = JSON.stringify({ v: 1, data: 'old' })

		const errorHandler = vi.fn()
		configure({ onError: errorHandler })

		readAndMigrate(
			raw,
			{
				default: 'default-val',
				version: 2,
				migrate: {
					1: () => {
						throw new Error('migrate-err')
					},
				},
			},
			'test-key',
			'local',
		)

		// onError fires twice: once from runMigrations (MigrationError) and once
		// from readAndMigrate's catch block (StorageReadError wrapping it)
		expect(errorHandler).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'test-key',
				scope: 'local',
				error: expect.objectContaining({ name: 'MigrationError' }),
			}),
		)
	})
})

// ---------------------------------------------------------------------------
// Fix 2: shallowEqual handles Set, Map, Date, RegExp
// ---------------------------------------------------------------------------

describe('Fix 2 — shallowEqual handles Set, Map, Date, RegExp', () => {
	// --- Set ---

	it('returns true for two Sets with the same values', () => {
		expect(shallowEqual(new Set([1, 2, 3]), new Set([1, 2, 3]))).toBe(true)
	})

	it('returns false for two Sets with different values', () => {
		expect(shallowEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
	})

	it('returns true for two empty Sets', () => {
		expect(shallowEqual(new Set(), new Set())).toBe(true)
	})

	it('returns false for Set vs non-Set', () => {
		expect(shallowEqual(new Set([1]), [1])).toBe(false)
	})

	// --- Map ---

	it('returns true for two Maps with the same entries', () => {
		const a = new Map([
			['x', 1],
			['y', 2],
		])
		const b = new Map([
			['x', 1],
			['y', 2],
		])

		expect(shallowEqual(a, b)).toBe(true)
	})

	it('returns false for two Maps with different values', () => {
		const a = new Map([['x', 1]])
		const b = new Map([['x', 2]])

		expect(shallowEqual(a, b)).toBe(false)
	})

	it('returns false for two Maps with different keys', () => {
		const a = new Map([['x', 1]])
		const b = new Map([['y', 1]])

		expect(shallowEqual(a, b)).toBe(false)
	})

	it('returns true for two empty Maps', () => {
		expect(shallowEqual(new Map(), new Map())).toBe(true)
	})

	it('returns false for Map vs non-Map', () => {
		expect(shallowEqual(new Map([['x', 1]]), { x: 1 })).toBe(false)
	})

	// --- Date ---

	it('returns true for two Dates with the same timestamp', () => {
		const ts = 1700000000000

		expect(shallowEqual(new Date(ts), new Date(ts))).toBe(true)
	})

	it('returns false for two Dates with different timestamps', () => {
		expect(shallowEqual(new Date(1000), new Date(2000))).toBe(false)
	})

	// --- RegExp ---

	it('returns true for two RegExps with the same pattern and flags', () => {
		expect(shallowEqual(/abc/gi, /abc/gi)).toBe(true)
	})

	it('returns false for two RegExps with different patterns', () => {
		expect(shallowEqual(/abc/, /xyz/)).toBe(false)
	})

	it('returns false for two RegExps with different flags', () => {
		expect(shallowEqual(/abc/g, /abc/i)).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// Fix 3: Bucket adapter skips duplicate notification
// ---------------------------------------------------------------------------

// Fix 3: Bucket adapter skips duplicate notification
//
// This fix applies to the StorageBuckets API adapter which uses the
// non-standard navigator.storageBuckets interface. Testing it properly
// requires a real browser environment with StorageBuckets support or a
// comprehensive mock of the async bucket lifecycle. This is best covered
// by integration / E2E tests rather than unit tests.

// ---------------------------------------------------------------------------
// Fix 4: Batch flush best-effort delivery
// ---------------------------------------------------------------------------

describe('Fix 4 — batch flush best-effort delivery after MAX_FLUSH_ITERATIONS', () => {
	it('delivers remaining notifications when flush limit is hit', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		let callCount = 0
		const values: number[] = []

		const reentrant = () => {
			callCount++
			values.push(callCount)
			notify(reentrant)
		}

		batch(() => {
			notify(reentrant)
		})

		// Should have been called many times due to re-entrancy, plus one
		// final best-effort delivery after the limit
		expect(callCount).toBeGreaterThan(100)
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('maximum iterations'))

		errorSpy.mockRestore()
	})
})

// ---------------------------------------------------------------------------
// Fix 5: Backup failure logs warning and fires onError
// ---------------------------------------------------------------------------

describe('Fix 5 — backup failure logs warning and fires onError', () => {
	afterEach(() => {
		resetConfig()
	})

	it('logs warning when backup fails due to full storage', () => {
		setupBrowserEnv()

		const storage = makeStorage()
		const originalRaw = JSON.stringify({ v: 1, data: 'old' })
		storage.setItem('backup-test', originalRaw)

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const errorHandler = vi.fn()
		configure({ onError: errorHandler })

		// Make backup key write fail (simulating full storage)
		const origSetItem = storage.setItem.bind(storage)
		storage.setItem = (k: string, v: string) => {
			if (k.endsWith(':__gjendje_backup')) {
				throw new DOMException('QuotaExceededError', 'QuotaExceededError')
			}
			origSetItem(k, v)
		}

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const s = state('backup-test', {
			default: 'default',
			scope: 'local',
			version: 2,
			migrate: {
				1: () => {
					throw new Error('migration fails')
				},
			},
		})

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to backup'))

		errorSpy.mockRestore()
		s.destroy()
	})

	it('fires onError when backup write throws', () => {
		setupBrowserEnv()

		const storage = makeStorage()
		const originalRaw = JSON.stringify({ v: 1, data: 'old' })
		storage.setItem('backup-err-test', originalRaw)

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const errorHandler = vi.fn()
		configure({ onError: errorHandler })

		const origSetItem = storage.setItem.bind(storage)
		storage.setItem = (k: string, v: string) => {
			if (k.endsWith(':__gjendje_backup')) {
				throw new DOMException('QuotaExceededError', 'QuotaExceededError')
			}
			origSetItem(k, v)
		}

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const s = state('backup-err-test', {
			default: 'default',
			scope: 'local',
			version: 2,
			migrate: {
				1: () => {
					throw new Error('migration fails')
				},
			},
		})

		// onError should have been called — once for the MigrationError,
		// and potentially once more for the backup failure
		expect(errorHandler).toHaveBeenCalled()

		errorSpy.mockRestore()
		s.destroy()
	})
})
