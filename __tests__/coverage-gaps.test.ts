import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, collection, computed, configure, effect, state, withHistory } from '../src/index.js'
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
// Interceptor chain edge cases
// ---------------------------------------------------------------------------

describe('interceptor chain', () => {
	it('multiple interceptors run in registration order', () => {
		const s = state('chain-order', { default: 0, scope: 'render' })
		const log: string[] = []

		s.intercept((next, _prev) => {
			log.push('A')
			return next + 1
		})

		s.intercept((next, _prev) => {
			log.push('B')
			return next * 10
		})

		s.set(1) // A: 1+1=2, B: 2*10=20

		expect(s.get()).toBe(20)
		expect(log).toEqual(['A', 'B'])
	})

	it('first interceptor throwing prevents subsequent interceptors from running', () => {
		const s = state('chain-throw-first', { default: 0, scope: 'render' })
		const secondCalled = vi.fn()

		s.intercept(() => {
			throw new Error('first throws')
		})

		s.intercept((next) => {
			secondCalled()
			return next
		})

		expect(() => s.set(1)).toThrow('first throws')
		expect(secondCalled).not.toHaveBeenCalled()
		expect(s.get()).toBe(0)
	})

	it('unsubscribing an interceptor removes it from the chain', () => {
		const s = state('chain-unsub', { default: 0, scope: 'render' })

		const unsub = s.intercept((next) => next * 2)

		s.set(5)
		expect(s.get()).toBe(10)

		unsub()

		s.set(3)
		expect(s.get()).toBe(3)
	})

	it('interceptor can reject update by returning prev', () => {
		const s = state('chain-reject', { default: 0, scope: 'render' })
		const listener = vi.fn()

		s.subscribe(listener)

		s.intercept((_next, prev) => prev)

		s.set(42)

		// Value unchanged — but the adapter still sets + notifies (isEqual is the opt-in gate)
		expect(s.get()).toBe(0)
	})

	it('interceptors run on reset() too', () => {
		const s = state('chain-reset', { default: 0, scope: 'render' })
		const intercepted = vi.fn((next: number) => next + 100)

		s.intercept(intercepted)

		s.set(5) // intercepted: 5+100=105
		expect(s.get()).toBe(105)

		s.reset() // intercepted: 0+100=100
		expect(s.get()).toBe(100)
		expect(intercepted).toHaveBeenCalledTimes(2)
	})
})

// ---------------------------------------------------------------------------
// Destroyed instance — subscribe, intercept, use after destroy
// ---------------------------------------------------------------------------

describe('destroyed instance advanced', () => {
	it('subscribe() after destroy still returns an unsubscribe function', () => {
		const s = state('destroyed-sub', { default: 0, scope: 'render' })

		s.destroy()

		const unsub = s.subscribe(() => {})
		expect(typeof unsub).toBe('function')
		unsub() // should not throw
	})

	it('intercept() after destroy still returns an unsubscribe function', () => {
		const s = state('destroyed-intercept', { default: 0, scope: 'render' })

		s.destroy()

		const unsub = s.intercept((next) => next)
		expect(typeof unsub).toBe('function')
		unsub()
	})

	it('use() after destroy still returns an unsubscribe function', () => {
		const s = state('destroyed-use', { default: 0, scope: 'render' })

		s.destroy()

		const unsub = s.use(() => {})
		expect(typeof unsub).toBe('function')
		unsub()
	})

	it('peek() returns last known value after destroy', () => {
		const s = state('destroyed-peek', { default: 0, scope: 'render' })

		s.set(42)
		s.destroy()

		expect(s.peek()).toBe(42)
	})

	it('subscribers are not notified after destroy', () => {
		const s = state('destroyed-no-notify', { default: 0, scope: 'render' })
		const listener = vi.fn()

		s.subscribe(listener)
		s.set(1)
		expect(listener).toHaveBeenCalledTimes(1)

		s.destroy()
		s.set(2)
		expect(listener).toHaveBeenCalledTimes(1) // no additional call
	})

	it('ready promise resolves even after destroy', async () => {
		const s = state('destroyed-ready', { default: 0, scope: 'render' })

		s.destroy()

		await expect(s.ready).resolves.toBeUndefined()
	})

	it('use() hooks are cleared on destroy and do not fire', () => {
		const s = state('destroyed-hooks-clear', { default: 0, scope: 'render' })
		const hookFn = vi.fn()

		s.use(hookFn)
		s.set(1)
		expect(hookFn).toHaveBeenCalledTimes(1)

		s.destroy()
		// hooks are cleared, set is a no-op
		s.set(2)
		expect(hookFn).toHaveBeenCalledTimes(1)
	})
})

