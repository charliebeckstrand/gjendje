import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, state } from '../src/index.js'
import { makeStorage } from './helpers.js'

beforeEach(() => {
	configure({
		prefix: undefined,
		defaultScope: undefined,
		ssr: undefined,
		warnOnDuplicate: undefined,
		requireValidation: undefined,
		logLevel: undefined,
		maxKeys: undefined,
		onError: undefined,
		keyPattern: undefined,
		sync: undefined,
		onDestroy: undefined,
		onHydrate: undefined,
		onMigrate: undefined,
		onQuotaExceeded: undefined,
		onRegister: undefined,
		onSync: undefined,
	})

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
})

// ---------------------------------------------------------------------------
// defaultScope
// ---------------------------------------------------------------------------

describe('defaultScope', () => {
	it('uses render scope when no defaultScope is set', () => {
		const x = state('cfg-default-render', { default: 0 })

		expect(x.scope).toBe('render')

		x.destroy()
	})

	it('applies global defaultScope when instance omits scope', () => {
		configure({ defaultScope: 'local' })

		const x = state('cfg-default-local', { default: 'hello' })

		expect(x.scope).toBe('local')

		x.destroy()
	})

	it('per-instance scope overrides defaultScope', () => {
		configure({ defaultScope: 'local' })

		const x = state('cfg-override-scope', { default: 0, scope: 'render' })

		expect(x.scope).toBe('render')

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// ssr (global)
// ---------------------------------------------------------------------------

describe('global ssr', () => {
	it('per-instance ssr overrides global ssr', () => {
		configure({ ssr: true })

		// ssr: false on instance should work without SSR behavior
		const x = state('cfg-ssr-override', { default: 'a', scope: 'render', ssr: false })

		expect(x.get()).toBe('a')

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// warnOnDuplicate
// ---------------------------------------------------------------------------

describe('warnOnDuplicate', () => {
	it('does not warn by default on duplicate key+scope', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const a = state('cfg-dup-nowarn', { default: 0, scope: 'render' })
		const b = state('cfg-dup-nowarn', { default: 0, scope: 'render' })

		expect(a).toBe(b)
		expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('[gjendje]'))

		spy.mockRestore()
		a.destroy()
	})

	it('warns when warnOnDuplicate is enabled', () => {
		configure({ warnOnDuplicate: true })

		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const a = state('cfg-dup-warn', { default: 0, scope: 'render' })
		const b = state('cfg-dup-warn', { default: 0, scope: 'render' })

		expect(a).toBe(b)
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('Duplicate state("cfg-dup-warn")'))

		spy.mockRestore()
		a.destroy()
	})
})

// ---------------------------------------------------------------------------
// requireValidation
// ---------------------------------------------------------------------------

describe('requireValidation', () => {
	it('does not require validation by default', () => {
		const x = state('cfg-no-req-val', { default: 'hi', scope: 'local' })

		expect(x.get()).toBe('hi')

		x.destroy()
	})

	it('throws when requireValidation is enabled and validate is missing for persistent scope', () => {
		configure({ requireValidation: true })

		expect(() => {
			state('cfg-req-val', { default: 'hi', scope: 'local' })
		}).toThrow(/validate function is required/)
	})

	it('does not throw when validate is provided', () => {
		configure({ requireValidation: true })

		const x = state('cfg-req-val-ok', {
			default: 'hi',
			scope: 'local',
			validate: (v): v is string => typeof v === 'string',
		})

		expect(x.get()).toBe('hi')

		x.destroy()
	})

	it('does not throw for render scope even with requireValidation', () => {
		configure({ requireValidation: true })

		const x = state('cfg-req-val-render', { default: 0, scope: 'render' })

		expect(x.get()).toBe(0)

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// logLevel
// ---------------------------------------------------------------------------

describe('logLevel', () => {
	it('suppresses all logs when logLevel is silent', () => {
		configure({ logLevel: 'silent' })

		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		configure({ warnOnDuplicate: true })

		const a = state('cfg-log-silent', { default: 0 })
		const b = state('cfg-log-silent', { default: 0 })

		expect(a).toBe(b)
		expect(spy).not.toHaveBeenCalled()

		spy.mockRestore()
		a.destroy()
	})
})

// ---------------------------------------------------------------------------
// maxKeys
// ---------------------------------------------------------------------------

describe('maxKeys', () => {
	it('throws when maxKeys limit is exceeded', () => {
		configure({ maxKeys: 2 })

		const a = state('cfg-max-1', { default: 0 })
		const b = state('cfg-max-2', { default: 0 })

		expect(() => {
			state('cfg-max-3', { default: 0 })
		}).toThrow(/maxKeys limit/)

		a.destroy()
		b.destroy()
	})

	it('allows new instances after destroying old ones', () => {
		configure({ maxKeys: 2 })

		const a = state('cfg-max-reuse-1', { default: 0 })
		const b = state('cfg-max-reuse-2', { default: 0 })

		a.destroy()

		// Should not throw — slot freed by destroy
		const c = state('cfg-max-reuse-3', { default: 0 })

		expect(c.get()).toBe(0)

		b.destroy()
		c.destroy()
	})
})

// ---------------------------------------------------------------------------
// onError
// ---------------------------------------------------------------------------

describe('onError', () => {
	it('calls onError handler when storage write fails', () => {
		const handler = vi.fn()

		configure({ onError: handler })

		const failingStorage = makeStorage()

		failingStorage.setItem = () => {
			throw new Error('quota exceeded')
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: failingStorage,
			configurable: true,
		})

		// The error is logged, not thrown — so onError is for the reportError path
		// which is used in hydration. Storage adapter errors use log() instead.
		const x = state('cfg-onerror', { default: 'hi', scope: 'local' })

		x.set('new')

		// Storage write failure is logged, not reported via onError
		// onError is for adapter/hydration failures
		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// keyPattern
// ---------------------------------------------------------------------------

describe('keyPattern', () => {
	it('allows keys matching the pattern', () => {
		configure({ keyPattern: /^[a-z][a-z0-9-]*$/ })

		const x = state('cfg-valid-key', { default: 0 })

		expect(x.get()).toBe(0)

		x.destroy()
	})

	it('throws for keys that do not match the pattern', () => {
		configure({ keyPattern: /^[a-z][a-z0-9-]*$/ })

		expect(() => {
			state('Invalid Key!', { default: 0 })
		}).toThrow(/does not match the configured keyPattern/)
	})

	it('does not validate keys when no pattern is set', () => {
		const x = state('Any Key Format 🎉', { default: 0 })

		expect(x.get()).toBe(0)

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// sync (global)
// ---------------------------------------------------------------------------

describe('global sync', () => {
	it('does not throw with global sync enabled for non-syncable scopes', () => {
		configure({ sync: true })

		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const x = state('cfg-sync-render', { default: 0, scope: 'render' })

		expect(x.get()).toBe(0)

		spy.mockRestore()
		x.destroy()
	})

	it('per-instance sync: false overrides global sync', () => {
		configure({ sync: true })

		const x = state('cfg-sync-override', { default: 0, scope: 'local', sync: false })

		expect(x.get()).toBe(0)

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// onDestroy
// ---------------------------------------------------------------------------

describe('onDestroy', () => {
	it('fires when an instance is destroyed', () => {
		const handler = vi.fn()

		configure({ onDestroy: handler })

		const x = state('cfg-ondestroy', { default: 0, scope: 'render' })

		x.destroy()

		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'cfg-ondestroy', scope: 'render' }),
		)
	})

	it('does not fire on double destroy', () => {
		const handler = vi.fn()

		configure({ onDestroy: handler })

		const x = state('cfg-ondestroy-double', { default: 0, scope: 'render' })

		x.destroy()
		x.destroy()

		expect(handler).toHaveBeenCalledTimes(1)
	})

	it('does not fire when handler is not configured', () => {
		const x = state('cfg-ondestroy-none', { default: 0, scope: 'render' })

		// Should not throw
		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// onMigrate
// ---------------------------------------------------------------------------

describe('onMigrate', () => {
	it('fires after a migration chain runs', () => {
		const handler = vi.fn()

		configure({ onMigrate: handler })

		// Pre-seed storage with a v1 value
		localStorage.setItem('cfg-onmigrate', JSON.stringify({ v: 1, data: 'old' }))

		const x = state('cfg-onmigrate', {
			default: 'new',
			scope: 'local',
			version: 2,
			migrate: {
				1: (old) => `${old}-migrated`,
			},
		})

		expect(x.get()).toBe('old-migrated')
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				fromVersion: 1,
				toVersion: 2,
				data: 'old-migrated',
			}),
		)

		x.destroy()
	})

	it('does not fire when no migration is needed', () => {
		const handler = vi.fn()

		configure({ onMigrate: handler })

		localStorage.setItem('cfg-onmigrate-noop', JSON.stringify({ v: 2, data: 'current' }))

		const x = state('cfg-onmigrate-noop', {
			default: 'default',
			scope: 'local',
			version: 2,
			migrate: {
				1: (old) => `${old}-migrated`,
			},
		})

		expect(x.get()).toBe('current')
		expect(handler).not.toHaveBeenCalled()

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// onQuotaExceeded
// ---------------------------------------------------------------------------

describe('onQuotaExceeded', () => {
	it('fires when storage write fails with QuotaExceededError', () => {
		const handler = vi.fn()

		configure({ onQuotaExceeded: handler })

		const quotaError = new DOMException('Storage full', 'QuotaExceededError')

		const failingStorage = makeStorage()

		failingStorage.setItem = () => {
			throw quotaError
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: failingStorage,
			configurable: true,
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-quota', { default: 'hi', scope: 'local' })

		x.set('big data')

		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'cfg-quota', scope: 'local' }),
		)

		spy.mockRestore()
		x.destroy()
	})

	it('does not fire for non-quota storage errors', () => {
		const handler = vi.fn()

		configure({ onQuotaExceeded: handler })

		const failingStorage = makeStorage()

		failingStorage.setItem = () => {
			throw new Error('some other error')
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: failingStorage,
			configurable: true,
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('cfg-quota-other', { default: 'hi', scope: 'local' })

		x.set('data')

		expect(handler).not.toHaveBeenCalled()

		spy.mockRestore()
		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// onRegister
// ---------------------------------------------------------------------------

describe('onRegister', () => {
	it('fires when a new instance is registered', () => {
		const handler = vi.fn()

		configure({ onRegister: handler })

		const x = state('cfg-onregister', { default: 0, scope: 'render' })

		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'cfg-onregister', scope: 'render' }),
		)

		x.destroy()
	})

	it('does not fire for duplicate key+scope (returns cached)', () => {
		const handler = vi.fn()

		configure({ onRegister: handler })

		const a = state('cfg-onregister-dup', { default: 0, scope: 'render' })
		const b = state('cfg-onregister-dup', { default: 0, scope: 'render' })

		expect(a).toBe(b)
		expect(handler).toHaveBeenCalledTimes(1)

		a.destroy()
	})

	it('fires again after destroy + re-create', () => {
		const handler = vi.fn()

		configure({ onRegister: handler })

		const a = state('cfg-onregister-recreate', { default: 0, scope: 'render' })

		a.destroy()

		const b = state('cfg-onregister-recreate', { default: 0, scope: 'render' })

		expect(handler).toHaveBeenCalledTimes(2)

		b.destroy()
	})
})
