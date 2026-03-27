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
