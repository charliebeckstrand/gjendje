// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notify } from '../src/batch.js'
import {
	batch,
	collection,
	computed,
	configure,
	effect,
	previous,
	shallowEqual,
	state,
	withWatch,
} from '../src/index.js'
import { setupFullBrowserEnv } from './helpers.js'

// ---------------------------------------------------------------------------
// Config reset helper
// ---------------------------------------------------------------------------

function resetConfig() {
	configure({
		prefix: undefined,
		scope: undefined,
		ssr: undefined,
		registry: undefined,
		warnOnDuplicate: undefined,
		requireValidation: undefined,
		logLevel: undefined,
		maxKeys: undefined,
		onError: undefined,
		keyPattern: undefined,
		sync: undefined,
		onChange: undefined,
		onDestroy: undefined,
		onExpire: undefined,
		onHydrate: undefined,
		onIntercept: undefined,
		onMigrate: undefined,
		onQuotaExceeded: undefined,
		onRegister: undefined,
		onReset: undefined,
		onSync: undefined,
		onValidationFail: undefined,
	})
}

beforeEach(() => {
	setupFullBrowserEnv()
	resetConfig()
})

// ---------------------------------------------------------------------------
// 1. src/batch.ts line 75 — notification throws during batch flush
// ---------------------------------------------------------------------------

describe('batch notification error handling', () => {
	it('logs error when a notification throws during flush', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const throwing = () => {
			throw new Error('notification boom')
		}

		batch(() => {
			notify(throwing)
		})

		expect(errorSpy).toHaveBeenCalledWith('[gjendje] Notification threw:', expect.any(Error))

		errorSpy.mockRestore()
	})
})

// ---------------------------------------------------------------------------
// 2. src/effect.ts line 76 — effect callback throws
// ---------------------------------------------------------------------------

