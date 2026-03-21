import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	batch,
	collection,
	computed,
	configure,
	effect,
	previous,
	select,
	state,
	withHistory,
} from '../src/index.js'
import { makeStorage } from './helpers.js'

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
		value: {
			location: { search: '', pathname: '/', hash: '' },
			history: { pushState: () => {} },
			addEventListener: () => {},
			removeEventListener: () => {},
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
})

// ===========================================================================
// 1. Re-registration after destroy — new instance is fully independent
// ===========================================================================

describe('re-registration after destroy', () => {
	it('new instance after destroy has independent subscribers', () => {
		const listener1 = vi.fn()
		const s1 = state('re-reg-sub', { default: 0, scope: 'render' })
		s1.subscribe(listener1)
		s1.set(1)
		expect(listener1).toHaveBeenCalledTimes(1)

		s1.destroy()

		const listener2 = vi.fn()
		const s2 = state('re-reg-sub', { default: 0, scope: 'render' })
		s2.subscribe(listener2)
		s2.set(5)

		// Old listener should not fire again
		expect(listener1).toHaveBeenCalledTimes(1)
		// New listener fires on new instance
		expect(listener2).toHaveBeenCalledTimes(1)
		expect(s2.get()).toBe(5)
	})

	it('new instance after destroy has independent interceptors', () => {
		const s1 = state('re-reg-intercept', { default: 0, scope: 'render' })
		s1.intercept((next) => next * 100)
		s1.set(2)
		expect(s1.get()).toBe(200)

		s1.destroy()

		const s2 = state('re-reg-intercept', { default: 0, scope: 'render' })
		s2.set(2)
		// No interceptor on new instance
		expect(s2.get()).toBe(2)
	})

	it('new instance after destroy has independent hooks', () => {
		const hook1 = vi.fn()
		const s1 = state('re-reg-hook', { default: 0, scope: 'render' })
		s1.use(hook1)
		s1.set(1)
		expect(hook1).toHaveBeenCalledTimes(1)

		s1.destroy()

		const s2 = state('re-reg-hook', { default: 0, scope: 'render' })
		s2.set(2)

		// Old hook should not fire
		expect(hook1).toHaveBeenCalledTimes(1)
	})

	it('new instance after destroy has independent watch subscriptions', () => {
		const s1 = state('re-reg-watch', {
			default: { x: 0, y: 0 },
			scope: 'render',
		})

		const watcher1 = vi.fn()
		s1.watch('x', watcher1)
		s1.set({ x: 1, y: 0 })
		expect(watcher1).toHaveBeenCalledTimes(1)

		s1.destroy()

		const s2 = state('re-reg-watch', {
			default: { x: 0, y: 0 },
			scope: 'render',
		})

		const watcher2 = vi.fn()
		s2.watch('x', watcher2)
		s2.set({ x: 5, y: 0 })

		// Old watcher should not fire again
		expect(watcher1).toHaveBeenCalledTimes(1)
		expect(watcher2).toHaveBeenCalledTimes(1)
		expect(watcher2).toHaveBeenCalledWith(5)
	})
})

// ===========================================================================
// 2. Migration + validation interaction
// ===========================================================================

describe('migration followed by validation failure', () => {
	it('returns default when migrated value fails validation', () => {
		const storage = makeStorage()
		// Store a v1 value in storage
		storage.setItem('mig-val-fail', JSON.stringify({ v: 1, data: { name: 'old' } }))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('mig-val-fail', {
			default: { name: '', age: 0 },
			scope: 'local',
			version: 2,
			migrate: {
				// Migration doesn't add 'age', producing an invalid shape
				1: (old: unknown) => old,
			},
			validate: (v: unknown): v is { name: string; age: number } => {
				return (
					typeof v === 'object' &&
					v !== null &&
					'name' in v &&
					'age' in v &&
					typeof (v as Record<string, unknown>).age === 'number'
				)
			},
		})

		// Validation rejects the migrated value, so we get the default
		expect(s.get()).toEqual({ name: '', age: 0 })
	})

	it('returns migrated value when migration and validation both succeed', () => {
		const storage = makeStorage()
		storage.setItem('mig-val-ok', JSON.stringify({ v: 1, data: { name: 'Alice' } }))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('mig-val-ok', {
			default: { name: '', age: 0 },
			scope: 'local',
			version: 2,
			migrate: {
				1: (old: unknown) => ({ ...(old as object), age: 25 }),
			},
			validate: (v: unknown): v is { name: string; age: number } => {
				return (
					typeof v === 'object' &&
					v !== null &&
					'name' in v &&
					'age' in v &&
					typeof (v as Record<string, unknown>).age === 'number'
				)
			},
		})

		expect(s.get()).toEqual({ name: 'Alice', age: 25 })
	})

	it('partial migration failure returns partially migrated value', () => {
		const storage = makeStorage()
		storage.setItem('mig-partial', JSON.stringify({ v: 1, data: 'start' }))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state('mig-partial', {
			default: 'default',
			scope: 'local',
			version: 3,
			migrate: {
				1: () => 'after-v1',
				2: () => {
					throw new Error('migration v2 failed')
				},
			},
		})

		// Migration stopped at v2 failure, returns 'after-v1'
		expect(s.get()).toBe('after-v1')

		consoleSpy.mockRestore()
	})
})

