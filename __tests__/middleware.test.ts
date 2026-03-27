import { describe, expect, it, vi } from 'vitest'
import { collection, state } from '../src/index.js'

describe('intercept', () => {
	it('transforms the value before set', () => {
		const count = state('intercept-transform', { default: 0 })

		count.intercept((next) => Math.min(next, 10))

		count.set(5)

		expect(count.get()).toBe(5)

		count.set(20)

		expect(count.get()).toBe(10)

		count.destroy()
	})

	it('can reject an update by returning prev', () => {
		const count = state('intercept-reject', { default: 0 })

		count.intercept((next, prev) => (next < 0 ? prev : next))

		count.set(5)

		expect(count.get()).toBe(5)

		count.set(-1)

		expect(count.get()).toBe(5)

		count.destroy()
	})

	it('chains multiple interceptors in registration order', () => {
		const count = state('intercept-chain', { default: 0 })

		count.intercept((next) => next + 1)
		count.intercept((next) => next * 2)

		count.set(5)

		// 5 → +1 → 6 → *2 → 12
		expect(count.get()).toBe(12)

		count.destroy()
	})

	it('runs on reset too', () => {
		const count = state('intercept-reset', { default: 0 })

		count.set(5)

		count.intercept((next) => next + 100)

		count.reset()

		// default is 0, interceptor adds 100
		expect(count.get()).toBe(100)

		count.destroy()
	})

	it('returns an unsubscribe function', () => {
		const count = state('intercept-unsub', { default: 0 })

		const unsub = count.intercept((next) => next * 2)

		count.set(5)

		expect(count.get()).toBe(10)

		unsub()

		count.set(5)

		expect(count.get()).toBe(5)

		count.destroy()
	})

	it('does not run after destroy', () => {
		const count = state('intercept-destroy', { default: 0 })

		const fn = vi.fn((next: number) => next)

		count.intercept(fn)

		count.destroy()

		count.set(5)

		expect(fn).not.toHaveBeenCalled()
	})

	it('receives prev as the current adapter value', () => {
		const count = state('intercept-prev', { default: 0 })

		const calls: Array<[number, number]> = []

		count.intercept((next, prev) => {
			calls.push([next, prev])

			return next
		})

		count.set(1)
		count.set(2)

		expect(calls).toEqual([
			[1, 0],
			[2, 1],
		])

		count.destroy()
	})
})

describe('onChange', () => {
	it('fires after set with next and prev', () => {
		const count = state('onChange-basic', { default: 0 })

		const calls: Array<[number, number]> = []

		count.onChange((next, prev) => {
			calls.push([next, prev])
		})

		count.set(1)
		count.set(2)

		expect(calls).toEqual([
			[1, 0],
			[2, 1],
		])

		count.destroy()
	})

	it('fires after reset', () => {
		const count = state('onChange-reset', { default: 0 })

		count.set(5)

		const calls: Array<[number, number]> = []

		count.onChange((next, prev) => {
			calls.push([next, prev])
		})

		count.reset()

		expect(calls).toEqual([[0, 5]])

		count.destroy()
	})

	it('receives the intercepted value, not the original', () => {
		const count = state('onChange-after-intercept', { default: 0 })

		count.intercept((next) => next * 2)

		const received: number[] = []

		count.onChange((next) => {
			received.push(next)
		})

		count.set(5)

		// interceptor doubles: 5 → 10
		expect(received).toEqual([10])

		count.destroy()
	})

	it('returns an unsubscribe function', () => {
		const count = state('onChange-unsub', { default: 0 })

		const fn = vi.fn()

		const unsub = count.onChange(fn)

		count.set(1)

		expect(fn).toHaveBeenCalledTimes(1)

		unsub()

		count.set(2)

		expect(fn).toHaveBeenCalledTimes(1)

		count.destroy()
	})

	it('does not fire after destroy', () => {
		const count = state('onChange-destroy', { default: 0 })

		const fn = vi.fn()

		count.onChange(fn)

		count.destroy()

		count.set(5)

		expect(fn).not.toHaveBeenCalled()
	})

	it('multiple handlers fire in registration order', () => {
		const count = state('onChange-order', { default: 0 })

		const order: string[] = []

		count.onChange(() => {
			order.push('first')
		})

		count.onChange(() => {
			order.push('second')
		})

		count.set(1)

		expect(order).toEqual(['first', 'second'])

		count.destroy()
	})
})

describe('collection intercept and onChange', () => {
	it('intercept works on collection set', () => {
		const items = collection('col-intercept', { default: [1, 2, 3] })

		items.intercept((next) => next.filter((n) => n > 0))

		items.set([1, -1, 2, -2, 3])

		expect(items.get()).toEqual([1, 2, 3])

		items.destroy()
	})

	it('onChange fires on collection add', () => {
		const items = collection('col-onChange', { default: [] as number[] })

		const calls: Array<[number[], number[]]> = []

		items.onChange((next, prev) => {
			calls.push([next, prev])
		})

		items.add(1, 2)

		expect(calls).toEqual([[[1, 2], []]])

		items.destroy()
	})
})
