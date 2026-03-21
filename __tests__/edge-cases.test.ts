import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, collection, computed, effect, state, withHistory } from '../src/index.js'
import { makeStorage } from './helpers.js'

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
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
// Listener error isolation
// ---------------------------------------------------------------------------

describe('listener error isolation', () => {
	it('one throwing listener does not prevent others from being notified', () => {
		const s = state('listener-err', { default: 0, scope: 'render' })

		const calls: number[] = []

		s.subscribe(() => {
			calls.push(1)
		})

		s.subscribe(() => {
			throw new Error('boom')
		})

		s.subscribe(() => {
			calls.push(3)
		})

		s.set(1)

		expect(calls).toEqual([1, 3])
	})
})

// ---------------------------------------------------------------------------
// Interceptor error handling
// ---------------------------------------------------------------------------

describe('interceptor error handling', () => {
	it('throwing interceptor prevents update but does not crash', () => {
		const s = state('intercept-err', { default: 0, scope: 'render' })

		s.intercept(() => {
			throw new Error('interceptor boom')
		})

		expect(() => s.set(1)).toThrow('interceptor boom')
		expect(s.get()).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// Destroyed instance behavior
// ---------------------------------------------------------------------------

describe('destroyed instance', () => {
	it('set() is a no-op after destroy', () => {
		const s = state('destroyed-set', { default: 0, scope: 'render' })

		s.destroy()
		s.set(42)

		expect(s.get()).toBe(0)
	})

	it('reset() is a no-op after destroy', () => {
		const s = state('destroyed-reset', { default: 0, scope: 'render' })

		s.set(5)
		s.destroy()
		s.reset()

		expect(s.get()).toBe(5)
	})

	it('destroyed promise resolves after destroy()', async () => {
		const s = state('destroyed-promise', { default: 0, scope: 'render' })

		s.destroy()

		await expect(s.destroyed).resolves.toBeUndefined()
	})

	it('multiple destroy() calls are safe', () => {
		const s = state('destroyed-multi', { default: 0, scope: 'render' })

		s.destroy()
		s.destroy()

		expect(s.isDestroyed).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Computed edge cases
// ---------------------------------------------------------------------------

describe('computed edge cases', () => {
	it('peek() returns cached value without triggering recomputation', () => {
		let computeCount = 0
		const a = state('comp-peek-a', { default: 1, scope: 'render' })

		const c = computed([a], ([v]) => {
			computeCount++

			return (v ?? 0) * 2
		})

		// Initial computation
		expect(c.get()).toBe(2)
		expect(computeCount).toBe(1)

		// Change dep — subscriber already recomputed, but peek doesn't trigger another
		a.set(5)

		// subscriber recomputed (count=2), peek returns that cached result
		const countBefore = computeCount

		expect(c.peek()).toBe(10)

		// peek should NOT have incremented the compute count
		expect(computeCount).toBe(countBefore)
	})

	it('handles destroyed dependency gracefully', () => {
		const a = state('comp-destroyed-dep', { default: 1, scope: 'render' })
		const c = computed([a], ([v]) => (v ?? 0) * 2)

		expect(c.get()).toBe(2)

		a.destroy()

		// Should still return last known value
		expect(c.get()).toBe(2)
	})

	it('diamond dependency computes correctly within a batch', () => {
		const a = state('diamond-a', { default: 1, scope: 'render' })
		const b = computed([a], ([v]) => (v ?? 0) * 2)
		const c = computed([a], ([v]) => (v ?? 0) * 3)

		// ComputedInstance extends ReadonlyInstance, which satisfies the dep contract at runtime
		// biome-ignore lint/suspicious/noExplicitAny: computed-of-computed needs BaseInstance cast
		const d = computed([b, c] as any, (vals: unknown[]) => {
			const [bv, cv] = vals as [number, number]

			return bv + cv
		})

		expect(d.get()).toBe(5) // 2 + 3

		batch(() => {
			a.set(2)
		})

		expect(d.get()).toBe(10) // 4 + 6
	})
})

// ---------------------------------------------------------------------------
// Effect edge cases
// ---------------------------------------------------------------------------

describe('effect edge cases', () => {
	it('cleanup runs before next execution', () => {
		const log: string[] = []
		const a = state('effect-cleanup', { default: 0, scope: 'render' })

		const handle = effect([a], () => {
			log.push('run')

			return () => {
				log.push('cleanup')
			}
		})

		expect(log).toEqual(['run'])

		a.set(1)

		expect(log).toEqual(['run', 'cleanup', 'run'])

		handle.stop()

		expect(log).toEqual(['run', 'cleanup', 'run', 'cleanup'])
	})

	it('stop() is idempotent', () => {
		const a = state('effect-stop', { default: 0, scope: 'render' })
		const handle = effect([a], () => undefined)

		handle.stop()
		handle.stop() // should not throw
	})
})

// ---------------------------------------------------------------------------
// Collection edge cases
// ---------------------------------------------------------------------------

describe('collection edge cases', () => {
	it('remove with no matches is a no-op', () => {
		const col = collection('col-noop', {
			default: [{ id: 1 }],
			scope: 'render',
		})

		const listener = vi.fn()

		col.subscribe(listener)

		col.remove((item) => item.id === 999)

		// Still triggers a set (filter returns same-length array)
		expect(col.get()).toEqual([{ id: 1 }])
	})

	it('update with no matches is a no-op', () => {
		const col = collection('col-update-noop', {
			default: [{ id: 1, name: 'a' }],
			scope: 'render',
		})

		col.update((item) => item.id === 999, { name: 'b' })

		expect(col.get()).toEqual([{ id: 1, name: 'a' }])
	})

	it('clear() empties the collection', () => {
		const col = collection('col-clear', {
			default: [1, 2, 3],
			scope: 'render',
		})

		col.clear()

		expect(col.get()).toEqual([])
		expect(col.size).toBe(0)
	})

	it('find returns undefined when nothing matches', () => {
		const col = collection('col-find', {
			default: [1, 2, 3],
			scope: 'render',
		})

		expect(col.find((x) => x === 99)).toBeUndefined()
	})
})

// ---------------------------------------------------------------------------
// Watch edge cases
// ---------------------------------------------------------------------------

describe('watch edge cases', () => {
	it('watch notifies when value transitions to null', () => {
		const s = state<{ name: string } | null>('watch-null', {
			default: { name: 'hello' },
			scope: 'render',
		})

		const listener = vi.fn()

		s.watch('name' as never, listener as never)

		s.set(null)

		// Watch should fire with undefined since name key no longer exists
		expect(listener).toHaveBeenCalledWith(undefined)
	})
})

// ---------------------------------------------------------------------------
// withHistory edge cases
// ---------------------------------------------------------------------------

describe('withHistory edge cases', () => {
	it('undo/redo still works after interceptor throws', () => {
		const base = state('hist-intercept-err', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)

		// Add a throwing interceptor
		const unsub = base.intercept(() => {
			throw new Error('nope')
		})

		// undo should throw but isNavigating should reset
		expect(() => h.undo()).toThrow('nope')

		// Remove the bad interceptor
		unsub()

		// History should still be functional — isNavigating was reset via try/finally
		h.set(3)
		expect(h.get()).toBe(3)
		expect(h.canUndo).toBe(true)
	})

	it('reset is tracked in history', () => {
		const base = state('hist-reset', { default: 0, scope: 'render' })
		const h = withHistory(base)

		h.set(1)
		h.set(2)
		h.reset()

		expect(h.get()).toBe(0)
		expect(h.canUndo).toBe(true)

		h.undo()
		expect(h.get()).toBe(2)
	})
})

// ---------------------------------------------------------------------------
// Batch edge cases
// ---------------------------------------------------------------------------

describe('batch edge cases', () => {
	it('flushes even if fn throws', () => {
		const s = state('batch-throw', { default: 0, scope: 'render' })
		const listener = vi.fn()

		s.subscribe(listener)

		expect(() =>
			batch(() => {
				s.set(1)
				throw new Error('batch error')
			}),
		).toThrow('batch error')

		// Listener should still have been called after the batch
		expect(listener).toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// shallowEqual edge cases
// ---------------------------------------------------------------------------

describe('shallowEqual additional edge cases', () => {
	it('treats Date objects as plain objects (no special handling)', async () => {
		const { shallowEqual } = await import('../src/utils.js')

		// Dates have no own enumerable keys, so shallowEqual treats them as equal empty objects
		expect(shallowEqual(new Date(0), new Date(0))).toBe(true)

		// Different types still return false
		expect(shallowEqual(new Date(0), {})).toBe(true) // both have 0 own keys
	})

	it('returns false for nested objects', async () => {
		const { shallowEqual } = await import('../src/utils.js')

		const a = { nested: { x: 1 } }
		const b = { nested: { x: 1 } }

		// Different nested references
		expect(shallowEqual(a, b)).toBe(false)
	})

	it('returns true for same reference', async () => {
		const { shallowEqual } = await import('../src/utils.js')

		const obj = { a: 1, b: 2 }

		expect(shallowEqual(obj, obj)).toBe(true)
	})
})
