import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { batch, collection, computed, readonly, select, state } from '../src/index.js'
import { useGjendje } from '../src/react/index.js'

describe('useGjendje', () => {
	const instances: Array<{ destroy(): void }> = []

	function tracked<T extends { destroy(): void }>(instance: T): T {
		instances.push(instance)
		return instance
	}

	afterEach(() => {
		for (const instance of instances) instance.destroy()
		instances.length = 0
	})

	it('returns the current value', () => {
		const count = tracked(state('react-get', { default: 42 }))

		const { result } = renderHook(() => useGjendje(count))

		expect(result.current).toBe(42)
	})

	it('re-renders on set()', () => {
		const count = tracked(state('react-set', { default: 0 }))

		const { result } = renderHook(() => useGjendje(count))

		expect(result.current).toBe(0)

		act(() => count.set(5))

		expect(result.current).toBe(5)
	})

	it('re-renders on updater function', () => {
		const count = tracked(state('react-updater', { default: 0 }))

		const { result } = renderHook(() => useGjendje(count))

		act(() => count.set((prev) => prev + 1))

		expect(result.current).toBe(1)
	})

	it('re-renders on reset()', () => {
		const count = tracked(state('react-reset', { default: 0 }))

		count.set(99)

		const { result } = renderHook(() => useGjendje(count))

		expect(result.current).toBe(99)

		act(() => count.reset())

		expect(result.current).toBe(0)
	})

	it('re-renders on patch()', () => {
		const user = tracked(state('react-patch', { default: { name: 'Alice', age: 30 } }))

		const { result } = renderHook(() => useGjendje(user))

		expect(result.current).toEqual({ name: 'Alice', age: 30 })

		act(() => user.patch({ age: 31 }))

		expect(result.current).toEqual({ name: 'Alice', age: 31 })
	})

	it('unsubscribes on unmount', () => {
		const count = tracked(state('react-unsub', { default: 0 }))

		const spy = vi.fn()

		const { unmount } = renderHook(() => {
			const val = useGjendje(count)
			spy(val)
			return val
		})

		expect(spy).toHaveBeenCalledTimes(1)

		unmount()

		act(() => count.set(5))

		// Should not have been called again after unmount
		expect(spy).toHaveBeenCalledTimes(1)
	})

	describe('selector', () => {
		it('returns a derived slice', () => {
			const user = tracked(state('react-selector', { default: { name: 'Alice', age: 30 } }))

			const { result } = renderHook(() => useGjendje(user, (u) => u.name))

			expect(result.current).toBe('Alice')
		})

		it('re-renders when selected slice changes', () => {
			const user = tracked(state('react-selector-change', { default: { name: 'Alice', age: 30 } }))

			const { result } = renderHook(() => useGjendje(user, (u) => u.age))

			act(() => user.patch({ age: 31 }))

			expect(result.current).toBe(31)
		})

		it('skips re-render when selected slice is unchanged', () => {
			const user = tracked(state('react-selector-skip', { default: { name: 'Alice', age: 30 } }))

			const renderCount = vi.fn()

			renderHook(() => {
				const name = useGjendje(user, (u) => u.name)
				renderCount()
				return name
			})

			expect(renderCount).toHaveBeenCalledTimes(1)

			// Change age — name selector should not trigger re-render
			act(() => user.patch({ age: 31 }))

			expect(renderCount).toHaveBeenCalledTimes(1)
		})
	})

	describe('works with primitives', () => {
		it('computed instance', () => {
			const count = tracked(state('react-computed-src', { default: 2 }))

			const doubled = tracked(computed([count], ([c]) => (c ?? 0) * 2))

			const { result } = renderHook(() => useGjendje(doubled))

			expect(result.current).toBe(4)

			act(() => count.set(5))

			expect(result.current).toBe(10)
		})

		it('select instance', () => {
			const user = tracked(state('react-select-src', { default: { name: 'Alice', age: 30 } }))

			const name = tracked(select(user, (u) => u.name))

			const { result } = renderHook(() => useGjendje(name))

			expect(result.current).toBe('Alice')

			act(() => user.patch({ name: 'Bob' }))

			expect(result.current).toBe('Bob')
		})

		it('readonly instance', () => {
			const count = tracked(state('react-readonly-src', { default: 0 }))

			const readonlyCount = readonly(count)

			const { result } = renderHook(() => useGjendje(readonlyCount))

			expect(result.current).toBe(0)

			act(() => count.set(5))

			expect(result.current).toBe(5)
		})

		it('collection instance', () => {
			const todos = tracked(collection('react-collection', { default: ['a', 'b'] }))

			const { result } = renderHook(() => useGjendje(todos))

			expect(result.current).toEqual(['a', 'b'])

			act(() => todos.add('c'))

			expect(result.current).toEqual(['a', 'b', 'c'])
		})
	})

	describe('batching', () => {
		it('only re-renders once for batched updates', () => {
			const count = tracked(state('react-batch', { default: 0 }))

			const renderCount = vi.fn()

			renderHook(() => {
				const val = useGjendje(count)
				renderCount()
				return val
			})

			expect(renderCount).toHaveBeenCalledTimes(1)

			act(() => {
				batch(() => {
					count.set(1)
					count.set(2)
					count.set(3)
				})
			})

			// Should re-render once for the batch, not three times
			expect(renderCount).toHaveBeenCalledTimes(2)
		})
	})
})
