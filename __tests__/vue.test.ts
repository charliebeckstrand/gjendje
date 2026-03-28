import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, isRef, nextTick, watch as vueWatch } from 'vue'
import { batch, collection, computed, readonly, select, state } from '../src/index.js'
import { useGjendje } from '../src/vue/index.js'

/**
 * Helper: mount a component that exposes the composable result
 * as a raw ref (bypassing Vue's auto-unwrapping on the render proxy).
 */
function useSetup<T>(fn: () => T) {
	const box = { result: undefined as T }

	const wrapper = mount(
		defineComponent({
			setup() {
				box.result = fn()
				return () => null
			},
		}),
	)

	return { result: box.result, wrapper }
}

describe('useGjendje (vue)', () => {
	const instances: Array<{ destroy(): void }> = []

	function tracked<T extends { destroy(): void }>(instance: T): T {
		instances.push(instance)
		return instance
	}

	afterEach(() => {
		for (const instance of instances) instance.destroy()
		instances.length = 0
	})

	it('returns a ref with the current value', () => {
		const count = tracked(state('vue-get', { default: 42 }))

		const { result, wrapper } = useSetup(() => useGjendje(count))

		expect(isRef(result)).toBe(true)
		expect(result.value).toBe(42)

		wrapper.unmount()
	})

	it('ref updates when state changes externally', async () => {
		const count = tracked(state('vue-external', { default: 0 }))

		const { result, wrapper } = useSetup(() => useGjendje(count))

		count.set(5)
		await nextTick()

		expect(result.value).toBe(5)

		wrapper.unmount()
	})

	it('writing to .value calls set() on the instance', async () => {
		const count = tracked(state('vue-write', { default: 0 }))

		const { result, wrapper } = useSetup(() => useGjendje(count))

		result.value = 10
		await nextTick()

		expect(count.get()).toBe(10)
		expect(result.value).toBe(10)

		wrapper.unmount()
	})

	it('reset works via the instance', async () => {
		const count = tracked(state('vue-reset', { default: 0 }))

		count.set(99)

		const { result, wrapper } = useSetup(() => useGjendje(count))

		expect(result.value).toBe(99)

		count.reset()
		await nextTick()

		expect(result.value).toBe(0)

		wrapper.unmount()
	})

	it('ref updates on patch()', async () => {
		const user = tracked(state('vue-patch', { default: { name: 'Alice', age: 30 } }))

		const { result, wrapper } = useSetup(() => useGjendje(user))

		expect(result.value).toEqual({ name: 'Alice', age: 30 })

		user.patch({ age: 31 })
		await nextTick()

		expect(result.value).toEqual({ name: 'Alice', age: 31 })

		wrapper.unmount()
	})

	it('unsubscribes on unmount', async () => {
		const count = tracked(state('vue-unsub', { default: 0 }))

		const { wrapper } = useSetup(() => {
			const ref = useGjendje(count)

			// Verify subscription is active
			expect(ref.value).toBe(0)

			return ref
		})

		// Trigger an update while mounted
		count.set(5)
		await nextTick()

		// Destroy — onScopeDispose should unsubscribe
		wrapper.unmount()

		// Verify the instance subscription count dropped
		// (no error thrown on further set after unmount)
		count.set(10)
		await nextTick()
	})

	describe('readonly instances', () => {
		it('returns a ref that tracks the source', async () => {
			const count = tracked(state('vue-ro', { default: 42 }))

			const ro = readonly(count)

			const { result, wrapper } = useSetup(() => useGjendje(ro))

			expect(isRef(result)).toBe(true)
			expect(result.value).toBe(42)

			count.set(7)
			await nextTick()

			expect(result.value).toBe(7)

			wrapper.unmount()
		})
	})

	describe('selector', () => {
		it('returns a ref holding the selected slice', () => {
			const user = tracked(state('vue-selector', { default: { name: 'Alice', age: 30 } }))

			const { result, wrapper } = useSetup(() => useGjendje(user, (u) => u.name))

			expect(isRef(result)).toBe(true)
			expect(result.value).toBe('Alice')

			wrapper.unmount()
		})

		it('ref updates when selected slice changes', async () => {
			const user = tracked(state('vue-selector-change', { default: { name: 'Alice', age: 30 } }))

			const { result, wrapper } = useSetup(() => useGjendje(user, (u) => u.age))

			user.patch({ age: 31 })
			await nextTick()

			expect(result.value).toBe(31)

			wrapper.unmount()
		})

		it('skips trigger when selected slice is unchanged', async () => {
			const user = tracked(state('vue-selector-skip', { default: { name: 'Alice', age: 30 } }))

			let triggerCount = 0

			const { wrapper } = useSetup(() => {
				const name = useGjendje(user, (u) => u.name)

				// Use Vue's watch to count reactive triggers
				vueWatch(name, () => {
					triggerCount++
				})

				return name
			})

			expect(triggerCount).toBe(0)

			// Change age — name selector should not trigger
			user.patch({ age: 31 })
			await nextTick()

			expect(triggerCount).toBe(0)

			// Change name — should trigger
			user.patch({ name: 'Bob' })
			await nextTick()

			expect(triggerCount).toBe(1)

			wrapper.unmount()
		})
	})

	describe('works with primitives', () => {
		it('computed instance', async () => {
			const count = tracked(state('vue-computed-src', { default: 2 }))

			const doubled = tracked(computed([count], ([c]) => (c ?? 0) * 2))

			const { result, wrapper } = useSetup(() => useGjendje(doubled))

			expect(result.value).toBe(4)

			count.set(5)
			await nextTick()

			expect(result.value).toBe(10)

			wrapper.unmount()
		})

		it('select instance', async () => {
			const user = tracked(state('vue-select-src', { default: { name: 'Alice', age: 30 } }))

			const name = tracked(select(user, (u) => u.name))

			const { result, wrapper } = useSetup(() => useGjendje(name))

			expect(result.value).toBe('Alice')

			user.patch({ name: 'Bob' })
			await nextTick()

			expect(result.value).toBe('Bob')

			wrapper.unmount()
		})

		it('collection instance', async () => {
			const todos = tracked(collection('vue-collection', { default: ['a', 'b'] }))

			const { result, wrapper } = useSetup(() => useGjendje(todos))

			expect(result.value).toEqual(['a', 'b'])

			todos.add('c')
			await nextTick()

			expect(result.value).toEqual(['a', 'b', 'c'])

			wrapper.unmount()
		})
	})

	describe('batching', () => {
		it('applies all batched updates', async () => {
			const count = tracked(state('vue-batch', { default: 0 }))

			const { result, wrapper } = useSetup(() => useGjendje(count))

			batch(() => {
				count.set(1)
				count.set(2)
				count.set(3)
			})
			await nextTick()

			expect(result.value).toBe(3)

			wrapper.unmount()
		})
	})

	describe('multiple composables in one component', () => {
		it('both state instances update independently', async () => {
			const countA = tracked(state('vue-multi-a', { default: 0 }))
			const countB = tracked(state('vue-multi-b', { default: 100 }))

			const { result, wrapper } = useSetup(() => {
				const a = useGjendje(countA)
				const b = useGjendje(countB)
				return { a, b }
			})

			expect(result.a.value).toBe(0)
			expect(result.b.value).toBe(100)

			countA.set(5)
			await nextTick()

			expect(result.a.value).toBe(5)
			expect(result.b.value).toBe(100)

			countB.set(200)
			await nextTick()

			expect(result.a.value).toBe(5)
			expect(result.b.value).toBe(200)

			wrapper.unmount()
		})

		it('updating one does not affect the other', async () => {
			const name = tracked(state('vue-multi-name', { default: 'Alice' }))
			const age = tracked(state('vue-multi-age', { default: 30 }))

			const { result, wrapper } = useSetup(() => {
				const nameRef = useGjendje(name)
				const ageRef = useGjendje(age)
				return { nameRef, ageRef }
			})

			name.set('Bob')
			await nextTick()

			expect(result.nameRef.value).toBe('Bob')
			expect(result.ageRef.value).toBe(30)

			wrapper.unmount()
		})
	})

	describe('instance swap', () => {
		it('tracks the new instance after unmount and remount', async () => {
			const instanceA = tracked(state('vue-swap-a', { default: 'A' }))
			const instanceB = tracked(state('vue-swap-b', { default: 'B' }))

			const { result: resultA, wrapper: wrapperA } = useSetup(() => useGjendje(instanceA))

			expect(resultA.value).toBe('A')

			wrapperA.unmount()

			const { result: resultB, wrapper: wrapperB } = useSetup(() => useGjendje(instanceB))

			expect(resultB.value).toBe('B')

			instanceB.set('B2')
			await nextTick()

			expect(resultB.value).toBe('B2')

			wrapperB.unmount()
		})

		it('old instance updates do not affect the new mount', async () => {
			const instanceA = tracked(state('vue-swap-old-a', { default: 0 }))
			const instanceB = tracked(state('vue-swap-old-b', { default: 10 }))

			const { wrapper: wrapperA } = useSetup(() => useGjendje(instanceA))

			wrapperA.unmount()

			const { result: resultB, wrapper: wrapperB } = useSetup(() => useGjendje(instanceB))

			instanceA.set(999)
			await nextTick()

			expect(resultB.value).toBe(10)

			wrapperB.unmount()
		})
	})

	describe('destroyed instance', () => {
		it('ref holds the last value after destroy', async () => {
			const count = tracked(state('vue-destroyed-last', { default: 42 }))

			count.set(99)

			const { result, wrapper } = useSetup(() => useGjendje(count))

			expect(result.value).toBe(99)

			count.destroy()
			await nextTick()

			expect(result.value).toBe(99)

			wrapper.unmount()
		})

		it('writing to .value on a destroyed writable instance is a no-op', async () => {
			const count = tracked(state('vue-destroyed-write', { default: 5 }))

			const { result, wrapper } = useSetup(() => useGjendje(count))

			expect(result.value).toBe(5)

			count.destroy()
			await nextTick()

			result.value = 999
			await nextTick()

			expect(result.value).toBe(5)

			wrapper.unmount()
		})
	})

	describe('selector with derived computation', () => {
		it('filters an array and updates on change', async () => {
			const items = tracked(
				state('vue-selector-filter', {
					default: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
				}),
			)

			const { result, wrapper } = useSetup(() =>
				useGjendje(items, (arr) => arr.filter((n) => n % 2 === 0)),
			)

			expect(result.value).toEqual([2, 4, 6, 8, 10])

			items.set([1, 2, 3])
			await nextTick()

			expect(result.value).toEqual([2])

			wrapper.unmount()
		})

		it('computes a sum and updates correctly', async () => {
			const nums = tracked(state('vue-selector-sum', { default: [10, 20, 30] }))

			const { result, wrapper } = useSetup(() =>
				useGjendje(nums, (arr) => arr.reduce((sum, n) => sum + n, 0)),
			)

			expect(result.value).toBe(60)

			nums.set([1, 2, 3, 4])
			await nextTick()

			expect(result.value).toBe(10)

			wrapper.unmount()
		})

		it('derives a string from object fields', async () => {
			const user = tracked(
				state('vue-selector-derive', {
					default: { firstName: 'Jane', lastName: 'Doe', age: 25 },
				}),
			)

			const { result, wrapper } = useSetup(() =>
				useGjendje(
					user,
					(u) => `${u.firstName} ${u.lastName} (${u.age >= 18 ? 'adult' : 'minor'})`,
				),
			)

			expect(result.value).toBe('Jane Doe (adult)')

			user.set({ firstName: 'Baby', lastName: 'Doe', age: 2 })
			await nextTick()

			expect(result.value).toBe('Baby Doe (minor)')

			wrapper.unmount()
		})
	})

	describe('rapid updates', () => {
		it('shows the last value after many rapid set() calls', async () => {
			const count = tracked(state('vue-rapid', { default: 0 }))

			const { result, wrapper } = useSetup(() => useGjendje(count))

			for (let i = 1; i <= 100; i++) {
				count.set(i)
			}
			await nextTick()

			expect(result.value).toBe(100)

			wrapper.unmount()
		})

		it('selector reflects the final rapid update', async () => {
			const data = tracked(state('vue-rapid-selector', { default: { count: 0 } }))

			const { result, wrapper } = useSetup(() => useGjendje(data, (d) => d.count * 2))

			for (let i = 1; i <= 20; i++) {
				data.set({ count: i })
			}
			await nextTick()

			expect(result.value).toBe(40)

			wrapper.unmount()
		})
	})

	describe('Vue watch integration', () => {
		it('watcher fires when state changes with correct oldVal and newVal', async () => {
			const count = tracked(state('vue-watch-integration', { default: 0 }))

			const spy = vi.fn()

			const { wrapper } = useSetup(() => {
				const ref = useGjendje(count)

				vueWatch(ref, (newVal, oldVal) => {
					spy(newVal, oldVal)
				})

				return ref
			})

			count.set(5)
			await nextTick()

			expect(spy).toHaveBeenCalledTimes(1)
			expect(spy).toHaveBeenCalledWith(5, 0)

			count.set(10)
			await nextTick()

			expect(spy).toHaveBeenCalledTimes(2)
			expect(spy).toHaveBeenCalledWith(10, 5)

			wrapper.unmount()
		})

		it('watcher does not fire after unmount', async () => {
			const count = tracked(state('vue-watch-unsub', { default: 0 }))

			const spy = vi.fn()

			const { wrapper } = useSetup(() => {
				const ref = useGjendje(count)

				vueWatch(ref, (newVal) => {
					spy(newVal)
				})

				return ref
			})

			count.set(1)
			await nextTick()

			expect(spy).toHaveBeenCalledTimes(1)

			wrapper.unmount()

			count.set(2)
			await nextTick()

			expect(spy).toHaveBeenCalledTimes(1)
		})
	})

	describe('readonly ref for readonly/computed instances', () => {
		it('writing to .value on a readonly-wrapped instance does not change the value', async () => {
			const count = tracked(state('vue-readonly-write', { default: 42 }))

			const ro = readonly(count)

			const { result, wrapper } = useSetup(() => useGjendje(ro))

			expect(result.value).toBe(42)

			// Attempt to write — should be silently ignored at runtime
			// @ts-expect-error — intentionally writing to readonly ref to test runtime guard
			result.value = 999
			await nextTick()

			expect(result.value).toBe(42)
			expect(count.get()).toBe(42)

			wrapper.unmount()
		})

		it('writing to .value on a computed instance does not change the value', async () => {
			const count = tracked(state('vue-computed-write-src', { default: 5 }))

			const doubled = tracked(computed([count], ([c]) => (c ?? 0) * 2))

			const { result, wrapper } = useSetup(() => useGjendje(doubled))

			expect(result.value).toBe(10)

			// Attempt to write — should be silently ignored at runtime
			// @ts-expect-error — intentionally writing to readonly ref to test runtime guard
			result.value = 999
			await nextTick()

			expect(result.value).toBe(10)

			wrapper.unmount()
		})
	})
})
