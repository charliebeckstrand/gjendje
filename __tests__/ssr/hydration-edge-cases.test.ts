import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, resetConfig, state } from '../../src/index.js'
import { afterHydration, isServer } from '../../src/ssr.js'
import { makeStorage } from '../helpers.js'

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'sessionStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'document', {
		value: {},
		configurable: true,
		writable: true,
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

	globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
		cb(0)
		return 0
	}
})

afterEach(() => {
	resetConfig()
})

describe('SSR hydration edge cases', () => {
	it('afterHydration returns resolved promise on server', async () => {
		const savedWindow = globalThis.window
		const savedDocument = (globalThis as unknown as Record<string, unknown>).document

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

		expect(isServer()).toBe(true)

		const callback = vi.fn()

		const result = afterHydration(callback)

		// On the server afterHydration returns the shared RESOLVED promise
		// which is already resolved — the callback should NOT be invoked
		expect(callback).not.toHaveBeenCalled()
		await expect(result).resolves.toBeUndefined()

		// Restore
		Object.defineProperty(globalThis, 'window', {
			value: savedWindow,
			configurable: true,
			writable: true,
		})
		Object.defineProperty(globalThis, 'document', {
			value: savedDocument,
			configurable: true,
			writable: true,
		})
	})

	it('hydration skips overwrite when user called set() before hydration', async () => {
		localStorage.setItem('edge-user-write', '"stored-value"')

		const s = state('edge-user-write', {
			default: 'default-val',
			scope: 'local',
			ssr: true,
		})

		// User writes before hydration completes — this sets hasUserWrite
		s.set(999 as unknown as string)

		await s.hydrated

		// The user-written value must win over the stored value
		expect(s.get()).toBe(999)

		s.destroy()
	})

	it('hydration skips overwrite when instance is destroyed before hydration', async () => {
		let rafCallback: FrameRequestCallback | undefined

		globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
			rafCallback = cb
			return 0
		}

		localStorage.setItem('edge-destroyed', '"stored-value"')

		const listener = vi.fn()

		const s = state('edge-destroyed', {
			default: 'default-val',
			scope: 'local',
			ssr: true,
		})

		s.subscribe(listener)

		// Destroy before hydration fires
		s.destroy()

		// Now fire the stored rAF callback — the hydration guard should
		// see isDestroyed and skip the set() call entirely
		rafCallback?.(0)

		// The listener should never have been called — hydration was skipped
		expect(listener).not.toHaveBeenCalled()
	})

	it('hydration does not set when stored value equals default', async () => {
		// Pre-populate localStorage with the SAME value as the default
		localStorage.setItem('edge-same-default', '"light"')

		const listener = vi.fn()

		const s = state('edge-same-default', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		s.subscribe(listener)

		await s.hydrated

		// The listener should NOT have been called because stored === default
		expect(listener).not.toHaveBeenCalled()
		expect(s.get()).toBe('light')

		s.destroy()
	})

	it('hydration reports HydrationError when adapter creation fails', async () => {
		const onError = vi.fn()

		configure({ onError })

		// Create state while localStorage is available
		const s = state('edge-adapter-fail', {
			default: 'fallback',
			scope: 'local',
			ssr: true,
		})

		// Remove localStorage AFTER creation so the hydration callback
		// fails when it tries to resolve a real adapter
		Object.defineProperty(globalThis, 'localStorage', {
			value: undefined,
			configurable: true,
		})

		await s.hydrated

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'edge-adapter-fail',
				scope: 'local',
				error: expect.objectContaining({ name: 'HydrationError' }),
			}),
		)

		s.destroy()
	})
})