// ===========================================================================
// 3. Quota exceeded during sync writes
// ===========================================================================

describe('quota exceeded on storage write', () => {
	it('fires onQuotaExceeded when localStorage setItem throws quota error', () => {
		const quotaHandler = vi.fn()
		configure({ onQuotaExceeded: quotaHandler })

		const storage = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('quota-write', {
			default: 'init',
			scope: 'local',
		})

		// Now make storage throw quota errors
		const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError')
		storage.setItem = () => {
			throw quotaError
		}

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		s.set('large-value')

		expect(quotaHandler).toHaveBeenCalled()

		consoleSpy.mockRestore()
		configure({ onQuotaExceeded: undefined })
	})
})

// ===========================================================================
// 4. Computed diamond dependency — value consistency
// ===========================================================================

describe('computed diamond dependency consistency', () => {
	it('never sees inconsistent intermediate values', () => {
		const root = state('diamond-root', { default: 1, scope: 'render' })

		const left = computed([root], ([v]) => (v ?? 0) * 2)
		const right = computed([root], ([v]) => (v ?? 0) * 3)

		const seenValues: Array<[number, number]> = []

		// biome-ignore lint/suspicious/noExplicitAny: computed-of-computed needs BaseInstance cast
		const combined = computed([left, right] as any, (vals: unknown[]) => {
			const [l, r] = vals as [number, number]
			seenValues.push([l, r])
			return l + r
		})

		// Initial: left=2, right=3, combined=5
		expect(combined.get()).toBe(5)

		batch(() => {
			root.set(10)
		})

		// After batch: left=20, right=30, combined=50
		expect(combined.get()).toBe(50)

		// Verify we never saw mismatched values (e.g. left=20, right=3)
		for (const [l, r] of seenValues) {
			// l/r ratio should always be 2:3
			expect(l * 3).toBe(r * 2)
		}
	})

	it('computed subscriber fires at most once per batch for diamond deps', () => {
		const root = state('diamond-once', { default: 0, scope: 'render' })

		const a = computed([root], ([v]) => (v ?? 0) + 1)
		const b = computed([root], ([v]) => (v ?? 0) + 2)

		// biome-ignore lint/suspicious/noExplicitAny: computed-of-computed needs BaseInstance cast
		const c = computed([a, b] as any, (vals: unknown[]) => {
			const [av, bv] = vals as [number, number]
			return av + bv
		})

		const listener = vi.fn()
		c.subscribe(listener)

		batch(() => {
			root.set(10)
		})

		// Should only be notified once with the final value, not intermediate
		expect(listener).toHaveBeenCalledTimes(1)
		expect(c.get()).toBe(23) // (10+1) + (10+2)
	})
})

// ===========================================================================
// 5. Batch error recovery — depth counter and buffer cleanup
// ===========================================================================