describe('effect callback error handling', () => {
	it('logs error when the effect callback throws', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const s = state('effect-throw', { default: 0 })

		const handle = effect([s], () => {
			throw new Error('effect boom')
		})

		expect(errorSpy).toHaveBeenCalledWith('[gjendje] Effect callback threw:', expect.any(Error))

		errorSpy.mockRestore()
		handle.stop()
		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 3. src/persist.ts lines 157-159 — migration range out of bounds
// ---------------------------------------------------------------------------

describe('migration range out of bounds', () => {
	it('skips migration when the version jump exceeds MAX_MIGRATION_STEPS', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		configure({ logLevel: 'warn' })

		// Store a versioned value with version 1 in localStorage
		const storageKey = 'migrate-range-test'
		globalThis.localStorage.setItem(storageKey, JSON.stringify({ v: 1, data: 'old' }))

		// Create state with version 1002 (jump of 1001 > MAX_MIGRATION_STEPS=1000)
		const s = state(storageKey, {
			default: 'default',
			scope: 'local',
			version: 1002,
			migrate: {
				1: (old: unknown) => `${old}-migrated`,
			},
		})

		// The migration should be skipped, so the stored data is returned as-is
		expect(s.get()).toBe('old')

		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of bounds'))

		warnSpy.mockRestore()
		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 4. src/registry.ts line 40 — maxKeys limit error
// ---------------------------------------------------------------------------

describe('maxKeys limit', () => {
	it('throws when maxKeys limit is reached', () => {
		configure({ maxKeys: 2 })

		const s1 = state('maxkeys-a', { default: 0 })
		const s2 = state('maxkeys-b', { default: 0 })

		expect(() => state('maxkeys-c', { default: 0 })).toThrow('maxKeys limit (2) reached')

		s1.destroy()
		s2.destroy()
	})
})

// ---------------------------------------------------------------------------
// 5. src/registry.ts lines 65-67 — registerNew with existing destroyed instance
// ---------------------------------------------------------------------------

describe('re-register destroyed instance', () => {
	it('allows creating state with same key after destroy', () => {
		const s1 = state('reregister-key', { default: 'first' })

		s1.destroy()

		const s2 = state('reregister-key', { default: 'second' })

		expect(s2.get()).toBe('second')
		expect(s2.isDestroyed).toBe(false)

		s2.destroy()
	})
})

// ---------------------------------------------------------------------------
// 6. src/previous.ts line 74 — notify when old !== prev
// ---------------------------------------------------------------------------

describe('previous notifications', () => {
	it('notifies when old !== prev after multiple updates', () => {
		const s = state('prev-notify', { default: 0 })

		const prev = previous(s)

		const listener = vi.fn()

		prev.subscribe(listener)

		// First update: prev=undefined→0, current=0→1, old=undefined !== prev=0 → notify
		s.set(1)
		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(0)

		// Second update: prev=0→1, current=1→2, old=0 !== prev=1 → notify
		s.set(2)
		expect(listener).toHaveBeenCalledTimes(2)
		expect(listener).toHaveBeenCalledWith(1)

		// Third update: prev=1→2, current=2→3, old=1 !== prev=2 → notify
		s.set(3)
		expect(listener).toHaveBeenCalledTimes(3)
		expect(listener).toHaveBeenCalledWith(2)

		prev.destroy()
		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 7. src/utils.ts line 24 — shallowEqual with null
// ---------------------------------------------------------------------------

describe('shallowEqual null checks', () => {
	it('returns false when a is null and b is object', () => {
		expect(shallowEqual(null, {})).toBe(false)
	})

	it('returns false when a is object and b is null', () => {
		expect(shallowEqual({}, null)).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// 8. src/utils.ts line 40 — shallowEqual object vs array
// ---------------------------------------------------------------------------

describe('shallowEqual object vs array', () => {
	it('returns false when a is plain object and b is array', () => {
		expect(shallowEqual({ 0: 1, length: 1 }, [1])).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// 9. src/watchers.ts line 28 — delete empty listener set
// ---------------------------------------------------------------------------

describe('watcher cleanup on unsubscribe', () => {
	it('cleans up the watcher set when the last listener unsubscribes', () => {
		const s = state('watch-cleanup', { default: { name: 'Alice', age: 30 } })

		const w = withWatch(s)

		const listener = vi.fn()

		const unsub = w.watch('name', listener)

		// Trigger a change
		s.set({ name: 'Bob', age: 30 })
		expect(listener).toHaveBeenCalledWith('Bob')

		// Unsubscribe — should delete the empty set
		unsub()

		// Subsequent changes should not trigger the listener
		s.set({ name: 'Charlie', age: 30 })
		expect(listener).toHaveBeenCalledTimes(1)

		w.destroy()
	})
})

// ---------------------------------------------------------------------------
// 10. src/core.ts line 895 — warnOnDuplicate
// ---------------------------------------------------------------------------

describe('warnOnDuplicate', () => {
	it('warns on duplicate memory-scoped state', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		configure({ warnOnDuplicate: true })

		const s1 = state('dup-warn-mem', { default: 0 })

		const s2 = state('dup-warn-mem', { default: 0 })

		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate state("dup-warn-mem")'))
		expect(s1).toBe(s2)

		warnSpy.mockRestore()
		s1.destroy()
	})

	it('warns on duplicate non-memory-scoped state (line 895)', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		configure({ warnOnDuplicate: true })

		const s1 = state('dup-warn-local', { default: 0, scope: 'local' })

		const s2 = state('dup-warn-local', { default: 0, scope: 'local' })

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('Duplicate state("dup-warn-local")'),
		)
		expect(s1).toBe(s2)

		warnSpy.mockRestore()
		s1.destroy()
	})
})

// ---------------------------------------------------------------------------
// 11. src/core.ts lines 968-972 — hydration error handling
// ---------------------------------------------------------------------------

describe('hydration error handling', () => {
	it('handles adapter failure during SSR hydration gracefully', async () => {
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
		configure({ logLevel: 'debug' })

		// Ensure window + document exist so isServer() returns false
		Object.defineProperty(globalThis, 'document', { value: {}, configurable: true })

		// Create state with working localStorage
		const s = state('hydrate-fail', {
			default: 'fallback',
			scope: 'local',
			ssr: true,
		})

		// Remove localStorage before hydration callback fires
		// This makes resolveAdapter('local') throw during the hydration callback
		Object.defineProperty(globalThis, 'localStorage', {
			value: undefined,
			configurable: true,
		})

		// Wait for hydration callback to fire (uses setTimeout in test env)
		await s.hydrated

		// Restore localStorage for subsequent tests
		setupFullBrowserEnv()

		debugSpy.mockRestore()
		s.destroy()

		delete (globalThis as Record<string, unknown>).document
	})

	it('sets stored value when it differs from default during hydration (line 958)', async () => {
		// Ensure window + document exist so isServer() returns false
		Object.defineProperty(globalThis, 'document', { value: {}, configurable: true })

		// Create state — localStorage has no value yet, so instance gets default
		const s = state('hydrate-set-late', {
			default: 'default-value',
			scope: 'local',
			ssr: true,
		})

		// Immediately after creation, write to localStorage
		// The hydration callback fires after microtask + setTimeout,
		// so this write happens before hydration reads the value
		globalThis.localStorage.setItem('hydrate-set-late', JSON.stringify('stored-value'))

		await s.hydrated

		expect(s.get()).toBe('stored-value')

		s.destroy()
		delete (globalThis as Record<string, unknown>).document
	})
})

// ---------------------------------------------------------------------------
// 12. src/collection.ts lines 104-106 — watcher map empty during subscription
// ---------------------------------------------------------------------------

describe('collection watcher map empty', () => {
	it('updates prevItems without notifying when watcher map is empty', () => {
		const col = collection('col-empty-watch', { default: [{ id: 1, name: 'a' }] })

		// Set up watchers by calling watch, then immediately unsubscribe
		const unsub = col.watch('name', () => {})
		unsub()

		// Now watcher map exists but is empty — this update should hit the early return
		col.set([{ id: 2, name: 'b' }])

		expect(col.get()).toEqual([{ id: 2, name: 'b' }])

		col.destroy()
	})
})

// ---------------------------------------------------------------------------
// 13. src/collection.ts lines 143-151 — non-object item change notification
// ---------------------------------------------------------------------------

describe('collection non-object item changes', () => {
	it('notifies all watched keys when primitive items change', () => {
		// Use objects with a key we can watch, but store mixed content
		const col = collection('col-primitives', {
			default: [{ val: 1 }, { val: 2 }] as Array<{ val: number }>,
		})

		const listener = vi.fn()

		col.watch('val', listener)

		// Replace with same-length array where items change to non-record values.
		// We need to force the items to be non-objects while keeping the same length.
		// Use type assertion to bypass TypeScript.
		const mixed = [null, { val: 3 }] as unknown as Array<{ val: number }>
		col.set(mixed)

		expect(listener).toHaveBeenCalled()

		col.destroy()
	})
})

// ---------------------------------------------------------------------------
// 14. src/computed.ts lines 148-171 — async dependency handling
// ---------------------------------------------------------------------------

describe('computed with async dependencies', () => {
	it('creates async promise chains when dep has non-resolved ready', async () => {
		// Create a mock dependency that has a non-RESOLVED ready promise
		const asyncReady = Promise.resolve()
		const asyncHydrated = Promise.resolve()
		const asyncSettled = Promise.resolve()

		const fakeDep = {
			get: () => 10,
			ready: asyncReady,
			hydrated: asyncHydrated,
			settled: asyncSettled,
			destroyed: asyncReady,
			subscribe: (_listener: (v: number) => void) => () => {},
			peek: () => 10,
			key: 'async-fake',
			scope: 'memory' as const,
			isDestroyed: false,
			destroy: () => {},
		}

		const c = computed([fakeDep], ([val]) => ((val as number) ?? 0) * 2)

		// The computed should have created async promise chains
		expect(c.ready).toBeDefined()
		expect(c.hydrated).toBeDefined()
		expect(c.settled).toBeDefined()

		await c.ready
		await c.settled

		expect(c.get()).toBe(20)

		c.destroy()
	})
})

// ---------------------------------------------------------------------------
// 15. src/computed.ts line 223 — singleListener optimization path
// ---------------------------------------------------------------------------

describe('computed singleListener optimization', () => {
	it('restores singleListener when count drops back to 1', () => {
		const s = state('computed-single', { default: 0 })

		const c = computed([s], ([val]) => (val ?? 0) + 1)

		const listenerA = vi.fn()
		const listenerB = vi.fn()

		// Subscribe two listeners
		const unsubA = c.subscribe(listenerA)
		const unsubB = c.subscribe(listenerB)

		s.set(1)
		expect(listenerA).toHaveBeenCalledWith(2)
		expect(listenerB).toHaveBeenCalledWith(2)

		// Unsubscribe one — count goes back to 1, singleListener should be set
		unsubA()

		s.set(2)
		expect(listenerB).toHaveBeenCalledWith(3)
		// listenerA should not be called again
		expect(listenerA).toHaveBeenCalledTimes(1)

		unsubB()
		c.destroy()
		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 16. StateImpl methods for non-memory scopes (core.ts lines 306-376, 405, 412-424)
// ---------------------------------------------------------------------------

describe('StateImpl non-memory scope methods', () => {
	it('destroyed getter returns a promise (line 306-316)', async () => {
		const s = state('stateimpl-destroyed', { default: 0, scope: 'local' })

		const p = s.destroyed

		expect(p).toBeDefined()

		s.destroy()

		await p
	})

	it('intercept on non-memory scope (lines 322-331)', () => {
		const s = state('stateimpl-intercept', { default: 0, scope: 'local' })

		const unsub = s.intercept((next) => next * 2)

		s.set(5)
		expect(s.get()).toBe(10)

		unsub()

		s.set(3)
		expect(s.get()).toBe(3)

		s.destroy()
	})

	it('onChange on non-memory scope (lines 334-343)', () => {
		const s = state('stateimpl-onchange', { default: 'a', scope: 'local' })

		const handler = vi.fn()

		const unsub = s.onChange(handler)

		s.set('b')
		expect(handler).toHaveBeenCalledWith('b', 'a')

		unsub()

		s.set('c')
		expect(handler).toHaveBeenCalledTimes(1)

		s.destroy()
	})

	it('watch on non-memory scope (lines 346-357, 412-424)', () => {
		const s = state('stateimpl-watch', {
			default: { name: 'Alice', age: 30 },
			scope: 'local',
		})

		const listener = vi.fn()

		const unsub = s.watch('name', listener)

		s.set({ name: 'Bob', age: 30 })
		expect(listener).toHaveBeenCalledWith('Bob')

		unsub()
		s.destroy()
	})

	it('patch with strict mode on non-memory scope (lines 359-376)', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state('stateimpl-patch', {
			default: { name: 'Alice', age: 30 },
			scope: 'local',
		})

		s.patch({ name: 'Bob', extra: 'ignored' } as Partial<{ name: string; age: number }>, {
			strict: true,
		})

		expect(s.get()).toEqual({ name: 'Bob', age: 30 })
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ignored unknown key'))

		warnSpy.mockRestore()
		s.destroy()
	})

	it('resolveDestroyed is called when destroyed promise exists (line 405)', async () => {
		const s = state('stateimpl-resolve-destroyed', { default: 0, scope: 'local' })

		// Access .destroyed first to create the promise with resolveDestroyed
		const p = s.destroyed

		// Now destroy — should call resolveDestroyed
		s.destroy()

		await p
	})
})

// ---------------------------------------------------------------------------
// 17. Storage adapter cache hit (storage.ts lines 52-53)
// ---------------------------------------------------------------------------

describe('storage adapter cache hit', () => {
	it('returns cached value when raw string is unchanged after cache invalidation', () => {
		const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>()

		const storage = globalThis.localStorage

		// Set up window with real event listeners so StorageEvent handler works
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

		// Pre-populate localStorage
		storage.setItem('cache-hit-test', JSON.stringify(42))

		const s = state('cache-hit-test', { default: 0, scope: 'local' })

		// First get reads from storage and populates cache
		expect(s.get()).toBe(42)

		// Simulate a StorageEvent with different key to invalidate cache
		// but keep the raw value the same (triggers raw === cachedRaw branch)
		const handlers = eventListeners.get('storage')

		if (handlers) {
			for (const handler of handlers) {
				handler({
					storageArea: storage,
					key: 'cache-hit-test',
				})
			}
		}

		// The StorageEvent invalidates cacheValid, so next get() re-reads from storage
		// Since the raw string hasn't changed, it hits the raw === cachedRaw branch (lines 51-53)
		expect(s.get()).toBe(42)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 18. StateImpl.peek() on non-memory (core.ts line 194)
// ---------------------------------------------------------------------------

describe('StateImpl peek on non-memory scope', () => {
	it('returns value from adapter via peek()', () => {
		const s = state('stateimpl-peek', { default: 'hello', scope: 'local' })

		expect(s.peek()).toBe('hello')

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 19. Interceptor error propagation (core.ts lines 209-211)
// ---------------------------------------------------------------------------

describe('interceptor error propagation', () => {
	it('reports and rethrows when an interceptor throws', () => {
		const onError = vi.fn()

		configure({ onError })

		const s = state('intercept-throw', { default: 0, scope: 'local' })

		s.intercept(() => {
			throw new Error('interceptor boom')
		})

		expect(() => s.set(1)).toThrow('Interceptor threw')
		expect(onError).toHaveBeenCalled()

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 20. resolveAdapter error paths (core.ts lines 65, 91)
// ---------------------------------------------------------------------------

describe('resolveAdapter error paths', () => {
	it('throws when sessionStorage is undefined for session scope', () => {
		// Remove sessionStorage
		const prev = globalThis.sessionStorage

		Object.defineProperty(globalThis, 'sessionStorage', {
			value: undefined,
			configurable: true,
		})

		expect(() => state('no-session', { default: 0, scope: 'session' })).toThrow(
			'sessionStorage is not available',
		)

		Object.defineProperty(globalThis, 'sessionStorage', {
			value: prev,
			configurable: true,
		})
	})

	it('throws when server adapter is not imported for server scope', () => {
		expect(() => state('no-server-adapter', { default: 0, scope: 'server' })).toThrow(
			'scope: "server" requires the server adapter',
		)
	})
})
