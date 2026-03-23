import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'
import '../src/server.js'
import { makeStorage } from './helpers.js'

function simulateServer() {
	const saved = {
		window: globalThis.window,
		document: (globalThis as unknown as Record<string, unknown>).document,
		localStorage: (globalThis as unknown as Record<string, unknown>).localStorage,
		sessionStorage: (globalThis as unknown as Record<string, unknown>).sessionStorage,
	}

	Object.defineProperty(globalThis, 'window', {
		value: undefined,
		configurable: true,
		writable: true,
	})
	Object.defineProperty(globalThis, 'document', {
		value: undefined,
		configurable: true,
		writable: true,
	})
	Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true })
	Object.defineProperty(globalThis, 'sessionStorage', { value: undefined, configurable: true })

	return () => {
		Object.defineProperty(globalThis, 'window', {
			value: saved.window,
			configurable: true,
			writable: true,
		})
		Object.defineProperty(globalThis, 'document', {
			value: saved.document,
			configurable: true,
			writable: true,
		})
		Object.defineProperty(globalThis, 'localStorage', {
			value: saved.localStorage,
			configurable: true,
		})
		Object.defineProperty(globalThis, 'sessionStorage', {
			value: saved.sessionStorage,
			configurable: true,
		})
	}
}

beforeEach(() => {
	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'document', {
		value: {},
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'sessionStorage', {
		value: makeStorage(),
		configurable: true,
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

describe('ssr: true', () => {
	it('returns default on the server without throwing', () => {
		const restore = simulateServer()

		try {
			const theme = state('ssr-local', {
				default: 'light',
				scope: 'local',
				ssr: true,
			})

			expect(theme.get()).toBe('light')
			expect(theme.scope).toBe('local')

			theme.destroy()
		} finally {
			restore()
		}
	})

	it('does not throw for session scope on server', () => {
		const restore = simulateServer()

		try {
			const step = state('ssr-session', {
				default: 1,
				scope: 'session',
				ssr: true,
			})

			expect(step.get()).toBe(1)

			step.destroy()
		} finally {
			restore()
		}
	})

	it('does not throw for url scope on server', () => {
		const restore = simulateServer()

		try {
			const filters = state('ssr-url', {
				default: { status: 'all' },
				scope: 'url',
				ssr: true,
			})

			expect(filters.get()).toEqual({ status: 'all' })

			filters.destroy()
		} finally {
			restore()
		}
	})

	it('does not throw for sync: true local scope on server', () => {
		const restore = simulateServer()

		try {
			const count = state('ssr-sync-local', {
				default: 0,
				scope: 'local',
				sync: true,
				ssr: true,
			})

			expect(count.get()).toBe(0)

			count.destroy()
		} finally {
			restore()
		}
	})

	it('throws without ssr: true on server', () => {
		const restore = simulateServer()

		try {
			expect(() => {
				state('ssr-no-flag', {
					default: 'light',
					scope: 'local',
				})
			}).toThrow()
		} finally {
			restore()
		}
	})

	it('reads real storage on client with ssr: true', () => {
		localStorage.setItem('ssr-client', '"dark"')

		const theme = state('ssr-client', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		expect(theme.get()).toBe('dark')

		theme.destroy()
	})

	it('notifies subscribers after set on client', () => {
		const theme = state('ssr-client-notify', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		const listener = vi.fn()

		theme.subscribe(listener)
		theme.set('dark')

		expect(listener).toHaveBeenCalledWith('dark')
		expect(listener).toHaveBeenCalledTimes(1)

		theme.destroy()
	})

	it('server scope is always SSR-safe regardless of flag', () => {
		const user = state('ssr-server-scope', {
			default: null,
			scope: 'server',
			ssr: true,
		})

		expect(user.get()).toBeNull()

		user.destroy()
	})
})
