import { beforeEach, describe, expect, it } from 'vitest'
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
// persist option — selective persistence
// ---------------------------------------------------------------------------

describe('persist option', () => {
	it('only writes specified keys to storage', () => {
		const settings = state('sp-write', {
			default: { theme: 'light', locale: 'en', isMenuOpen: false },
			scope: 'local' as const,
			persist: ['theme', 'locale'],
		})

		settings.set({ theme: 'dark', locale: 'fr', isMenuOpen: true })

		const raw = localStorage.getItem('sp-write')
		const stored = JSON.parse(raw as string)

		expect(stored).toEqual({ theme: 'dark', locale: 'fr' })
		expect('isMenuOpen' in stored).toBe(false)

		settings.destroy()
	})

	it('merges persisted keys with defaults on read', () => {
		localStorage.setItem('sp-read', JSON.stringify({ theme: 'dark', locale: 'fr' }))

		const settings = state('sp-read', {
			default: { theme: 'light', locale: 'en', isMenuOpen: false },
			scope: 'local' as const,
			persist: ['theme', 'locale'],
		})

		expect(settings.get()).toEqual({
			theme: 'dark',
			locale: 'fr',
			isMenuOpen: false,
		})

		settings.destroy()
	})

	it('returns full default when nothing is in storage', () => {
		const settings = state('sp-default', {
			default: { theme: 'light', locale: 'en', isMenuOpen: false },
			scope: 'local' as const,
			persist: ['theme', 'locale'],
		})

		expect(settings.get()).toEqual({
			theme: 'light',
			locale: 'en',
			isMenuOpen: false,
		})

		settings.destroy()
	})

	it('in-memory value retains non-persisted keys', () => {
		const settings = state('sp-memory', {
			default: { theme: 'light', locale: 'en', isMenuOpen: false },
			scope: 'local' as const,
			persist: ['theme', 'locale'],
		})

		settings.set({ theme: 'dark', locale: 'fr', isMenuOpen: true })

		// After set + re-read from storage, non-persisted keys come from defaults
		const fresh = state('sp-memory', {
			default: { theme: 'light', locale: 'en', isMenuOpen: false },
			scope: 'local' as const,
			persist: ['theme', 'locale'],
		})

		// Same instance via registry
		expect(fresh).toBe(settings)

		settings.destroy()

		// Create fresh instance after destroy to test storage round-trip
		const reloaded = state('sp-memory', {
			default: { theme: 'light', locale: 'en', isMenuOpen: false },
			scope: 'local' as const,
			persist: ['theme', 'locale'],
		})

		expect(reloaded.get()).toEqual({
			theme: 'dark',
			locale: 'fr',
			isMenuOpen: false, // default restored for non-persisted key
		})

		reloaded.destroy()
	})

	it('works with tab scope (sessionStorage)', () => {
		const settings = state('sp-tab', {
			default: { a: 1, b: 2, c: 3 },
			scope: 'tab' as const,
			persist: ['a', 'b'],
		})

		settings.set({ a: 10, b: 20, c: 30 })

		const raw = sessionStorage.getItem('sp-tab')
		const stored = JSON.parse(raw as string)

		expect(stored).toEqual({ a: 10, b: 20 })
		expect('c' in stored).toBe(false)

		settings.destroy()
	})

	it('works with sync: true on local scope', () => {
		const settings = state('sp-sync', {
			default: { x: 0, y: 0, temp: '' },
			scope: 'local' as const,
			sync: true,
			persist: ['x', 'y'],
		})

		settings.set({ x: 5, y: 10, temp: 'hello' })

		const raw = localStorage.getItem('sp-sync')
		const stored = JSON.parse(raw as string)

		expect(stored).toEqual({ x: 5, y: 10 })
		expect('temp' in stored).toBe(false)

		settings.destroy()
	})

	it('works with versioned storage', () => {
		const settings = state('sp-versioned', {
			default: { theme: 'light', debug: false },
			scope: 'local' as const,
			persist: ['theme'],
			version: 2,
		})

		settings.set({ theme: 'dark', debug: true })

		const raw = localStorage.getItem('sp-versioned')
		const stored = JSON.parse(raw as string)

		expect(stored).toEqual({ v: 2, data: { theme: 'dark' } })

		settings.destroy()
	})

	it('works with custom serializer', () => {
		const serializer = {
			stringify: (v: { name: string; temp: number }) => JSON.stringify(v),
			parse: (raw: string) => JSON.parse(raw) as { name: string; temp: number },
		}

		const settings = state('sp-custom-ser', {
			default: { name: 'default', temp: 0 },
			scope: 'local' as const,
			persist: ['name'],
			serialize: serializer,
		})

		settings.set({ name: 'custom', temp: 42 })

		const raw = localStorage.getItem('sp-custom-ser')
		const stored = JSON.parse(raw as string)

		expect(stored).toEqual({ name: 'custom' })

		settings.destroy()
	})

	it('reset restores defaults and only writes persisted keys', () => {
		const settings = state('sp-reset', {
			default: { theme: 'light', locale: 'en', scratch: '' },
			scope: 'local' as const,
			persist: ['theme', 'locale'],
		})

		settings.set({ theme: 'dark', locale: 'fr', scratch: 'notes' })
		settings.reset()

		const raw = localStorage.getItem('sp-reset')
		const stored = JSON.parse(raw as string)

		expect(stored).toEqual({ theme: 'light', locale: 'en' })

		settings.destroy()
	})
})
