import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'

beforeEach(() => {
	const location = { pathname: '/app', search: '', hash: '' }

	Object.defineProperty(globalThis, 'window', {
		value: {
			location,
			history: {
				pushState(_: unknown, __: string, url: string) {
					const parsed = new URL(url, 'http://localhost')

					location.pathname = parsed.pathname
					location.search = parsed.search
					location.hash = parsed.hash
				},
			},
			addEventListener: () => {},
			removeEventListener: () => {},
		},
		configurable: true,
		writable: true,
	})
})

describe('url scope', () => {
	it('returns default when param is absent', () => {
		const filters = state('url-default', {
			default: { status: 'all' },
			scope: 'url',
		})

		expect(filters.get()).toEqual({ status: 'all' })

		filters.destroy()
	})

	it('writes value to the URL on set', () => {
		const page = state('url-write', { default: 1, scope: 'url' })

		page.set(3)

		expect(window.location.search).toContain('url-write=')

		page.destroy()
	})

	it('reads value back from URL after set', () => {
		const page = state('url-read', { default: 1, scope: 'url' })

		page.set(5)
		page.destroy()

		const page2 = state('url-read', { default: 1, scope: 'url' })

		expect(page2.get()).toBe(5)

		page2.destroy()
	})

	it('removes param from URL on reset', () => {
		const page = state('url-reset', { default: 1, scope: 'url' })

		page.set(5)
		page.reset()

		expect(window.location.search).not.toContain('url-reset=')

		page.destroy()
	})

	it('notifies subscribers on set', () => {
		const page = state('url-notify', { default: 1, scope: 'url' })

		const listener = vi.fn()

		page.subscribe(listener)
		page.set(2)

		expect(listener).toHaveBeenCalledWith(2)
		expect(listener).toHaveBeenCalledTimes(1)

		page.destroy()
	})

	it('exposes correct scope', () => {
		const x = state('url-scope', { default: '', scope: 'url' })

		expect(x.scope).toBe('url')

		x.destroy()
	})
})

describe('url scope edge cases', () => {
	it('returns default when URL contains malformed data', () => {
		window.location.search = '?url-malformed=not{valid{json'

		const s = state('url-malformed', { default: 'fallback', scope: 'url' })

		expect(s.get()).toBe('fallback')

		s.destroy()
	})

	it('preserves hash in URL during set', () => {
		window.location.hash = '#section'

		const s = state('url-hash', { default: 0, scope: 'url' })

		s.set(42)

		expect(window.location.hash).toBe('#section')

		s.destroy()
	})

	it('removes param from URL when set to default value', () => {
		const s = state('url-rm-default', { default: 1, scope: 'url' })

		s.set(5)
		expect(window.location.search).toContain('url-rm-default=')

		s.set(1)
		expect(window.location.search).not.toContain('url-rm-default=')

		s.destroy()
	})

	it('multiple url states coexist without interference', () => {
		const a = state('url-multi-a', { default: 0, scope: 'url' })
		const b = state('url-multi-b', { default: 0, scope: 'url' })

		a.set(10)
		b.set(20)

		expect(window.location.search).toContain('url-multi-a=')
		expect(window.location.search).toContain('url-multi-b=')
		expect(a.get()).toBe(10)
		expect(b.get()).toBe(20)

		a.destroy()
		b.destroy()
	})

	it('calls removeEventListener on destroy', () => {
		const spy = vi.fn()
		window.removeEventListener = spy

		const s = state('url-destroy-listener', { default: 0, scope: 'url' })

		s.destroy()

		expect(spy).toHaveBeenCalledWith('popstate', expect.any(Function))
	})

	it('write error invalidates cache and value stays unchanged', () => {
		const s = state('url-write-err', { default: 0, scope: 'url' })

		s.set(5)
		expect(s.get()).toBe(5)

		window.history.pushState = () => {
			throw new Error('pushState failed')
		}

		s.set(99)

		// StorageWriteError is caught by core.ts, so set() doesn't throw.
		// The URL was not updated (pushState threw), cache was invalidated,
		// so read() re-reads from the unchanged URL which still has 5.
		expect(s.get()).toBe(5)

		s.destroy()
	})

	it('popstate with absent param reverts to default', () => {
		let popstateHandler: (() => void) | undefined

		;(window as unknown as Record<string, unknown>).addEventListener = (
			_event: string,
			handler: () => void,
		) => {
			popstateHandler = handler
		}

		const s = state('url-popstate', { default: 'init', scope: 'url' })

		s.set('changed')
		expect(s.get()).toBe('changed')

		const listener = vi.fn()

		s.subscribe(listener)

		// Simulate browser back: URL no longer has the param
		window.location.search = ''
		popstateHandler?.()

		expect(s.get()).toBe('init')

		s.destroy()
	})

	it('cache returns same value on repeated reads without URL change', () => {
		const s = state('url-cache-hit', { default: 0, scope: 'url' })

		s.set(7)

		const v1 = s.get()
		const v2 = s.get()
		const v3 = s.get()

		expect(v1).toBe(7)
		expect(v2).toBe(7)
		expect(v3).toBe(7)

		s.destroy()
	})

	it('set then get returns the updated value immediately', () => {
		const s = state('url-set-get', { default: 0, scope: 'url' })

		s.set(42)

		expect(s.get()).toBe(42)

		s.destroy()
	})

	it('selective persistence with URL scope picks and merges keys', () => {
		const s = state('url-persist', {
			default: { a: 1, b: 2, c: 3 },
			scope: 'url',
			persist: ['a', 'b'],
		})

		s.set({ a: 10, b: 20, c: 30 })

		const result = s.get()

		expect(result.a).toBe(10)
		expect(result.b).toBe(20)
		expect(result.c).toBe(3)

		s.destroy()
	})

	it('write error invalidates cache so next read is fresh', () => {
		const s = state('url-cache-inv', { default: 0, scope: 'url' })

		s.set(5)
		expect(s.get()).toBe(5)

		window.history.pushState = () => {
			throw new Error('pushState boom')
		}

		// Attempt to set 10 — will fail silently (StorageWriteError caught by core)
		s.set(10)

		// URL still has 5 (pushState failed), cache was invalidated,
		// so get() re-reads from URL and returns 5
		expect(s.get()).toBe(5)

		s.destroy()
	})
})
