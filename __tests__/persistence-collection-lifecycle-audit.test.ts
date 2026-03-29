import { afterEach, describe, expect, it, vi } from 'vitest'
import { collection } from '../src/collection.js'
import { configure, resetConfig, state } from '../src/index.js'
import { previous } from '../src/previous.js'
import { destroyAll, getRegistry } from '../src/registry.js'
import { makeStorage } from './helpers.js'

// ---------------------------------------------------------------------------
// Helpers — mock browser env with interceptable storage events
// ---------------------------------------------------------------------------

function setupStorageEnv() {
	const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>()
	const storage = makeStorage()

	Object.defineProperty(globalThis, 'localStorage', {
		value: storage,
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
			location: { search: '', pathname: '/', hash: '' },
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

	function fireStorageEvent(opts: { storageArea: Storage; key: string | null }) {
		const handlers = eventListeners.get('storage')

		for (const handler of handlers ?? []) {
			handler(opts)
		}
	}

	return { storage, fireStorageEvent }
}

// ---------------------------------------------------------------------------
// Finding #1 — Storage adapter: localStorage.clear() from another tab
// ---------------------------------------------------------------------------

describe('Finding #1: storage clear event notifies subscribers', () => {
	afterEach(() => {
		resetConfig()
	})

	it('notifies subscriber when event.key is null (storage cleared)', () => {
		const { storage, fireStorageEvent } = setupStorageEnv()

		const s = state('clear-notify', { default: 'hello', scope: 'local' })

		s.set('world')

		const listener = vi.fn()

		s.subscribe(listener)

		// Simulate another tab calling localStorage.clear()
		storage.clear()

		fireStorageEvent({ storageArea: storage, key: null })

		// Subscriber should be notified — value falls back to default
		expect(listener).toHaveBeenCalled()
		expect(s.get()).toBe('hello')

		s.destroy()
	})

	it('still ignores events from a different storageArea', () => {
		const { fireStorageEvent } = setupStorageEnv()

		const otherStorage = makeStorage()

		const s = state('clear-ignore', { default: 0, scope: 'local' })

		s.set(42)

		const listener = vi.fn()

		s.subscribe(listener)

		// Fire clear event from a different storage area
		fireStorageEvent({ storageArea: otherStorage, key: null })

		expect(listener).not.toHaveBeenCalled()
		expect(s.get()).toBe(42)

		s.destroy()
	})

	it('invalidates cache after storage clear', () => {
		const { storage, fireStorageEvent } = setupStorageEnv()

		const s = state('clear-cache', { default: 'default', scope: 'local' })

		s.set('cached-value')

		// Verify the value is set
		expect(s.get()).toBe('cached-value')

		// Simulate clear from another tab
		storage.clear()

		fireStorageEvent({ storageArea: storage, key: null })

		// Cache should be invalidated — get() should return default
		expect(s.get()).toBe('default')

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #2 — Collection watcher snapshot safety
// ---------------------------------------------------------------------------

describe('Finding #2: collection watcher notification snapshot safety', () => {
	it('unsubscribing during notification does not skip other listeners (length change)', () => {
		const col = collection('col-snap-unsub', {
			default: [{ id: 1, name: 'a' }],
		})

		const thirdWatcher = vi.fn()

		let unsub2: (() => void) | undefined

		const firstWatcher = vi.fn()

		const secondWatcher = vi.fn(() => {
			unsub2?.()
		})

		col.watch('name', firstWatcher)
		unsub2 = col.watch('name', secondWatcher)
		col.watch('name', thirdWatcher)

		// Length change triggers the "notify all" path
		col.add({ id: 2, name: 'b' })

		// All three should have been called (snapshot taken before iteration)
		expect(firstWatcher).toHaveBeenCalled()
		expect(secondWatcher).toHaveBeenCalled()
		expect(thirdWatcher).toHaveBeenCalled()

		col.destroy()
	})

	it('watcher added during notification does not fire in same cycle (length change)', () => {
		const col = collection('col-snap-add', {
			default: [{ id: 1, name: 'a' }],
		})

		const secondWatcher = vi.fn()

		const firstWatcher = vi.fn(() => {
			col.watch('name', secondWatcher)
		})

		col.watch('name', firstWatcher)

		col.add({ id: 2, name: 'b' })

		expect(firstWatcher).toHaveBeenCalled()
		expect(secondWatcher).not.toHaveBeenCalled()

		col.destroy()
	})

	it('unsubscribing during notification does not skip others (key change path)', () => {
		const col = collection('col-snap-key-unsub', {
			default: [{ id: 1, done: false }],
		})

		const thirdWatcher = vi.fn()

		let unsub2: (() => void) | undefined

		const firstWatcher = vi.fn()

		const secondWatcher = vi.fn(() => {
			unsub2?.()
		})

		col.watch('done', firstWatcher)
		unsub2 = col.watch('done', secondWatcher)
		col.watch('done', thirdWatcher)

		// Key change (not length change) triggers the changedKeys path
		col.update(() => true, { id: 1, done: true })

		expect(firstWatcher).toHaveBeenCalled()
		expect(secondWatcher).toHaveBeenCalled()
		expect(thirdWatcher).toHaveBeenCalled()

		col.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #3 — previous() destroy try/finally
// ---------------------------------------------------------------------------

describe('Finding #3: previous() destroy cleanup with try/finally', () => {
	it('resolves destroyed promise even if source unsubscribe throws', async () => {
		const source = state('prev-destroy-throw', { default: 0 })

		const prev = previous(source)

		// Monkey-patch the source subscribe to return a throwing unsubscribe
		const originalSubscribe = source.subscribe.bind(source)

		source.subscribe = (listener: (value: number) => void) => {
			const unsub = originalSubscribe(listener)

			return () => {
				unsub()
				throw new Error('unsubscribe boom')
			}
		}

		// Re-create previous so it uses the patched subscribe
		const prev2 = previous(source)

		source.set(1)

		// Destroy should complete cleanup despite the throw
		expect(() => prev2.destroy()).toThrow('unsubscribe boom')

		// The destroyed promise should still resolve
		await expect(prev2.destroyed).resolves.toBeUndefined()

		prev.destroy()
		source.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #4 — destroyAll() clears before destroying
// ---------------------------------------------------------------------------

describe('Finding #4: destroyAll() clears registry before destroying', () => {
	afterEach(() => {
		resetConfig()
	})

	it('instances created during destroy notifications remain registered', () => {
		// Use onDestroy config callback to create a new instance during the destroy loop
		configure({
			onDestroy: ({ key }) => {
				if (key === 'destroy-all-a') {
					state('destroy-all-b', { default: 99 })
				}
			},
		})

		state('destroy-all-a', { default: 0 })

		destroyAll()

		// 'b' was created during the destroy loop — it should still be in the registry
		const registry = getRegistry()
		let found = false

		for (const instance of registry.values()) {
			if (instance.key === 'destroy-all-b') {
				found = true
				instance.destroy()
			}
		}

		expect(found).toBe(true)
	})
})
