import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'
import { makeStorage } from './helpers.js'

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
})

// ---------------------------------------------------------------------------
// local scope
// ---------------------------------------------------------------------------

describe('local scope', () => {
	it('persists value to localStorage', () => {
		const theme = state('stor-local-persist', { default: 'light', scope: 'local' })

		theme.set('dark')

		expect(localStorage.getItem('stor-local-persist')).toBe('"dark"')

		theme.destroy()
	})

	it('reads existing value from localStorage on init', () => {
		localStorage.setItem('stor-local-read', '"dark"')

		const theme = state('stor-local-read', { default: 'light', scope: 'local' })

		expect(theme.get()).toBe('dark')

		theme.destroy()
	})

	it('falls back to default if storage value is corrupt', () => {
		localStorage.setItem('stor-local-corrupt', 'not-valid-json{{')

		const theme = state('stor-local-corrupt', { default: 'light', scope: 'local' })

		expect(theme.get()).toBe('light')

		theme.destroy()
	})

	it('notifies subscribers on set', () => {
		const theme = state('stor-local-notify', { default: 'light', scope: 'local' })

		const listener = vi.fn()

		theme.subscribe(listener)
		theme.set('dark')

		expect(listener).toHaveBeenCalledWith('dark')
		expect(listener).toHaveBeenCalledTimes(1)

		theme.destroy()
	})

	it('resets to default', () => {
		const count = state('stor-local-reset', { default: 0, scope: 'local' })

		count.set(99)
		count.reset()

		expect(count.get()).toBe(0)

		count.destroy()
	})

	it('supports custom serializer', () => {
		const serializer = {
			stringify: (s: Set<string>) => JSON.stringify([...s]),
			parse: (raw: string) => new Set<string>(JSON.parse(raw) as string[]),
		}

		const a = state('stor-local-serializer', {
			default: new Set<string>(),
			scope: 'local',
			serialize: serializer,
		})

		a.set(new Set(['a', 'b', 'c']))
		a.destroy()

		const b = state('stor-local-serializer', {
			default: new Set<string>(),
			scope: 'local',
			serialize: serializer,
		})

		expect([...b.get()]).toEqual(['a', 'b', 'c'])

		b.destroy()
	})
})

// ---------------------------------------------------------------------------
// storage write failures
// ---------------------------------------------------------------------------

describe('storage write failures', () => {
	it('silently handles quota exceeded on write', () => {
		const throwingStorage = makeStorage()
		const originalSetItem = throwingStorage.setItem

		throwingStorage.setItem = (k: string, v: string) => {
			// Allow initial reads but throw on subsequent writes
			if (k === 'stor-quota') {
				throw new DOMException('QuotaExceededError', 'QuotaExceededError')
			}

			originalSetItem.call(throwingStorage, k, v)
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: throwingStorage,
			configurable: true,
		})

		const x = state('stor-quota', { default: 'initial', scope: 'local' })

		// Should not throw — write failures are silent
		expect(() => x.set('new-value')).not.toThrow()

		// get() reads from storage, which still has the default since the write failed
		expect(x.get()).toBe('initial')

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// read cache
// ---------------------------------------------------------------------------

describe('read cache', () => {
	it('avoids re-parsing when storage has not changed', () => {
		const parseFn = vi.fn((raw: string) => JSON.parse(raw) as string)

		const theme = state('stor-cache-hit', {
			default: 'light',
			scope: 'local',
			serialize: { stringify: JSON.stringify, parse: parseFn },
		})

		theme.set('dark')

		// First get — must parse
		expect(theme.get()).toBe('dark')
		const callsAfterFirst = parseFn.mock.calls.length

		// Subsequent gets with no storage change — should use cache
		expect(theme.get()).toBe('dark')
		expect(theme.get()).toBe('dark')
		expect(theme.get()).toBe('dark')

		expect(parseFn.mock.calls.length).toBe(callsAfterFirst)

		theme.destroy()
	})

	it('returns correct value after set() without re-parsing (cache pre-populated)', () => {
		const parseFn = vi.fn((raw: string) => JSON.parse(raw) as string)

		const theme = state('stor-cache-invalidate', {
			default: 'light',
			scope: 'local',
			serialize: { stringify: JSON.stringify, parse: parseFn },
		})

		theme.set('dark')
		const val1 = theme.get()
		const callsAfterDark = parseFn.mock.calls.length

		theme.set('blue')
		const val2 = theme.get()

		expect(val1).toBe('dark')
		expect(val2).toBe('blue')
		// write() pre-populates the cache, so get() after set() should NOT re-parse
		expect(parseFn.mock.calls.length).toBe(callsAfterDark)

		theme.destroy()
	})

	it('returns default after failed write (quota exceeded)', () => {
		const throwingStorage = makeStorage()
		const originalSetItem = throwingStorage.setItem

		throwingStorage.setItem = (k: string, v: string) => {
			if (k === 'stor-cache-quota') {
				throw new DOMException('QuotaExceededError', 'QuotaExceededError')
			}

			originalSetItem.call(throwingStorage, k, v)
		}

		Object.defineProperty(globalThis, 'localStorage', {
			value: throwingStorage,
			configurable: true,
		})

		const x = state('stor-cache-quota', { default: 'initial', scope: 'local' })

		x.set('new-value')

		// Cache was invalidated by failed write — re-reads from storage, gets default
		expect(x.get()).toBe('initial')

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// session scope
// ---------------------------------------------------------------------------

describe('session scope', () => {
	it('persists value to sessionStorage', () => {
		const modal = state('stor-session-persist', { default: false, scope: 'session' })

		modal.set(true)

		expect(sessionStorage.getItem('stor-session-persist')).toBe('true')

		modal.destroy()
	})

	it('reads existing value from sessionStorage on init', () => {
		sessionStorage.setItem('stor-session-read', '3')

		const step = state('stor-session-read', { default: 1, scope: 'session' })

		expect(step.get()).toBe(3)

		step.destroy()
	})

	it('notifies subscribers on set', () => {
		const step = state('stor-session-notify', { default: 1, scope: 'session' })

		const listener = vi.fn()

		step.subscribe(listener)
		step.set(2)

		expect(listener).toHaveBeenCalledWith(2)
		expect(listener).toHaveBeenCalledTimes(1)

		step.destroy()
	})
})
