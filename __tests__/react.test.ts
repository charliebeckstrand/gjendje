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

	it('returns a [value, set, reset] tuple for writable instances', () => {
		const count = tracked(state('react-tuple', { default: 0 }))

		const { result } = renderHook(() => useGjendje(count))

		expect(result.current).toHaveLength(3)

		const [value, set, reset] = result.current

		expect(value).toBe(0)
		expect(typeof set).toBe('function')
		expect(typeof reset).toBe('function')
	})

	it('returns a plain value for readonly instances', () => {
		const count = tracked(state('react-readonly-plain', { default: 42 }))

		const ro = readonly(count)

		const { result } = renderHook(() => useGjendje(ro))

		expect(result.current).toBe(42)
		expect(Array.isArray(result.current)).toBe(false)
	})

	it('set() from the tuple updates the value', () => {
		const count = tracked(state('react-tuple-set', { default: 0 }))

		const { result } = renderHook(() => useGjendje(count))

		act(() => result.current[1](5))

		expect(result.current[0]).toBe(5)
	})

	it('set() from the tuple supports updater functions', () => {
		const count = tracked(state('react-tuple-updater', { default: 0 }))

		const { result } = renderHook(() => useGjendje(count))

		act(() => result.current[1]((prev) => prev + 1))
		act(() => result.current[1]((prev) => prev + 1))

		expect(result.current[0]).toBe(2)
	})

	it('reset() from the tuple resets to default', () => {
		const count = tracked(state('react-tuple-reset', { default: 0 }))

		const { result } = renderHook(() => useGjendje(count))

		act(() => result.current[1](99))

		expect(result.current[0]).toBe(99)

		act(() => result.current[2]())

		expect(result.current[0]).toBe(0)
	})

	it('re-renders on external set()', () => {
		const count = tracked(state('react-ext-set', { default: 0 }))

		const { result } = renderHook(() => useGjendje(count))

		act(() => count.set(5))

		expect(result.current[0]).toBe(5)
	})

	it('re-renders on patch()', () => {
		const user = tracked(state('react-patch', { default: { name: 'Alice', age: 30 } }))

		const { result } = renderHook(() => useGjendje(user))

		expect(result.current[0]).toEqual({ name: 'Alice', age: 30 })

		act(() => user.patch({ age: 31 }))

		expect(result.current[0]).toEqual({ name: 'Alice', age: 31 })
	})

	it('unsubscribes on unmount', () => {
		const count = tracked(state('react-unsub', { default: 0 }))

		const spy = vi.fn()

		const { unmount } = renderHook(() => {
			const tuple = useGjendje(count)
			spy(tuple[0])
			return tuple
		})

		expect(spy).toHaveBeenCalledTimes(1)

		unmount()

		act(() => count.set(5))

		expect(spy).toHaveBeenCalledTimes(1)
	})

	describe('selector', () => {
		it('returns a plain value (not a tuple)', () => {
			const user = tracked(state('react-selector', { default: { name: 'Alice', age: 30 } }))

			const { result } = renderHook(() => useGjendje(user, (u) => u.name))

			expect(result.current).toBe('Alice')
			expect(Array.isArray(result.current)).toBe(false)
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

			act(() => user.patch({ age: 31 }))

			expect(renderCount).toHaveBeenCalledTimes(1)
		})
	})

	describe('works with primitives', () => {
		it('computed instance returns plain value', () => {
			const count = tracked(state('react-computed-src', { default: 2 }))

			const doubled = tracked(computed([count], ([c]) => (c ?? 0) * 2))

			const { result } = renderHook(() => useGjendje(doubled))

			expect(result.current).toBe(4)
			expect(Array.isArray(result.current)).toBe(false)

			act(() => count.set(5))

			expect(result.current).toBe(10)
		})

		it('select instance returns plain value', () => {
			const user = tracked(state('react-select-src', { default: { name: 'Alice', age: 30 } }))

			const name = tracked(select(user, (u) => u.name))

			const { result } = renderHook(() => useGjendje(name))

			expect(result.current).toBe('Alice')

			act(() => user.patch({ name: 'Bob' }))

			expect(result.current).toBe('Bob')
		})

		it('collection instance returns a tuple', () => {
			const todos = tracked(collection('react-collection', { default: ['a', 'b'] }))

			const { result } = renderHook(() => useGjendje(todos))

			const [items, setItems, resetItems] = result.current

			expect(items).toEqual(['a', 'b'])
			expect(typeof setItems).toBe('function')
			expect(typeof resetItems).toBe('function')
		})

		it('collection set/reset from tuple works', () => {
			const todos = tracked(collection('react-collection-tuple', { default: ['a'] }))

			const { result } = renderHook(() => useGjendje(todos))

			act(() => todos.add('b'))

			expect(result.current[0]).toEqual(['a', 'b'])

			act(() => result.current[2]())

			expect(result.current[0]).toEqual(['a'])
		})
	})

	describe('batching', () => {
		it('only re-renders once for batched updates', () => {
			const count = tracked(state('react-batch', { default: 0 }))

			const renderCount = vi.fn()

			renderHook(() => {
				const tuple = useGjendje(count)
				renderCount()
				return tuple
			})

			expect(renderCount).toHaveBeenCalledTimes(1)

			act(() => {
				batch(() => {
					count.set(1)
					count.set(2)
					count.set(3)
				})
			})

			expect(renderCount).toHaveBeenCalledTimes(2)
		})
	})
})
