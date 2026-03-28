import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, resetConfig, state } from '../../src/index.js'
import { makeStorage } from '../helpers.js'

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

afterEach(() => {
	resetConfig()
})

describe('onHydrate callback', () => {
	it('fires on client with empty storage', async () => {
		const onHydrate = vi.fn()

		configure({ onHydrate })

		const theme = state('hydrate-empty', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		await theme.hydrated

		expect(onHydrate).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'hydrate-empty',
				scope: 'local',
				serverValue: 'light',
				clientValue: 'light',
			}),
		)

		theme.destroy()
	})

	it('does not fire when stored value differs from default', async () => {
		localStorage.setItem('hydrate-nofire', '"dark"')

		const onHydrate = vi.fn()

		configure({ onHydrate })

		const theme = state('hydrate-nofire', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		await theme.hydrated

		expect(onHydrate).not.toHaveBeenCalled()
		expect(theme.get()).toBe('dark')

		theme.destroy()
	})

	it('does not fire when user calls set() before hydration', async () => {
		const onHydrate = vi.fn()

		configure({ onHydrate })

		const theme = state('hydrate-preempt', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		theme.set('blue')

		await theme.hydrated

		expect(onHydrate).not.toHaveBeenCalled()
		expect(theme.get()).toBe('blue')

		theme.destroy()
	})

	it('does not fire when instance is destroyed before hydration', async () => {
		const onHydrate = vi.fn()

		configure({ onHydrate })

		const theme = state('hydrate-destroyed', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		theme.destroy()

		await new Promise((r) => setTimeout(r, 50))

		expect(onHydrate).not.toHaveBeenCalled()
	})

	it('fires for session scope with empty storage', async () => {
		const onHydrate = vi.fn()

		configure({ onHydrate })

		const count = state('hydrate-session', {
			default: '0',
			scope: 'session',
			ssr: true,
		})

		await count.hydrated

		expect(onHydrate).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'hydrate-session',
				scope: 'session',
				serverValue: '0',
			}),
		)

		count.destroy()
	})
})
