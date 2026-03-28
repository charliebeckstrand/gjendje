import { act, renderHook } from '@testing-library/react'
import React from 'react'
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

	describe('Strict Mode double-render', () => {
		it('returns correct state value under StrictMode', () => {
			const count = tracked(state('react-strict-mode', { default: 7 }))

			const { result } = renderHook(() => useGjendje(count), {
				wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
			})

			expect(result.current[0]).toBe(7)
		})

		it('updates correctly under StrictMode', () => {
			const count = tracked(state('react-strict-mode-update', { default: 0 }))

			const { result } = renderHook(() => useGjendje(count), {
				wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
			})

			act(() => result.current[1](42))

			expect(result.current[0]).toBe(42)
		})

		it('selector works under StrictMode', () => {
			const user = tracked(state('react-strict-mode-sel', { default: { name: 'Alice', age: 30 } }))

			const { result } = renderHook(() => useGjendje(user, (u) => u.name), {
				wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
			})

			expect(result.current).toBe('Alice')

			act(() => user.patch({ name: 'Bob' }))

			expect(result.current).toBe('Bob')
		})
	})

	describe('multiple hooks in one component', () => {
		it('both state instances update independently', () => {
			const countA = tracked(state('react-multi-hook-a', { default: 0 }))
			const countB = tracked(state('react-multi-hook-b', { default: 100 }))

			const { result } = renderHook(() => {
				const a = useGjendje(countA)
				const b = useGjendje(countB)
				return { a, b }
			})

			expect(result.current.a[0]).toBe(0)
			expect(result.current.b[0]).toBe(100)

			act(() => countA.set(5))

			expect(result.current.a[0]).toBe(5)
			expect(result.current.b[0]).toBe(100)

			act(() => countB.set(200))

			expect(result.current.a[0]).toBe(5)
			expect(result.current.b[0]).toBe(200)
		})

		it('re-renders only when one of the subscribed values changes', () => {
			const countA = tracked(state('react-multi-hook-render-a', { default: 0 }))
			const countB = tracked(state('react-multi-hook-render-b', { default: 0 }))

			const renderCount = vi.fn()

			renderHook(() => {
				const a = useGjendje(countA)
				const b = useGjendje(countB)
				renderCount()
				return { a, b }
			})

			expect(renderCount).toHaveBeenCalledTimes(1)

			act(() => countA.set(1))

			expect(renderCount).toHaveBeenCalledTimes(2)

			act(() => countB.set(1))

			expect(renderCount).toHaveBeenCalledTimes(3)
		})
	})

	describe('instance swap', () => {
		it('subscribes to the new instance after swap', () => {
			const instanceA = tracked(state('react-swap-a', { default: 'A' }))
			const instanceB = tracked(state('react-swap-b', { default: 'B' }))

			const { result, rerender } = renderHook(({ inst }) => useGjendje(inst), {
				initialProps: { inst: instanceA as ReturnType<typeof state<string>> },
			})

			expect(result.current[0]).toBe('A')

			rerender({ inst: instanceB })

			expect(result.current[0]).toBe('B')
		})

		it('unsubscribes from the old instance after swap', () => {
			const instanceA = tracked(state('react-swap-unsub-a', { default: 'A' }))
			const instanceB = tracked(state('react-swap-unsub-b', { default: 'B' }))

			const renderCount = vi.fn()

			const { rerender } = renderHook(
				({ inst }) => {
					const tuple = useGjendje(inst)
					renderCount()
					return tuple
				},
				{ initialProps: { inst: instanceA as ReturnType<typeof state<string>> } },
			)

			expect(renderCount).toHaveBeenCalledTimes(1)

			rerender({ inst: instanceB })

			const countAfterSwap = renderCount.mock.calls.length

			// Updating the old instance should NOT cause a re-render
			act(() => instanceA.set('A2'))

			expect(renderCount).toHaveBeenCalledTimes(countAfterSwap)
		})

		it('responds to updates on the new instance after swap', () => {
			const instanceA = tracked(state('react-swap-new-a', { default: 0 }))
			const instanceB = tracked(state('react-swap-new-b', { default: 10 }))

			const { result, rerender } = renderHook(({ inst }) => useGjendje(inst), {
				initialProps: { inst: instanceA as ReturnType<typeof state<number>> },
			})

			rerender({ inst: instanceB })

			act(() => instanceB.set(20))

			expect(result.current[0]).toBe(20)
		})
	})

	describe('destroyed instance', () => {
		it('does not throw when rendering a destroyed instance', () => {
			const count = tracked(state('react-destroyed', { default: 42 }))

			count.destroy()

			const { result } = renderHook(() => useGjendje(count))

			// Should still return the last known value without throwing
			expect(result.current[0]).toBe(42)
		})

		it('set() is a no-op on a destroyed instance', () => {
			const count = tracked(state('react-destroyed-set', { default: 0 }))

			const { result } = renderHook(() => useGjendje(count))

			expect(result.current[0]).toBe(0)

			act(() => count.destroy())

			// Calling set after destroy should not throw
			act(() => result.current[1](99))

			expect(result.current[0]).toBe(0)
		})
	})

	describe('selector with derived computation', () => {
		it('computes a count of even numbers and updates when source changes', () => {
			const items = tracked(
				state('react-selector-derived', {
					default: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
				}),
			)

			const { result } = renderHook(() =>
				useGjendje(items, (arr) => arr.filter((n) => n % 2 === 0).length),
			)

			expect(result.current).toBe(5)

			act(() => items.set([1, 2, 3]))

			expect(result.current).toBe(1)
		})

		it('computes a sum and updates correctly', () => {
			const nums = tracked(state('react-selector-sum', { default: [10, 20, 30] }))

			const { result } = renderHook(() =>
				useGjendje(nums, (arr) => arr.reduce((sum, n) => sum + n, 0)),
			)

			expect(result.current).toBe(60)

			act(() => nums.set([1, 2, 3, 4]))

			expect(result.current).toBe(10)
		})

		it('derives a string from multiple object fields', () => {
			const user = tracked(
				state('react-selector-obj', {
					default: { firstName: 'Jane', lastName: 'Doe', age: 25 },
				}),
			)

			const { result } = renderHook(() =>
				useGjendje(
					user,
					(u) => `${u.firstName} ${u.lastName} (${u.age >= 18 ? 'adult' : 'minor'})`,
				),
			)

			expect(result.current).toBe('Jane Doe (adult)')

			act(() => user.set({ firstName: 'Baby', lastName: 'Doe', age: 2 }))

			expect(result.current).toBe('Baby Doe (minor)')
		})
	})

	describe('rapid updates', () => {
		it('shows the last value after many rapid set() calls', () => {
			const count = tracked(state('react-rapid', { default: 0 }))

			const { result } = renderHook(() => useGjendje(count))

			act(() => {
				for (let i = 1; i <= 100; i++) {
					count.set(i)
				}
			})

			expect(result.current[0]).toBe(100)
		})

		it('updater functions compose correctly during rapid updates', () => {
			const count = tracked(state('react-rapid-updater', { default: 0 }))

			const { result } = renderHook(() => useGjendje(count))

			act(() => {
				for (let i = 0; i < 50; i++) {
					result.current[1]((prev) => prev + 1)
				}
			})

			expect(result.current[0]).toBe(50)
		})

		it('selector reflects the final rapid update', () => {
			const data = tracked(state('react-rapid-selector', { default: { count: 0 } }))

			const { result } = renderHook(() => useGjendje(data, (d) => d.count * 2))

			act(() => {
				for (let i = 1; i <= 20; i++) {
					data.set({ count: i })
				}
			})

			expect(result.current).toBe(40)
		})
	})
})
