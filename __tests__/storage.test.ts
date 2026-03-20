import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'

function makeStorage(): Storage {
	const store = new Map<string, string>()

	return {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => {
			store.set(k, v)
		},
		removeItem: (k) => {
			store.delete(k)
		},
		clear: () => {
			store.clear()
		},
		get length() {
			return store.size
		},
		key: (i) => [...store.keys()][i] ?? null,
	}
}

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
// tab scope
// ---------------------------------------------------------------------------

describe('tab scope', () => {
	it('persists value to sessionStorage', () => {
		const modal = state('stor-tab-persist', { default: false, scope: 'tab' })

		modal.set(true)

		expect(sessionStorage.getItem('stor-tab-persist')).toBe('true')

		modal.destroy()
	})

	it('reads existing value from sessionStorage on init', () => {
		sessionStorage.setItem('stor-tab-read', '3')

		const step = state('stor-tab-read', { default: 1, scope: 'tab' })

		expect(step.get()).toBe(3)

		step.destroy()
	})

	it('notifies subscribers on set', () => {
		const step = state('stor-tab-notify', { default: 1, scope: 'tab' })
		const listener = vi.fn()

		step.subscribe(listener)
		step.set(2)

		expect(listener).toHaveBeenCalledWith(2)
		expect(listener).toHaveBeenCalledTimes(1)

		step.destroy()
	})
})
