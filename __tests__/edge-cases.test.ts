import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterceptorError } from '../src/errors.js'
import { batch, collection, computed, configure, effect, state, withHistory } from '../src/index.js'
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
		const s = state('listener-err', { default: 0, scope: 'memory' })

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
		const s = state('intercept-err', { default: 0, scope: 'memory' })

		s.intercept(() => {
			throw new Error('interceptor boom')
		})

		expect(() => s.set(1)).toThrow('Interceptor threw')
		expect(s.get()).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// Destroyed instance behavior
// ---------------------------------------------------------------------------

describe('destroyed instance', () => {
	it('set() is a no-op after destroy', () => {
		const s = state('destroyed-set', { default: 0, scope: 'memory' })

		s.destroy()
		s.set(42)

		expect(s.get()).toBe(0)
	})

	it('reset() is a no-op after destroy', () => {
		const s = state('destroyed-reset', { default: 0, scope: 'memory' })

		s.set(5)
		s.destroy()
		s.reset()

		expect(s.get()).toBe(5)
	})

	it('destroyed promise resolves after destroy()', async () => {
		const s = state('destroyed-promise', { default: 0, scope: 'memory' })

		s.destroy()

		await expect(s.destroyed).resolves.toBeUndefined()
	})

	it('multiple destroy() calls are safe', () => {
		const s = state('destroyed-multi', { default: 0, scope: 'memory' })

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

		const a = state('comp-peek-a', { default: 1, scope: 'memory' })

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
		const a = state('comp-destroyed-dep', { default: 1, scope: 'memory' })

		const c = computed([a], ([v]) => (v ?? 0) * 2)

		expect(c.get()).toBe(2)

		a.destroy()

		// Should still return last known value
		expect(c.get()).toBe(2)
	})

	it('diamond dependency computes correctly within a batch', () => {
		const a = state('diamond-a', { default: 1, scope: 'memory' })

		const b = computed([a], ([v]) => (v ?? 0) * 2)
		const c = computed([a], ([v]) => (v ?? 0) * 3)

		const d = computed([b, c], ([bv, cv]) => (bv ?? 0) + (cv ?? 0))

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

		const a = state('effect-cleanup', { default: 0, scope: 'memory' })

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
		const a = state('effect-stop', { default: 0, scope: 'memory' })

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
			scope: 'memory',
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
			scope: 'memory',
		})

		col.update((item) => item.id === 999, { name: 'b' })

		expect(col.get()).toEqual([{ id: 1, name: 'a' }])
	})

	it('clear() empties the collection', () => {
		const col = collection('col-clear', {
			default: [1, 2, 3],
			scope: 'memory',
		})

		col.clear()

		expect(col.get()).toEqual([])
		expect(col.size).toBe(0)
	})

	it('find returns undefined when nothing matches', () => {
		const col = collection('col-find', {
			default: [1, 2, 3],
			scope: 'memory',
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
			scope: 'memory',
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
		const base = state('hist-intercept-err', { default: 0, scope: 'memory' })

		const h = withHistory(base)

		h.set(1)
		h.set(2)

		// Add a throwing interceptor
		const unsub = base.intercept(() => {
			throw new Error('nope')
		})

		// undo should throw but isNavigating should reset
		expect(() => h.undo()).toThrow('Interceptor threw')

		// Remove the bad interceptor
		unsub()

		// History should still be functional — isNavigating was reset via try/finally
		h.set(3)
		expect(h.get()).toBe(3)
		expect(h.canUndo).toBe(true)
	})

	it('reset is tracked in history', () => {
		const base = state('hist-reset', { default: 0, scope: 'memory' })

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
		const s = state('batch-throw', { default: 0, scope: 'memory' })

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
	it('compares Date objects by timestamp', async () => {
		const { shallowEqual } = await import('../src/utils.js')

		// Dates with the same timestamp are equal
		expect(shallowEqual(new Date(0), new Date(0))).toBe(true)

		// Date vs plain object returns false
		expect(shallowEqual(new Date(0), {})).toBe(false)
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

// ---------------------------------------------------------------------------
// Config callback isolation
// ---------------------------------------------------------------------------

describe('config callback isolation', () => {
	beforeEach(() => {
		configure({
			onIntercept: undefined,
			onChange: undefined,
			onReset: undefined,
			onDestroy: undefined,
			onError: undefined,
		})
	})

	it('throwing onIntercept does not crash set()', () => {
		configure({
			onIntercept: () => {
				throw new Error('onIntercept boom')
			},
		})

		const s = state('cfg-intercept-err', { default: 0, scope: 'memory' })

		s.intercept((next) => next + 1)

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		s.set(5)

		expect(s.get()).toBe(6)
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
	})

	it('throwing onChange does not crash set()', () => {
		configure({
			onChange: () => {
				throw new Error('onChange boom')
			},
		})

		const s = state('cfg-onchange-err', { default: 0, scope: 'memory' })

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		s.set(42)

		expect(s.get()).toBe(42)
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
	})

	it('throwing onReset does not crash reset()', () => {
		configure({
			onReset: () => {
				throw new Error('onReset boom')
			},
		})

		const s = state('cfg-onreset-err', { default: 0, scope: 'memory' })

		s.set(10)

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		s.reset()

		expect(s.get()).toBe(0)
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
	})

	it('throwing onDestroy does not crash destroy()', () => {
		configure({
			onDestroy: () => {
				throw new Error('onDestroy boom')
			},
		})

		const s = state('cfg-ondestroy-err', { default: 0, scope: 'memory' })

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		s.destroy()

		expect(s.isDestroyed).toBe(true)
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
	})
})

// ---------------------------------------------------------------------------
// Interceptor error reporting
// ---------------------------------------------------------------------------

describe('interceptor error reporting', () => {
	beforeEach(() => {
		configure({
			onError: undefined,
		})
	})

	it('throwing interceptor triggers onError before propagating', () => {
		const onError = vi.fn()

		configure({ onError })

		const s = state('intercept-report', { default: 0, scope: 'memory' })

		s.intercept(() => {
			throw new Error('interceptor fail')
		})

		expect(() => s.set(1)).toThrow('Interceptor threw')
		expect(s.get()).toBe(0)
		expect(onError).toHaveBeenCalledWith({
			key: 'intercept-report',
			scope: 'memory',
			error: expect.any(InterceptorError),
		})
	})

	it('throwing interceptor on reset() triggers onError before propagating', () => {
		const onError = vi.fn()

		configure({ onError })

		const s = state('intercept-report-reset', { default: 0, scope: 'memory' })

		s.set(5)

		s.intercept(() => {
			throw new Error('interceptor reset fail')
		})

		expect(() => s.reset()).toThrow('Interceptor threw')
		expect(s.get()).toBe(5)
		expect(onError).toHaveBeenCalledWith({
			key: 'intercept-report-reset',
			scope: 'memory',
			error: expect.any(InterceptorError),
		})
	})
})
