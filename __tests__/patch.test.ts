import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, state } from '../src/index.js'
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
// Basic functionality
// ---------------------------------------------------------------------------

describe('patch', () => {
	it('updates only specified keys and preserves others', () => {
		const store = state('patch-basic', { default: { a: 1, b: 2, c: 3 } })

		store.patch({ a: 10 })

		expect(store.get()).toEqual({ a: 10, b: 2, c: 3 })

		store.destroy()
	})

	it('updates multiple keys at once', () => {
		const store = state('patch-multi', { default: { a: 1, b: 2, c: 3 } })

		store.patch({ a: 10, c: 30 })

		expect(store.get()).toEqual({ a: 10, b: 2, c: 30 })

		store.destroy()
	})

	it('sequential patches accumulate correctly', () => {
		const store = state('patch-seq', { default: { a: 1, b: 2 } })

		store.patch({ a: 10 })
		store.patch({ b: 20 })

		expect(store.get()).toEqual({ a: 10, b: 20 })

		store.destroy()
	})

	it('is a no-op on a destroyed instance', () => {
		const store = state('patch-destroyed', { default: { a: 1 } })

		store.destroy()

		store.patch({ a: 99 })

		// Should still be original value (lastValue snapshot)
		expect(store.get()).toEqual({ a: 1 })
	})

	// ---------------------------------------------------------------------------
	// Subscriber / listener integration
	// ---------------------------------------------------------------------------

	it('triggers subscribe listeners', () => {
		const store = state('patch-sub', { default: { a: 1, b: 2 } })

		const listener = vi.fn()

		store.subscribe(listener)

		store.patch({ a: 10 })

		expect(listener).toHaveBeenCalledWith({ a: 10, b: 2 })

		store.destroy()
	})

	it('triggers onChange handlers', () => {
		const store = state('patch-onchange', { default: { a: 1, b: 2 } })

		const handler = vi.fn()

		store.onChange(handler)

		store.patch({ a: 10 })

		expect(handler).toHaveBeenCalledWith({ a: 10, b: 2 }, { a: 1, b: 2 })

		store.destroy()
	})

	it('triggers interceptors', () => {
		const store = state('patch-intercept', { default: { a: 1, b: 2 } })

		store.intercept((next) => ({ ...next, b: 999 }))

		store.patch({ a: 10 })

		expect(store.get()).toEqual({ a: 10, b: 999 })

		store.destroy()
	})

	it('respects isEqual', () => {
		const listener = vi.fn()

		const store = state('patch-isequal', {
			default: { a: 1, b: 2 },
			isEqual: (a, b) => a.a === b.a && a.b === b.b,
		})

		store.subscribe(listener)

		store.patch({ a: 1 }) // same value

		expect(listener).not.toHaveBeenCalled()

		store.destroy()
	})

	// ---------------------------------------------------------------------------
	// Watch integration
	// ---------------------------------------------------------------------------

	it('watch fires only for changed keys', () => {
		const store = state('patch-watch', { default: { a: 1, b: 2 } })

		const watchA = vi.fn()
		const watchB = vi.fn()

		store.watch('a', watchA)
		store.watch('b', watchB)

		store.patch({ a: 10 })

		expect(watchA).toHaveBeenCalledWith(10)
		expect(watchB).not.toHaveBeenCalled()

		store.destroy()
	})

	// ---------------------------------------------------------------------------
	// Scope coverage
	// ---------------------------------------------------------------------------

	it('works with memory scope (RenderStateImpl)', () => {
		const store = state('patch-memory', { default: { x: 'a', y: 'b' }, scope: 'memory' })

		store.patch({ x: 'z' })

		expect(store.get()).toEqual({ x: 'z', y: 'b' })

		store.destroy()
	})

	it('works with local scope (StateImpl)', () => {
		const store = state('patch-local', { default: { x: 'a', y: 'b' }, scope: 'local' })

		store.patch({ x: 'z' })

		expect(store.get()).toEqual({ x: 'z', y: 'b' })

		store.destroy()
	})

	// ---------------------------------------------------------------------------
	// Batching
	// ---------------------------------------------------------------------------

	it('works inside batch()', () => {
		const store = state('patch-batch', { default: { a: 1, b: 2 } })

		const listener = vi.fn()

		store.subscribe(listener)

		batch(() => {
			store.patch({ a: 10 })
			store.patch({ b: 20 })
		})

		// Listener should have been called (batching coalesces notifications)
		expect(store.get()).toEqual({ a: 10, b: 20 })

		store.destroy()
	})

	// ---------------------------------------------------------------------------
	// Strict mode
	// ---------------------------------------------------------------------------

	it('strict mode ignores unknown keys', () => {
		const store = state('patch-strict-ignore', {
			default: { a: 1, b: 2 } as Record<string, number>,
		})

		store.patch({ a: 10, unknown: 99 }, { strict: true })

		expect(store.get()).toEqual({ a: 10, b: 2 })

		store.destroy()
	})

	it('strict mode logs a warning for unknown keys', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const store = state('patch-strict-warn', {
			default: { a: 1 } as Record<string, number>,
		})

		store.patch({ nope: 99 }, { strict: true })

		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ignored unknown key "nope"'))

		warnSpy.mockRestore()

		store.destroy()
	})

	it('default mode merges unknown keys without warning', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const store = state('patch-default-unknown', {
			default: { a: 1 } as Record<string, number>,
		})

		store.patch({ extra: 42 })

		expect(store.get()).toEqual({ a: 1, extra: 42 })
		expect(warnSpy).not.toHaveBeenCalled()

		warnSpy.mockRestore()

		store.destroy()
	})
})
