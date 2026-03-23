import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'
import { shallowEqual } from '../src/utils.js'
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
// shallowEqual utility
// ---------------------------------------------------------------------------

describe('shallowEqual', () => {
	it('returns true for identical primitives', () => {
		expect(shallowEqual(1, 1)).toBe(true)
		expect(shallowEqual('a', 'a')).toBe(true)
		expect(shallowEqual(true, true)).toBe(true)
		expect(shallowEqual(null, null)).toBe(true)
		expect(shallowEqual(undefined, undefined)).toBe(true)
	})

	it('returns false for different primitives', () => {
		expect(shallowEqual(1, 2)).toBe(false)
		expect(shallowEqual('a', 'b')).toBe(false)
		expect(shallowEqual(null, undefined)).toBe(false)
	})

	it('returns true for shallow-equal objects', () => {
		expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
	})

	it('returns false for objects with different values', () => {
		expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
	})

	it('returns false for objects with different keys', () => {
		expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false)
		expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
	})

	it('returns true for shallow-equal arrays', () => {
		expect(shallowEqual([1, 2, 3], [1, 2, 3])).toBe(true)
	})

	it('returns false for arrays with different lengths', () => {
		expect(shallowEqual([1, 2], [1, 2, 3])).toBe(false)
	})

	it('returns false for arrays with different values', () => {
		expect(shallowEqual([1, 2], [1, 3])).toBe(false)
	})

	it('returns false for mixed types', () => {
		expect(shallowEqual([1], { 0: 1 })).toBe(false)
		expect(shallowEqual(1, '1')).toBe(false)
	})

	it('handles NaN correctly', () => {
		expect(shallowEqual(Number.NaN, Number.NaN)).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// isEqual option on state
// ---------------------------------------------------------------------------

describe('isEqual option', () => {
	it('skips set() when isEqual returns true', () => {
		const s = state('eq-test', {
			default: { x: 1, y: 2 },
			scope: 'memory',
			isEqual: (a, b) => a.x === b.x && a.y === b.y,
		})

		const listener = vi.fn()

		s.subscribe(listener)

		// Same structural value — should be skipped
		s.set({ x: 1, y: 2 })

		expect(listener).toHaveBeenCalledTimes(0)
	})

	it('allows set() when isEqual returns false', () => {
		const s = state('eq-test-2', {
			default: { x: 1, y: 2 },
			scope: 'memory',
			isEqual: (a, b) => a.x === b.x && a.y === b.y,
		})

		const listener = vi.fn()

		s.subscribe(listener)

		s.set({ x: 1, y: 3 })

		expect(listener).toHaveBeenCalledTimes(1)
		expect(s.get()).toEqual({ x: 1, y: 3 })
	})

	it('skips reset() when isEqual returns true', () => {
		const s = state('eq-reset', {
			default: { x: 1 },
			scope: 'memory',
			isEqual: (a, b) => a.x === b.x,
		})

		const listener = vi.fn()

		s.subscribe(listener)

		// Already at default — reset should be skipped
		s.reset()

		expect(listener).toHaveBeenCalledTimes(0)
	})

	it('works without isEqual (normal behavior)', () => {
		const s = state('eq-none', {
			default: 0,
			scope: 'memory',
		})

		const listener = vi.fn()

		s.subscribe(listener)

		s.set(0)

		// Without isEqual, even same value triggers notification
		expect(listener).toHaveBeenCalledTimes(1)
	})
})
