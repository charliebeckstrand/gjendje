import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, isRef, nextTick } from 'vue'
import { batch, collection, computed, readonly, select, state } from '../src/index.js'
import { useGjendje } from '../src/vue/index.js'

/**
 * Helper: mount a component that exposes the composable result
 * as a raw ref (bypassing Vue's auto-unwrapping on the render proxy).
 */
function useSetup<T>(fn: () => T) {
	let result: T

	const wrapper = mount(
		defineComponent({
			setup() {
				result = fn()
				return () => null
			},
		}),
	)

	// biome-ignore lint/style/noNonNullAssertion: assigned synchronously in setup
	return { result: result!, wrapper }
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
})