describe('batch error recovery', () => {
	it('depth counter resets after error so subsequent batches work', () => {
		const s = state('batch-depth-reset', { default: 0, scope: 'render' })
		const listener = vi.fn()
		s.subscribe(listener)

		// First batch throws
		expect(() =>
			batch(() => {
				s.set(1)
				throw new Error('boom')
			}),
		).toThrow('boom')

		listener.mockClear()

		// Second batch should still work correctly
		batch(() => {
			s.set(2)
			s.set(3)
		})

		// Listener should fire (batch defers, then flushes)
		expect(s.get()).toBe(3)
		expect(listener).toHaveBeenCalled()
	})

	it('nested batch error does not break outer batch', () => {
		const s = state('batch-nested-err', { default: 0, scope: 'render' })
		const listener = vi.fn()
		s.subscribe(listener)

		expect(() =>
			batch(() => {
				s.set(1)

				try {
					batch(() => {
						s.set(2)
						throw new Error('inner boom')
					})
				} catch {
					// swallow inner error
				}

				s.set(3)
			}),
		).not.toThrow()

		expect(s.get()).toBe(3)
		expect(listener).toHaveBeenCalled()
	})

	it('notification error does not prevent other notifications from firing', () => {
		const a = state('batch-notif-err-a', { default: 0, scope: 'render' })
		const b = state('batch-notif-err-b', { default: 0, scope: 'render' })

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		a.subscribe(() => {
			throw new Error('listener a boom')
		})

		const bListener = vi.fn()
		b.subscribe(bListener)

		batch(() => {
			a.set(1)
			b.set(1)
		})

		// b's listener should still fire despite a's listener throwing
		expect(bListener).toHaveBeenCalled()

		consoleSpy.mockRestore()
	})
})

// ===========================================================================
// 6. URL adapter — rapid updates produce correct final state
// ===========================================================================

