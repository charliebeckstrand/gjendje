import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'
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
})

// ---------------------------------------------------------------------------
// mutate() — zero-copy in-place updates
// ---------------------------------------------------------------------------

describe('mutate()', () => {
	it('modifies value in place and notifies subscribers (memory scope)', () => {
		const s = state('mutate-mem-1', { default: { count: 0, label: 'hi' } })

		const listener = vi.fn()

		s.subscribe(listener)

		s.mutate((draft) => {
			draft.count = 42
		})

		expect(s.get()).toEqual({ count: 42, label: 'hi' })
		expect(listener).toHaveBeenCalledTimes(1)

		s.destroy()
	})

	it('modifies value in place and notifies subscribers (local scope)', () => {
		const s = state('mutate-local-1', { default: { count: 0, label: 'hi' }, scope: 'local' })

		const listener = vi.fn()

		s.subscribe(listener)

		s.mutate((draft) => {
			draft.count = 42
		})

		expect(s.get()).toEqual({ count: 42, label: 'hi' })
		expect(listener).toHaveBeenCalledTimes(1)

		s.destroy()
	})

	it('bypasses isEqual (memory scope)', () => {
		const isEqual = vi.fn(() => true)

		const s = state('mutate-eq-mem', { default: { x: 1 }, isEqual })

		const listener = vi.fn()

		s.subscribe(listener)

		s.mutate((draft) => {
			draft.x = 2
		})

		// isEqual should NOT have been called at all
		expect(isEqual).not.toHaveBeenCalled()
		expect(listener).toHaveBeenCalledTimes(1)
		expect(s.get().x).toBe(2)

		s.destroy()
	})

	it('bypasses isEqual (local scope)', () => {
		const isEqual = vi.fn(() => true)

		const s = state('mutate-eq-local', { default: { x: 1 }, isEqual, scope: 'local' })

		const listener = vi.fn()

		s.subscribe(listener)

		s.mutate((draft) => {
			draft.x = 2
		})

		expect(isEqual).not.toHaveBeenCalled()
		expect(listener).toHaveBeenCalledTimes(1)
		expect(s.get().x).toBe(2)

		s.destroy()
	})

	it('runs interceptors (memory scope)', () => {
		const s = state('mutate-int-mem', { default: { x: 1 } })

		s.intercept((next) => {
			return { ...next, x: next.x * 10 }
		})

		s.mutate((draft) => {
			draft.x = 5
		})

		expect(s.get().x).toBe(50)

		s.destroy()
	})

	it('runs interceptors (local scope)', () => {
		const s = state('mutate-int-local', { default: { x: 1 }, scope: 'local' })

		s.intercept((next) => {
			return { ...next, x: next.x * 10 }
		})

		s.mutate((draft) => {
			draft.x = 5
		})

		expect(s.get().x).toBe(50)

		s.destroy()
	})

	it('fires onChange handlers (memory scope)', () => {
		const s = state('mutate-onchange-mem', { default: { n: 0 } })

		const handler = vi.fn()

		s.onChange(handler)

		s.mutate((draft) => {
			draft.n = 99
		})

		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({ n: 99 }),
			expect.objectContaining({ n: 99 }),
		)

		s.destroy()
	})

	it('fires onChange handlers (local scope)', () => {
		const s = state('mutate-onchange-local', { default: { n: 0 }, scope: 'local' })

		const handler = vi.fn()

		s.onChange(handler)

		s.mutate((draft) => {
			draft.n = 99
		})

		expect(handler).toHaveBeenCalledTimes(1)

		s.destroy()
	})

	it('is a no-op on destroyed instance (memory scope)', () => {
		const s = state('mutate-destroyed-mem', { default: { x: 1 } })

		s.destroy()

		s.mutate((draft) => {
			draft.x = 999
		})

		expect(s.get().x).toBe(1)
	})

	it('is a no-op on destroyed instance (local scope)', () => {
		const s = state('mutate-destroyed-local', { default: { x: 1 }, scope: 'local' })

		s.destroy()

		s.mutate((draft) => {
			draft.x = 999
		})

		expect(s.get().x).toBe(1)
	})

	it('uses same reference (zero-copy)', () => {
		const original = { a: 1, b: 2, c: 3 }
		const s = state('mutate-ref', { default: original })

		const ref = s.get()

		s.mutate((draft) => {
			draft.a = 100
		})

		// The returned object should be the exact same reference
		expect(s.get()).toBe(ref)

		s.destroy()
	})
})