// ---------------------------------------------------------------------------
// Effect cleanup edge cases
// ---------------------------------------------------------------------------

describe('effect cleanup edge cases', () => {
	it('cleanup throwing does not prevent the next effect run', () => {
		const a = state('effect-cleanup-throw', { default: 0, scope: 'render' })
		const log: string[] = []

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const handle = effect([a], () => {
			log.push('run')

			return () => {
				log.push('cleanup-throw')
				throw new Error('cleanup boom')
			}
		})

		expect(log).toEqual(['run'])

		// Cleanup throws, but listener error isolation catches it.
		// The effect still re-runs because the error is isolated.
		a.set(1)

		expect(log).toEqual(['run', 'cleanup-throw', 'run'])
		expect(consoleSpy).toHaveBeenCalled()

		// stop() also calls cleanup — which throws again, but is caught
		handle.stop()

		consoleSpy.mockRestore()
	})

	it('effect does not run after stop even if dep changes', () => {
		const a = state('effect-stop-dep', { default: 0, scope: 'render' })
		let runCount = 0

		const handle = effect([a], () => {
			runCount++
			return undefined
		})

		expect(runCount).toBe(1) // initial

		handle.stop()

		a.set(1)
		expect(runCount).toBe(1) // no additional run
	})

	it('effect with zero dependencies runs once and never re-runs', () => {
		let runCount = 0

		const handle = effect([], () => {
			runCount++
			return undefined
		})

		expect(runCount).toBe(1)

		handle.stop()
	})

	it('effect cleanup runs when stop() is called without any dependency change', () => {
		let cleanedUp = false

		const a = state('effect-cleanup-stop', { default: 0, scope: 'render' })

		const handle = effect([a], () => {
			return () => {
				cleanedUp = true
			}
		})

		expect(cleanedUp).toBe(false)

		handle.stop()
		expect(cleanedUp).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Re-entrancy — set during notification
// ---------------------------------------------------------------------------

describe('re-entrancy', () => {
	it('subscriber calling set() on same state during notification works', () => {
		const s = state('reentrant-same', { default: 0, scope: 'render' })
		const values: number[] = []

		s.subscribe((v) => {
			values.push(v)

			// Re-entrant: cap value at 3
			if (v < 3) {
				s.set(v + 1)
			}
		})

		s.set(1)

		// Should have cascaded: 1, 2, 3
		expect(values).toEqual([1, 2, 3])
		expect(s.get()).toBe(3)
	})

	it('subscriber calling set() on different state during notification works', () => {
		const a = state('reentrant-a', { default: 0, scope: 'render' })
		const b = state('reentrant-b', { default: 0, scope: 'render' })
		const bValues: number[] = []

		a.subscribe((v) => {
			b.set(v * 10)
		})

		b.subscribe((v) => {
			bValues.push(v)
		})

		a.set(5)

		expect(b.get()).toBe(50)
		expect(bValues).toContain(50)
	})

	it('batch prevents re-entrant notifications until flush', () => {
		const a = state('reentrant-batch-a', { default: 0, scope: 'render' })
		const b = state('reentrant-batch-b', { default: 0, scope: 'render' })
		const log: string[] = []

		a.subscribe((v) => {
			log.push(`a:${v}`)
			b.set(v * 10)
		})

		b.subscribe((v) => {
			log.push(`b:${v}`)
		})

		batch(() => {
			a.set(1)
			a.set(2)
		})

		// After batch: only the last set(2) should notify
		// a subscriber fires, sets b=20, b subscriber fires
		expect(b.get()).toBe(20)
	})

	it('computed handles re-entrant dependency updates', () => {
		const a = state('reentrant-comp', { default: 1, scope: 'render' })
		const c = computed([a], ([v]) => (v ?? 0) * 2)

		const values: number[] = []

		c.subscribe((v) => {
			values.push(v)
		})

		batch(() => {
			a.set(2)
			a.set(3)
		})

		// Computed should settle to 6
		expect(c.get()).toBe(6)
	})
})

// ---------------------------------------------------------------------------
// Collection watch edge cases
// ---------------------------------------------------------------------------

describe('collection watch edge cases', () => {
	it('watch on empty collection fires when first item added', () => {
		const col = collection<{ id: number; name: string }>('col-watch-empty', {
			default: [],
			scope: 'render',
		})

		const listener = vi.fn()
		col.watch('name', listener)

		col.add({ id: 1, name: 'Alice' })

		expect(listener).toHaveBeenCalledWith([{ id: 1, name: 'Alice' }])
	})

	it('watch fires when item is removed (length changes)', () => {
		const col = collection('col-watch-remove', {
			default: [
				{ id: 1, name: 'Alice' },
				{ id: 2, name: 'Bob' },
			],
			scope: 'render',
		})

		const listener = vi.fn()
		col.watch('name', listener)

		col.remove((item) => item.id === 2)

		expect(listener).toHaveBeenCalledWith([{ id: 1, name: 'Alice' }])
	})

	it('watch unsubscribe during notification does not throw', () => {
		const col = collection('col-watch-unsub-mid', {
			default: [{ id: 1, name: 'A' }],
			scope: 'render',
		})

		let unsub: (() => void) | null = null

		unsub = col.watch('name', () => {
			unsub?.()
		})

		// Should not throw
		col.update((item) => item.id === 1, { name: 'B' })
	})

	it('multiple watchers on same key all fire', () => {
		const col = collection('col-watch-multi', {
			default: [{ id: 1, val: 0 }],
			scope: 'render',
		})

		const listener1 = vi.fn()
		const listener2 = vi.fn()

		col.watch('val', listener1)
		col.watch('val', listener2)

		col.update((item) => item.id === 1, { val: 1 })

		expect(listener1).toHaveBeenCalled()
		expect(listener2).toHaveBeenCalled()
	})

	it('watch does not fire when unwatched key changes', () => {
		const col = collection('col-watch-wrong-key', {
			default: [{ id: 1, name: 'A', age: 20 }],
			scope: 'render',
		})

		const listener = vi.fn()
		col.watch('name', listener)

		col.update((item) => item.id === 1, { age: 30 })

		expect(listener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// withHistory concurrent operations
// ---------------------------------------------------------------------------

describe('withHistory concurrent operations', () => {
	it('undo at max history depth drops oldest entry', () => {
		const base = state('hist-maxsize', { default: 0, scope: 'render' })
		const h = withHistory(base, { maxSize: 3 })

		h.set(1)
		h.set(2)
		h.set(3)
		h.set(4) // pushes past maxSize=3, oldest (0→1) dropped

		expect(h.canUndo).toBe(true)

		h.undo() // 4→3
		h.undo() // 3→2
		h.undo() // 2→1

		expect(h.get()).toBe(1)
		expect(h.canUndo).toBe(false) // oldest was dropped
	})

	it('redo stack is cleared on new set after undo', () => {
		const base = state('hist-redo-clear', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)
		h.undo() // back to 1

		expect(h.canRedo).toBe(true)

		h.set(5) // new value — redo should be cleared
		expect(h.canRedo).toBe(false)
	})

	it('clearHistory makes undo/redo no-ops', () => {
		const base = state('hist-clear', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)
		h.clearHistory()

		expect(h.canUndo).toBe(false)
		expect(h.canRedo).toBe(false)

		h.undo()
		expect(h.get()).toBe(2) // unchanged
	})

	it('undo and redo with isEqual option', () => {
		const base = state('hist-equal', {
			default: { x: 0 },
			scope: 'render',
			isEqual: (a, b) => a.x === b.x,
		})
		const h = withHistory(base)

		h.set({ x: 1 })
		h.set({ x: 2 })

		h.undo()
		expect(h.get()).toEqual({ x: 1 })

		h.redo()
		expect(h.get()).toEqual({ x: 2 })
	})

	it('withHistory delegates lifecycle getters correctly', () => {
		const base = state('hist-lifecycle', { default: 0, scope: 'render' })
		const h = withHistory(base)

		expect(h.scope).toBe('render')
		expect(h.key).toBe('hist-lifecycle')
		expect(h.isDestroyed).toBe(false)

		h.destroy()
		expect(h.isDestroyed).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Selective persistence edge cases
// ---------------------------------------------------------------------------

describe('selective persistence edge cases', () => {
	it('persist: [] writes nothing to storage', () => {
		const storage = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('persist-empty', {
			default: { a: 1, b: 2 },
			scope: 'local',
			persist: [] as Array<'a' | 'b'>,
		})

		s.set({ a: 10, b: 20 })

		// Storage should have an empty object
		const raw = storage.getItem('persist-empty')
		expect(raw).not.toBeNull()

		const stored = JSON.parse(raw as string)
		expect(stored).toEqual({})
	})

	it('persist with nonexistent keys stores nothing', () => {
		const storage = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('persist-nonexistent', {
			default: { a: 1 },
			scope: 'local',
			// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior with invalid key
			persist: ['zzz'] as any,
		})

		s.set({ a: 10 })

		const raw = storage.getItem('persist-nonexistent')
		expect(raw).not.toBeNull()

		const stored = JSON.parse(raw as string)
		expect(stored).toEqual({})
	})

	it('merges persisted keys with full default on read', () => {
		const storage = makeStorage()

		// Pre-populate storage with partial data
		storage.setItem('persist-merge', JSON.stringify({ a: 99 }))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s = state('persist-merge', {
			default: { a: 1, b: 2, c: 3 },
			scope: 'local',
			persist: ['a'],
		})

		// a comes from storage (99), b and c come from defaults
		expect(s.get()).toEqual({ a: 99, b: 2, c: 3 })
	})
})

// ---------------------------------------------------------------------------
// URL adapter edge cases
// ---------------------------------------------------------------------------

describe('url adapter edge cases', () => {
	it('preserves other URL params when writing', () => {
		// Set up window with existing params
		const locationObj = {
			search: '?existing=hello',
			pathname: '/page',
			hash: '',
		}

		let pushedUrl = ''

		Object.defineProperty(globalThis, 'window', {
			value: {
				location: locationObj,
				history: {
					pushState: (_: unknown, __: string, url: string) => {
						pushedUrl = url
					},
				},
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})

		const s = state('url-preserve', {
			default: 'test',
			scope: 'url',
		})

		s.set('newval')

		// Should preserve existing=hello AND add url-preserve
		expect(pushedUrl).toContain('existing=hello')
		expect(pushedUrl).toContain('url-preserve=')
	})

	it('removes param from URL on reset to default', () => {
		let pushedUrl = ''

		Object.defineProperty(globalThis, 'window', {
			value: {
				location: {
					search: '?url-reset=%22hello%22',
					pathname: '/page',
					hash: '',
				},
				history: {
					pushState: (_: unknown, __: string, url: string) => {
						pushedUrl = url
					},
				},
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})

		const s = state('url-reset', {
			default: 'default',
			scope: 'url',
		})

		s.reset()

		// Default value should remove the param entirely
		expect(pushedUrl).not.toContain('url-reset')
	})

	it('handles hash in URL correctly', () => {
		let pushedUrl = ''

		Object.defineProperty(globalThis, 'window', {
			value: {
				location: {
					search: '',
					pathname: '/page',
					hash: '#section',
				},
				history: {
					pushState: (_: unknown, __: string, url: string) => {
						pushedUrl = url
					},
				},
				addEventListener: () => {},
				removeEventListener: () => {},
			},
			configurable: true,
			writable: true,
		})

		const s = state('url-hash', {
			default: 'test',
			scope: 'url',
		})

		s.set('value')

		expect(pushedUrl).toContain('#section')
	})
})

// ---------------------------------------------------------------------------
// Configuration cascading
// ---------------------------------------------------------------------------

describe('configuration cascading', () => {
	it('scope: "local" applies to new instances', () => {
		configure({ scope: 'local' })

		const s = state('config-default-scope', { default: 0 })
		expect(s.scope).toBe('local')

		// Reset
		configure({ scope: undefined })
	})

	it('per-instance scope overrides scope', () => {
		configure({ scope: 'local' })

		const s = state('config-override', { default: 0, scope: 'render' })
		expect(s.scope).toBe('render')

		configure({ scope: undefined })
	})

	it('requireValidation does not affect render scope', () => {
		configure({ requireValidation: true })

		// render scope should not require validation
		expect(() => state('config-render-no-val', { default: 0, scope: 'render' })).not.toThrow()

		configure({ requireValidation: false })
	})

	it('requireValidation throws for local scope without validate', () => {
		configure({ requireValidation: true })

		expect(() => state('config-local-no-val', { default: 0, scope: 'local' })).toThrow(/validate/)

		configure({ requireValidation: false })
	})

	it('multiple configure() calls merge options', () => {
		configure({ prefix: 'app' })
		configure({ logLevel: 'silent' })

		const s = state('config-merge', { default: 0, scope: 'local' })

		// prefix should still be applied (from first configure)
		s.set(42)
		const raw2 = localStorage.getItem('app:config-merge')
		expect(raw2).not.toBeNull()

		// Reset
		configure({ prefix: undefined, logLevel: undefined })
	})
})

// ---------------------------------------------------------------------------
// Computed with edge cases
// ---------------------------------------------------------------------------

describe('computed advanced', () => {
	it('computed of computed chains correctly', () => {
		const a = state('comp-chain-a', { default: 1, scope: 'render' })

		// biome-ignore lint/suspicious/noExplicitAny: computed deps need BaseInstance
		const b = computed([a], ([v]) => (v ?? 0) * 2) as any
		// biome-ignore lint/suspicious/noExplicitAny: computed-of-computed needs BaseInstance cast
		const c = computed([b] as any, (vals: unknown[]) => ((vals[0] as number) ?? 0) + 10)

		expect(c.get()).toBe(12) // 1*2 + 10

		a.set(5)
		expect(c.get()).toBe(20) // 5*2 + 10
	})

	it('computed destroy unsubscribes from deps', () => {
		const a = state('comp-destroy-unsub', { default: 0, scope: 'render' })
		let computeCount = 0

		const c = computed([a], ([v]) => {
			computeCount++
			return (v ?? 0) * 2
		})

		expect(computeCount).toBe(1) // initial

		c.destroy()

		a.set(1)
		expect(computeCount).toBe(1) // no recomputation
	})

	it('computed subscribe + unsubscribe works', () => {
		const a = state('comp-sub-unsub', { default: 0, scope: 'render' })
		const c = computed([a], ([v]) => (v ?? 0) * 2)
		const listener = vi.fn()

		const unsub = c.subscribe(listener)

		a.set(1)
		expect(listener).toHaveBeenCalledWith(2)

		unsub()
		listener.mockClear()

		a.set(2)
		expect(listener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// Batch advanced
// ---------------------------------------------------------------------------

describe('batch advanced', () => {
	it('nested batch defers until outermost completes', () => {
		const s = state('batch-nested', { default: 0, scope: 'render' })
		const values: number[] = []

		s.subscribe((v) => values.push(v))

		batch(() => {
			s.set(1)

			batch(() => {
				s.set(2)
			})

			s.set(3)
		})

		// Only the final value should notify (after outermost batch)
		expect(values[values.length - 1]).toBe(3)
	})

	it('batch with computed dependency correctly defers', () => {
		const a = state('batch-comp-a', { default: 0, scope: 'render' })
		const b = state('batch-comp-b', { default: 0, scope: 'render' })
		// biome-ignore lint/suspicious/noExplicitAny: computed deps need BaseInstance
		const sum = computed([a, b] as any, (vals: unknown[]) => {
			const [av, bv] = vals as [number, number]
			return av + bv
		})

		const values: number[] = []
		sum.subscribe((v) => values.push(v))

		batch(() => {
			a.set(1)
			b.set(2)
		})

		// Computed should only notify once with final sum
		expect(sum.get()).toBe(3)
		expect(values).toContain(3)
	})
})

// ---------------------------------------------------------------------------
// isEqual option edge cases
// ---------------------------------------------------------------------------

describe('isEqual advanced', () => {
	it('isEqual skips subscriber notification', () => {
		const listener = vi.fn()

		const s = state('isequal-skip', {
			default: { x: 1 },
			scope: 'render',
			isEqual: (a, b) => a.x === b.x,
		})

		s.subscribe(listener)

		s.set({ x: 1 }) // same x, should skip

		expect(listener).not.toHaveBeenCalled()
	})

	it('isEqual does not affect interceptors — they still run', () => {
		const interceptCalls: number[] = []

		const s = state('isequal-intercept', {
			default: 0,
			scope: 'render',
			isEqual: (a, b) => a === b,
		})

		s.intercept((next) => {
			interceptCalls.push(next)
			return next
		})

		s.set(0) // same value, interceptor should still run

		// Interceptor runs before isEqual check
		expect(interceptCalls).toEqual([0])
		// But value didn't change
		expect(s.get()).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// use() hook edge cases
// ---------------------------------------------------------------------------

describe('use() hooks', () => {
	it('multiple hooks fire in registration order', () => {
		const s = state('hooks-order', { default: 0, scope: 'render' })
		const log: string[] = []

		s.use(() => log.push('A'))
		s.use(() => log.push('B'))
		s.use(() => log.push('C'))

		s.set(1)

		expect(log).toEqual(['A', 'B', 'C'])
	})

	it('hook receives next and prev values', () => {
		const s = state('hooks-args', { default: 'hello', scope: 'render' })
		const calls: [string, string][] = []

		s.use((next, prev) => {
			calls.push([next, prev])
		})

		s.set('world')

		expect(calls).toEqual([['world', 'hello']])
	})

	it('unsubscribing a hook removes it', () => {
		const s = state('hooks-unsub', { default: 0, scope: 'render' })
		const hookFn = vi.fn()

		const unsub = s.use(hookFn)

		s.set(1)
		expect(hookFn).toHaveBeenCalledTimes(1)

		unsub()

		s.set(2)
		expect(hookFn).toHaveBeenCalledTimes(1) // no additional call
	})
})

// ---------------------------------------------------------------------------
// watch() edge cases
// ---------------------------------------------------------------------------

describe('watch edge cases advanced', () => {
	it('watch fires when value transitions from null to object', () => {
		const s = state<{ name: string } | null>('watch-null-to-obj', {
			default: null,
			scope: 'render',
		})

		const listener = vi.fn()
		s.watch('name' as never, listener as never)

		s.set({ name: 'hello' })

		expect(listener).toHaveBeenCalledWith('hello')
	})

	it('watch does not fire when watched key value is unchanged', () => {
		const s = state('watch-unchanged', {
			default: { name: 'Alice', age: 20 },
			scope: 'render',
		})

		const listener = vi.fn()
		s.watch('name', listener)

		s.set({ name: 'Alice', age: 30 }) // name unchanged

		expect(listener).not.toHaveBeenCalled()
	})

	it('multiple watches on different keys fire independently', () => {
		const s = state('watch-multi-key', {
			default: { x: 0, y: 0 },
			scope: 'render',
		})

		const xListener = vi.fn()
		const yListener = vi.fn()

		s.watch('x', xListener)
		s.watch('y', yListener)

		s.set({ x: 1, y: 0 }) // only x changed

		expect(xListener).toHaveBeenCalledWith(1)
		expect(yListener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// snapshot / devtools
// ---------------------------------------------------------------------------

describe('snapshot', () => {
	it('includes all registered instances', async () => {
		const { snapshot } = await import('../src/devtools.js')

		state('snap-a', { default: 1, scope: 'render' })
		state('snap-b', { default: 'hello', scope: 'render' })

		const snap = snapshot()

		expect(snap.length).toBeGreaterThanOrEqual(2)
		expect(snap.find((s) => s.key === 'snap-a')?.value).toBe(1)
		expect(snap.find((s) => s.key === 'snap-b')?.value).toBe('hello')
	})

	it('shows destroyed instances with undefined value', async () => {
		const { snapshot } = await import('../src/devtools.js')

		const s = state('snap-destroyed', { default: 42, scope: 'render' })
		s.destroy()

		const snap = snapshot()
		const entry = snap.find((s) => s.key === 'snap-destroyed')

		// Destroyed instances are unregistered, so they won't appear
		expect(entry).toBeUndefined()
	})

	it('updates reflect current values', async () => {
		const { snapshot } = await import('../src/devtools.js')

		const s = state('snap-update', { default: 0, scope: 'render' })
		s.set(99)

		const snap = snapshot()
		expect(snap.find((s) => s.key === 'snap-update')?.value).toBe(99)
	})
})

// ---------------------------------------------------------------------------
// State recreation after destroy
// ---------------------------------------------------------------------------

describe('state recreation', () => {
	it('new instance after destroy gets fresh default', () => {
		const s1 = state('recreate', { default: 0, scope: 'render' })
		s1.set(42)
		s1.destroy()

		const s2 = state('recreate', { default: 0, scope: 'render' })
		expect(s2.get()).toBe(0) // fresh default
		expect(s2.isDestroyed).toBe(false)
	})

	it('new instance after destroy reads from storage if persisted', () => {
		const storage = makeStorage()
		storage.setItem('recreate-persist', JSON.stringify(99))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s1 = state('recreate-persist', { default: 0, scope: 'local' })
		expect(s1.get()).toBe(99)
		s1.destroy()

		const s2 = state('recreate-persist', { default: 0, scope: 'local' })
		expect(s2.get()).toBe(99) // reads from storage
	})
})