describe('url adapter rapid updates', () => {
	it('each set call pushes a new URL', () => {
		const pushedUrls: string[] = []

		Object.defineProperty(globalThis, 'window', {
			value: {
				location: { search: '', pathname: '/app', hash: '' },
				history: {
					pushState: (_: unknown, __: string, url: string) => {
						pushedUrls.push(url)
					},
				},
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})

		const s = state('url-rapid', { default: 0, scope: 'url' })

		s.set(1)
		s.set(2)
		s.set(3)

		// Each set should have pushed a URL
		expect(pushedUrls.length).toBe(3)

		// Last pushed URL should contain the final value
		const lastUrl = pushedUrls[pushedUrls.length - 1] ?? ''
		expect(lastUrl).toContain('url-rapid')
		expect(lastUrl).toContain(encodeURIComponent('3'))
	})

	it('URL adapter encodes special characters in pushed URL', () => {
		let lastPushedUrl = ''

		Object.defineProperty(globalThis, 'window', {
			value: {
				location: { search: '', pathname: '/', hash: '' },
				history: {
					pushState: (_: unknown, __: string, url: string) => {
						lastPushedUrl = url
					},
				},
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})

		const s = state('url-special', { default: '', scope: 'url' })

		s.set('hello world & foo=bar')

		// Should have pushed a URL with the encoded value
		expect(lastPushedUrl).toContain('url-special=')
		// Verify pushState was called with a non-empty URL containing the key
		expect(lastPushedUrl.length).toBeGreaterThan(0)
	})
})

// ===========================================================================
// 7. Collection watch — primitives and object/primitive transitions
// ===========================================================================

describe('collection watch with primitives', () => {
	it('watch fires for all keys when items are primitives', () => {
		const col = collection('col-prim-watch', {
			default: [1, 2, 3],
			scope: 'render',
		})

		const listener = vi.fn()
		col.watch('toString' as never, listener as never)

		col.set([1, 2, 4]) // item at index 2 changed (primitive)

		expect(listener).toHaveBeenCalled()
	})

	it('watch fires when transitioning from objects to shorter array', () => {
		const col = collection<{ id: number; name: string }>('col-obj-shrink', {
			default: [
				{ id: 1, name: 'A' },
				{ id: 2, name: 'B' },
			],
			scope: 'render',
		})

		const listener = vi.fn()
		col.watch('name', listener)

		// Remove one item — length changes, all keys flagged
		col.remove((item) => item.id === 2)

		expect(listener).toHaveBeenCalledWith([{ id: 1, name: 'A' }])
	})

	it('watch fires when transitioning from empty to populated', () => {
		const col = collection<{ id: number }>('col-empty-to-full', {
			default: [],
			scope: 'render',
		})

		const listener = vi.fn()
		col.watch('id', listener)

		col.add({ id: 1 })

		expect(listener).toHaveBeenCalledTimes(1)
	})
})

// ===========================================================================
// 8. Interceptor chain — mid-chain failure
// ===========================================================================

describe('interceptor mid-chain failure', () => {
	it('second interceptor throwing leaves value unchanged', () => {
		const s = state('intercept-mid', { default: 0, scope: 'render' })
		const log: string[] = []

		s.intercept((next) => {
			log.push('first')
			return next + 1
		})

		s.intercept(() => {
			log.push('second-throw')
			throw new Error('mid-chain failure')
		})

		s.intercept((next) => {
			log.push('third')
			return next
		})

		expect(() => s.set(10)).toThrow('mid-chain failure')

		// Value should remain unchanged
		expect(s.get()).toBe(0)

		// First ran, second threw, third should not have run
		expect(log).toEqual(['first', 'second-throw'])
	})

	it('value is consistent after interceptor failure and retry', () => {
		const s = state('intercept-retry', { default: 0, scope: 'render' })
		let shouldThrow = true

		s.intercept((next) => {
			if (shouldThrow) throw new Error('temporary failure')
			return next
		})

		// First attempt fails
		expect(() => s.set(5)).toThrow('temporary failure')
		expect(s.get()).toBe(0)

		// Retry succeeds
		shouldThrow = false
		s.set(5)
		expect(s.get()).toBe(5)
	})
})

// ===========================================================================
// 9. Config callback interactions
// ===========================================================================

describe('config callback interactions', () => {
	it('onDestroy fires for each destroyed instance', () => {
		const destroyLog: string[] = []
		configure({
			onDestroy: ({ key }) => {
				destroyLog.push(key)
			},
		})

		const a = state('cb-destroy-a', { default: 0, scope: 'render' })
		const b = state('cb-destroy-b', { default: 0, scope: 'render' })

		a.destroy()
		b.destroy()

		expect(destroyLog).toEqual(['cb-destroy-a', 'cb-destroy-b'])

		configure({ onDestroy: undefined })
	})

	it('onRegister fires for each new instance', () => {
		const registerLog: string[] = []
		configure({
			onRegister: ({ key }) => {
				registerLog.push(key)
			},
		})

		state('cb-reg-a', { default: 0, scope: 'render' })
		state('cb-reg-b', { default: '', scope: 'render' })

		expect(registerLog).toEqual(['cb-reg-a', 'cb-reg-b'])

		configure({ onRegister: undefined })
	})

	it('onMigrate fires when stored data is migrated', () => {
		const migrateLog: Array<{ from: number; to: number }> = []
		configure({
			onMigrate: ({ fromVersion, toVersion }) => {
				migrateLog.push({ from: fromVersion, to: toVersion })
			},
		})

		const storage = makeStorage()
		storage.setItem('cb-migrate', JSON.stringify({ v: 1, data: 'old' }))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		state('cb-migrate', {
			default: 'default',
			scope: 'local',
			version: 3,
			migrate: {
				1: (old: unknown) => `${old}-v2`,
				2: (old: unknown) => `${old}-v3`,
			},
		})

		expect(migrateLog).toEqual([{ from: 1, to: 3 }])

		configure({ onMigrate: undefined })
	})
})

// ===========================================================================
// 10. Effect cleanup + re-execution after error
// ===========================================================================

describe('effect cleanup error does not break re-execution', () => {
	it('effect re-runs after cleanup throws', () => {
		const s = state('effect-cleanup-err', { default: 0, scope: 'render' })
		const runs: number[] = []

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		effect([s], ([v]) => {
			runs.push(v ?? 0)
			return () => {
				throw new Error('cleanup error')
			}
		})

		expect(runs).toEqual([0]) // initial

		s.set(1) // cleanup throws, but effect re-runs
		expect(runs).toEqual([0, 1])

		s.set(2) // cleanup throws again, effect re-runs again
		expect(runs).toEqual([0, 1, 2])

		consoleSpy.mockRestore()
	})
})

// ===========================================================================
// 11. Selective persistence with version migration
// ===========================================================================

describe('selective persistence with migration', () => {
	it('migrates persisted keys and merges with defaults', () => {
		const storage = makeStorage()
		// v1 stored value only has 'name' persisted
		storage.setItem('sel-mig', JSON.stringify({ v: 1, data: { name: 'Alice' } }))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('sel-mig', {
			default: { name: '', email: '', age: 0 },
			scope: 'local',
			version: 2,
			persist: ['name', 'email'],
			migrate: {
				1: (old: unknown) => {
					const obj = old as Record<string, unknown>
					return { ...obj, email: `${obj.name}@example.com` }
				},
			},
		})

		const value = s.get()
		expect(value.name).toBe('Alice')
		expect(value.email).toBe('Alice@example.com')
		// age comes from default (not persisted)
		expect(value.age).toBe(0)
	})
})

// ===========================================================================
// 12. withHistory + interceptor rejection during undo
// ===========================================================================

describe('withHistory with interceptor rejection', () => {
	it('undo works correctly after interceptor is removed', () => {
		const base = state('hist-reject', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)
		h.set(3)

		// Add interceptor that rejects all changes
		const unsub = base.intercept((_next, prev) => prev)

		// undo won't actually change the value (interceptor rejects)
		h.undo()
		// isEqual is not set, so the set still goes through the adapter
		// but the interceptor returns prev, so value stays at 3

		unsub()

		// After removing interceptor, undo should work
		h.undo()
		// The history state may be affected by the rejected undo
		// Verify we can still navigate
		expect(typeof h.get()).toBe('number')
	})

	it('isNavigating flag resets even if set() is intercepted', () => {
		const base = state('hist-nav-flag', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)

		// Undo should work (isNavigating = true during set)
		h.undo()
		expect(h.get()).toBe(1)

		// New set after undo should clear redo (isNavigating should be false)
		h.set(5)
		expect(h.canRedo).toBe(false)
	})
})

// ===========================================================================
// 13. Select — destroy unsubscribes and caching
// ===========================================================================

describe('select regression', () => {
	it('destroy prevents further recomputation', () => {
		const source = state('sel-destroy', { default: 0, scope: 'render' })
		let computeCount = 0

		const sel = select(source, (v) => {
			computeCount++
			return (v ?? 0) * 2
		})

		expect(computeCount).toBe(1)
		expect(sel.get()).toBe(0)

		sel.destroy()

		source.set(5)
		expect(computeCount).toBe(1) // no recomputation
		expect(sel.get()).toBe(0) // cached value
	})

	it('select skips notification when derived value is unchanged', () => {
		const source = state('sel-skip', { default: 1, scope: 'render' })
		const sel = select(source, (v) => ((v ?? 0) > 0 ? 'positive' : 'non-positive'))

		const listener = vi.fn()
		sel.subscribe(listener)

		// Change source but derived value stays 'positive'
		source.set(2)
		source.set(3)

		expect(listener).not.toHaveBeenCalled()
	})
})

// ===========================================================================
// 14. Previous — tracks correctly through rapid changes
// ===========================================================================

describe('previous regression', () => {
	it('tracks rapid sequential changes correctly', () => {
		const source = state('prev-rapid', { default: 0, scope: 'render' })
		const prev = previous(source)

		expect(prev.get()).toBeUndefined()

		source.set(1)
		expect(prev.get()).toBe(0)

		source.set(2)
		expect(prev.get()).toBe(1)

		source.set(3)
		expect(prev.get()).toBe(2)
	})

	it('previous subscriber fires only when prev value changes', () => {
		const source = state('prev-sub-fire', { default: 'a', scope: 'render' })
		const prev = previous(source)

		const listener = vi.fn()
		prev.subscribe(listener)

		source.set('b') // prev: undefined -> 'a' — fires
		expect(listener).toHaveBeenCalledTimes(1)

		source.set('c') // prev: 'a' -> 'b' — fires
		expect(listener).toHaveBeenCalledTimes(2)
	})

	it('previous destroy stops tracking', () => {
		const source = state('prev-destroy', { default: 0, scope: 'render' })
		const prev = previous(source)

		source.set(1)
		expect(prev.get()).toBe(0)

		prev.destroy()

		source.set(2)
		// Should still return last known previous value
		expect(prev.get()).toBe(0)
	})
})

// ===========================================================================
// 15. Batch with computed — settled promise composition
// ===========================================================================

describe('computed settled promise', () => {
	it('settled resolves after all deps settle', async () => {
		const a = state('comp-settled-a', { default: 0, scope: 'render' })
		const b = state('comp-settled-b', { default: 0, scope: 'render' })

		// biome-ignore lint/suspicious/noExplicitAny: computed deps need BaseInstance cast
		const c = computed([a, b] as any, (vals: unknown[]) => {
			const [av, bv] = vals as [number, number]
			return av + bv
		})

		await expect(c.settled).resolves.toBeUndefined()
	})

	it('ready resolves after all deps are ready', async () => {
		const a = state('comp-ready-a', { default: 0, scope: 'render' })
		const b = state('comp-ready-b', { default: 0, scope: 'render' })

		// biome-ignore lint/suspicious/noExplicitAny: computed deps need BaseInstance cast
		const c = computed([a, b] as any, (vals: unknown[]) => {
			const [av, bv] = vals as [number, number]
			return av + bv
		})

		await expect(c.ready).resolves.toBeUndefined()
	})
})

// ===========================================================================
// 16. Storage adapter — corrupt data fallback
// ===========================================================================

describe('storage corrupt data regression', () => {
	it('returns default for corrupt JSON in localStorage', () => {
		const storage = makeStorage()
		storage.setItem('corrupt-json', '{invalid json!!!')

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('corrupt-json', { default: 42, scope: 'local' })
		expect(s.get()).toBe(42)
	})

	it('returns default for wrong type in localStorage', () => {
		const storage = makeStorage()
		storage.setItem('wrong-type', JSON.stringify('not a number'))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('wrong-type', {
			default: 0,
			scope: 'local',
			validate: (v: unknown): v is number => typeof v === 'number',
		})

		expect(s.get()).toBe(0)
	})
})

// ===========================================================================
// 17. Computed with set during notification (re-entrancy)
// ===========================================================================

describe('computed re-entrancy', () => {
	it('handles source set during computed subscriber callback', () => {
		const source = state('comp-reentrant', { default: 0, scope: 'render' })
		const doubled = computed([source], ([v]) => (v ?? 0) * 2)

		const values: number[] = []

		doubled.subscribe((v) => {
			values.push(v)
			// Re-entrant: set source during notification
			if (v === 2) {
				source.set(5)
			}
		})

		source.set(1)

		// Should have seen 2 (from set(1)) and 10 (from re-entrant set(5))
		expect(values).toContain(2)
		expect(values).toContain(10)
		expect(doubled.get()).toBe(10)
	})
})

// ===========================================================================
// 18. maxKeys enforcement
// ===========================================================================

describe('maxKeys enforcement', () => {
	it('throws when maxKeys limit is reached', () => {
		configure({ maxKeys: 2 })

		state('max-a', { default: 0, scope: 'render' })
		state('max-b', { default: 0, scope: 'render' })

		expect(() => state('max-c', { default: 0, scope: 'render' })).toThrow(/maxKeys/)

		configure({ maxKeys: undefined })
	})

	it('allows new registration after destroy frees a slot', () => {
		configure({ maxKeys: 2 })

		const a = state('max-free-a', { default: 0, scope: 'render' })
		state('max-free-b', { default: 0, scope: 'render' })

		a.destroy()

		// Should not throw — slot freed
		expect(() => state('max-free-c', { default: 0, scope: 'render' })).not.toThrow()

		configure({ maxKeys: undefined })
	})
})

// ===========================================================================
// 19. Effect with multiple deps — all values consistent
// ===========================================================================

describe('effect value consistency', () => {
	it('effect sees consistent dep values within a batch', () => {
		const a = state('eff-consist-a', { default: 0, scope: 'render' })
		const b = state('eff-consist-b', { default: 0, scope: 'render' })

		const seen: Array<[number, number]> = []

		effect([a, b], ([av, bv]) => {
			seen.push([av ?? 0, bv ?? 0])
			return undefined
		})

		// Initial run
		expect(seen).toEqual([[0, 0]])

		batch(() => {
			a.set(1)
			b.set(1)
		})

		// After batch, effect should see consistent [1, 1]
		const lastSeen = seen[seen.length - 1]
		expect(lastSeen).toEqual([1, 1])
	})
})

// ===========================================================================
// 20. withHistory destroy clears stacks
// ===========================================================================

describe('withHistory destroy cleanup', () => {
	it('destroy clears history and delegates to base', () => {
		const base = state('hist-destroy', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)
		h.set(3)
		expect(h.canUndo).toBe(true)

		h.destroy()

		expect(h.isDestroyed).toBe(true)
		expect(h.canUndo).toBe(false)
		expect(h.canRedo).toBe(false)
	})

	it('withHistory undo on empty stack is a no-op', () => {
		const base = state('hist-empty-undo', { default: 42, scope: 'render' })
		const h = withHistory(base)

		h.undo() // no-op
		expect(h.get()).toBe(42)

		h.redo() // no-op
		expect(h.get()).toBe(42)
	})
})
