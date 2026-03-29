import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, state } from '../src/index.js'
import { makeStorage } from './helpers.js'

// ---------------------------------------------------------------------------
// Setup — mock browser env with interceptable storage events
// ---------------------------------------------------------------------------

const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>()

let fallbackStorage: Storage

beforeEach(() => {
	eventListeners.clear()

	fallbackStorage = makeStorage()

	Object.defineProperty(globalThis, 'localStorage', {
		value: fallbackStorage,
		configurable: true,
	})

	Object.defineProperty(globalThis, 'sessionStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: {
			addEventListener(event: string, handler: (...args: unknown[]) => void) {
				if (!eventListeners.has(event)) {
					eventListeners.set(event, new Set())
				}
				eventListeners.get(event)?.add(handler)
			},
			removeEventListener(event: string, handler: (...args: unknown[]) => void) {
				eventListeners.get(event)?.delete(handler)
			},
		},
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

	// No Storage Buckets API — forces fallback path
	Object.defineProperty(globalThis, 'navigator', {
		value: {},
		configurable: true,
		writable: true,
	})

	configure({
		onError: undefined,
		logLevel: undefined,
	})
})

function fireStorageEvent(opts: { storageArea: Storage; key: string | null }) {
	const handlers = eventListeners.get('storage')

	for (const handler of handlers ?? []) {
		handler(opts)
	}
}

// ---------------------------------------------------------------------------
// Finding: Bucket fallback delegate forwards cross-tab storage events
// ---------------------------------------------------------------------------

describe('Bucket adapter: fallback delegate forwards storage events', () => {
	it('notifies subscriber when another tab changes the same key (fallback path)', () => {
		const s = state('bkt-fwd-key', {
			default: 0,
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		const listener = vi.fn()

		s.subscribe(listener)

		// Simulate another tab writing to localStorage for this key
		fallbackStorage.setItem('bkt-fwd-key', '42')

		fireStorageEvent({ storageArea: fallbackStorage, key: 'bkt-fwd-key' })

		expect(listener).toHaveBeenCalled()
		expect(s.get()).toBe(42)

		s.destroy()
	})

	it('notifies subscriber when another tab clears storage (fallback path)', () => {
		const s = state('bkt-fwd-clear', {
			default: 'default',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		s.set('custom')

		const listener = vi.fn()

		s.subscribe(listener)

		// Simulate another tab calling localStorage.clear()
		fallbackStorage.clear()

		fireStorageEvent({ storageArea: fallbackStorage, key: null })

		expect(listener).toHaveBeenCalled()
		expect(s.get()).toBe('default')

		s.destroy()
	})

	it('cleans up delegate subscription on destroy', () => {
		const s = state('bkt-fwd-cleanup', {
			default: 0,
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		const listener = vi.fn()

		s.subscribe(listener)

		s.destroy()

		// After destroy, storage events should not trigger the listener
		fallbackStorage.setItem('bkt-fwd-cleanup', '99')

		fireStorageEvent({ storageArea: fallbackStorage, key: 'bkt-fwd-cleanup' })

		expect(listener).not.toHaveBeenCalled()
	})
})
