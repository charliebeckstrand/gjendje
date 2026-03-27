import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batch } from '../src/batch.js'
import { configure, getConfig, resetConfig } from '../src/config.js'
import { effect } from '../src/effect.js'
import { destroyAll, getRegistry } from '../src/registry.js'
import { state } from '../src/shortcuts.js'
import { makeStorage, setupBrowserEnv } from './helpers.js'

// ---------------------------------------------------------------------------
// 1. Batch flush infinite loop protection
// ---------------------------------------------------------------------------

describe('batch flush infinite loop protection', () => {
	it('does not hang when two states trigger each other in a cycle', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const a = state('batch-loop-a', { default: 0 })
		const b = state('batch-loop-b', { default: 0 })

		a.subscribe(() => {
			if (b.get() < 200) b.set(b.get() + 1)
		})

		b.subscribe(() => {
			if (a.get() < 200) a.set(a.get() + 1)
		})

		batch(() => {
			a.set(1)
		})

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('maximum iterations'))

		errorSpy.mockRestore()

		a.destroy()
		b.destroy()
	})

	it('logs an error mentioning infinite loop and drops remaining notifications', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const x = state('batch-loop-x', { default: 0 })

		x.subscribe(() => {
			if (x.get() < 500) x.set(x.get() + 1)
		})

		batch(() => {
			x.set(1)
		})

		const loopMessage = errorSpy.mock.calls.find(
			(call) => typeof call[0] === 'string' && call[0].includes('infinite loop'),
		)

		expect(loopMessage).toBeDefined()

		errorSpy.mockRestore()

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// 2. Storage adapter validation with custom serializer
// ---------------------------------------------------------------------------

describe('storage adapter validation with custom serializer', () => {
	beforeEach(() => {
		setupBrowserEnv()
	})

	it('returns defaultValue when custom serializer value fails validation', () => {
		const storage = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		// Write an invalid value directly to storage
		storage.setItem('validated-ser', 'not-a-number')

		const s = state('validated-ser', {
			default: 42,
			scope: 'local',
			serialize: {
				parse: (raw: string) => Number(raw),
				stringify: (val: number) => String(val),
			},
			validate: (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v),
		})

		// NaN fails validation, so defaultValue should be returned
		expect(s.get()).toBe(42)

		s.destroy()
	})

	it('accepts valid values through custom serializer + validate', () => {
		const storage = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		storage.setItem('validated-ser-ok', '99')

		const s = state('validated-ser-ok', {
			default: 42,
			scope: 'local',
			serialize: {
				parse: (raw: string) => Number(raw),
				stringify: (val: number) => String(val),
			},
			validate: (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v),
		})

		expect(s.get()).toBe(99)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 3. Effect error routing to onError
// ---------------------------------------------------------------------------

describe('effect error routing to onError', () => {
	afterEach(() => {
		resetConfig()
	})

	it('calls onError when an effect callback throws', () => {
		const onError = vi.fn()

		configure({ onError })

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const s = state('effect-err', { default: 0 })

		const handle = effect([s], () => {
			throw new Error('effect boom')
		})

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.any(Error),
			}),
		)

		errorSpy.mockRestore()

		handle.stop()
		s.destroy()
	})

	it('calls onError when an effect cleanup throws', () => {
		const onError = vi.fn()

		configure({ onError })

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const s = state('effect-cleanup-err', { default: 0 })

		const handle = effect([s], () => {
			return () => {
				throw new Error('cleanup boom')
			}
		})

		// Trigger re-run so the cleanup is invoked
		s.set(1)

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.any(Error),
			}),
		)

		errorSpy.mockRestore()

		handle.stop()
		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 4. configure() clearing callbacks
// ---------------------------------------------------------------------------

describe('configure() clearing callbacks', () => {
	afterEach(() => {
		resetConfig()
	})

	it('clears a config key when explicitly set to undefined', () => {
		const fn = vi.fn()

		configure({ onError: fn })

		expect(getConfig().onError).toBe(fn)

		configure({ onError: undefined })

		expect(getConfig().onError).toBeUndefined()
	})

	it('resetConfig() restores config to empty defaults', () => {
		const fn = vi.fn()

		configure({ onError: fn, logLevel: 'silent', prefix: 'test' })

		expect(getConfig().onError).toBe(fn)
		expect(getConfig().logLevel).toBe('silent')
		expect(getConfig().prefix).toBe('test')

		resetConfig()

		expect(getConfig().onError).toBeUndefined()
		expect(getConfig().logLevel).toBeUndefined()
		expect(getConfig().prefix).toBeUndefined()
	})
})

// ---------------------------------------------------------------------------
// 5. URL adapter replaceState
// ---------------------------------------------------------------------------

describe('URL adapter replaceState', () => {
	beforeEach(() => {
		const location = { pathname: '/app', search: '', hash: '' }

		const pushState = vi.fn((_: unknown, __: string, url: string) => {
			const parsed = new URL(url, 'http://localhost')

			location.pathname = parsed.pathname
			location.search = parsed.search
			location.hash = parsed.hash
		})

		const replaceState = vi.fn((_: unknown, __: string, url: string) => {
			const parsed = new URL(url, 'http://localhost')

			location.pathname = parsed.pathname
			location.search = parsed.search
			location.hash = parsed.hash
		})

		Object.defineProperty(globalThis, 'window', {
			value: {
				location,
				history: { pushState, replaceState },
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})
	})

	it('uses replaceState when urlReplace is true', () => {
		const s = state('url-replace', {
			default: 'hello',
			scope: 'url',
			urlReplace: true,
		})

		s.set('world')

		expect(window.history.replaceState).toHaveBeenCalled()
		expect(window.history.pushState).not.toHaveBeenCalled()

		s.destroy()
	})

	it('uses pushState when urlReplace is not set', () => {
		const s = state('url-push', {
			default: 'hello',
			scope: 'url',
		})

		s.set('world')

		expect(window.history.pushState).toHaveBeenCalled()
		expect(window.history.replaceState).not.toHaveBeenCalled()

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 6. destroyAll()
// ---------------------------------------------------------------------------

describe('destroyAll()', () => {
	it('destroys all registered instances and clears the registry', () => {
		const a = state('destroy-all-a', { default: 1 })
		const b = state('destroy-all-b', { default: 2 })
		const c = state('destroy-all-c', { default: 3 })

		expect(getRegistry().size).toBeGreaterThanOrEqual(3)

		destroyAll()

		expect(getRegistry().size).toBe(0)
		expect(a.isDestroyed).toBe(true)
		expect(b.isDestroyed).toBe(true)
		expect(c.isDestroyed).toBe(true)
	})

	it('is safe to call on an empty registry', () => {
		destroyAll()

		expect(getRegistry().size).toBe(0)

		// Should not throw
		destroyAll()

		expect(getRegistry().size).toBe(0)
	})
})
