import { afterEach, describe, expect, it, vi } from 'vitest'
import { batch, collection, computed, readonly, select, state } from '../src/index.js'
import type { GjendjeReadable, GjendjeWritable } from '../src/svelte/index.js'
import { useGjendje } from '../src/svelte/index.js'

/**
 * Helper: subscribe to a store and return the latest value + unsubscribe fn.
 */
function get<T>(store: GjendjeReadable<T>): { value: T; unsub: () => void } {
	const box = { value: undefined as T }

	const unsub = store.subscribe((v) => {
		box.value = v
	})

	return {
		get value() {
			return box.value
		},
		unsub,
	}
}

describe('useGjendje (svelte)', () => {
	const instances: Array<{ destroy(): void }> = []

	function tracked<T extends { destroy(): void }>(instance: T): T {
		instances.push(instance)
		return instance
	}

	afterEach(() => {
		for (const instance of instances) instance.destroy()
		instances.length = 0
	})

	it('returns a writable store for writable instances', () => {
		const count = tracked(state('svelte-writable', { default: 0 }))

		const store = useGjendje(count)

		expect(typeof store.subscribe).toBe('function')
		expect(typeof (store as GjendjeWritable<number>).set).toBe('function')
		expect(typeof (store as GjendjeWritable<number>).update).toBe('function')
	})

	it('returns a readable store for readonly instances', () => {
		const count = tracked(state('svelte-readable', { default: 0 }))

		const ro = readonly(count)
		const store = useGjendje(ro)

		expect(typeof store.subscribe).toBe('function')
		expect('set' in store).toBe(false)
		expect('update' in store).toBe(false)
	})

	it('subscribe calls the callback synchronously with the current value', () => {
		const count = tracked(state('svelte-sync', { default: 42 }))

		const store = useGjendje(count)
		const spy = vi.fn()

		store.subscribe(spy)

		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy).toHaveBeenCalledWith(42)
	})

	it('subscribe notifies on state changes', () => {
		const count = tracked(state('svelte-notify', { default: 0 }))

		const store = useGjendje(count)
		const { value, unsub } = get(store)

		expect(value).toBe(0)

		count.set(5)

		expect(get(store).value).toBe(5)

		unsub()
	})

	it('set() updates the underlying instance', () => {
		const count = tracked(state('svelte-set', { default: 0 }))

		const store = useGjendje(count)

		store.set(10)

		expect(count.get()).toBe(10)

		const { value, unsub } = get(store)

		expect(value).toBe(10)

		unsub()
	})

	it('update() applies an updater function', () => {
		const count = tracked(state('svelte-update', { default: 5 }))

		const store = useGjendje(count)

		store.update((v) => v + 10)

		expect(count.get()).toBe(15)

		const { value, unsub } = get(store)

		expect(value).toBe(15)

		unsub()
	})

	it('unsubscribe stops further notifications', () => {
		const count = tracked(state('svelte-unsub', { default: 0 }))

		const store = useGjendje(count)
		const spy = vi.fn()

		const unsub = store.subscribe(spy)

		expect(spy).toHaveBeenCalledTimes(1)

		count.set(1)

		expect(spy).toHaveBeenCalledTimes(2)

		unsub()

		count.set(2)

		expect(spy).toHaveBeenCalledTimes(2)
	})

	it('reset works via the instance', () => {
		const count = tracked(state('svelte-reset', { default: 0 }))

		count.set(99)

		const store = useGjendje(count)
		const { value, unsub } = get(store)

		expect(value).toBe(99)

		count.reset()

		expect(get(store).value).toBe(0)

		unsub()
	})

	it('ref updates on patch()', () => {
		const user = tracked(state('svelte-patch', { default: { name: 'Alice', age: 30 } }))

		const store = useGjendje(user)
		const { value, unsub } = get(store)

		expect(value).toEqual({ name: 'Alice', age: 30 })

		user.patch({ age: 31 })

		expect(get(store).value).toEqual({ name: 'Alice', age: 31 })

		unsub()
	})

	describe('readonly instances', () => {
		it('returns a readable store that tracks the source', () => {
			const count = tracked(state('svelte-ro', { default: 42 }))

			const ro = readonly(count)
			const store = useGjendje(ro)
			const { value, unsub } = get(store)

			expect(value).toBe(42)

			count.set(7)

			expect(get(store).value).toBe(7)

			unsub()
		})
	})

	describe('selector', () => {
		it('returns a readable store holding the selected slice', () => {
			const user = tracked(state('svelte-selector', { default: { name: 'Alice', age: 30 } }))

			const store = useGjendje(user, (u) => u.name)

			expect(typeof store.subscribe).toBe('function')
			expect('set' in store).toBe(false)

			const { value, unsub } = get(store)

			expect(value).toBe('Alice')

			unsub()
		})

		it('updates when selected slice changes', () => {
			const user = tracked(state('svelte-selector-change', { default: { name: 'Alice', age: 30 } }))

			const store = useGjendje(user, (u) => u.age)

			user.patch({ age: 31 })

			const { value, unsub } = get(store)

			expect(value).toBe(31)

			unsub()
		})

		it('skips notification when selected slice is unchanged', () => {
			const user = tracked(state('svelte-selector-skip', { default: { name: 'Alice', age: 30 } }))

			const store = useGjendje(user, (u) => u.name)
			const spy = vi.fn()

			const unsub = store.subscribe(spy)

			expect(spy).toHaveBeenCalledTimes(1)
			expect(spy).toHaveBeenCalledWith('Alice')

			// Change age — name selector should not trigger
			user.patch({ age: 31 })

			expect(spy).toHaveBeenCalledTimes(1)

			// Change name — should trigger
			user.patch({ name: 'Bob' })

			expect(spy).toHaveBeenCalledTimes(2)
			expect(spy).toHaveBeenLastCalledWith('Bob')

			unsub()
		})
	})

	describe('works with primitives', () => {
		it('computed instance', () => {
			const count = tracked(state('svelte-computed-src', { default: 2 }))

			const doubled = tracked(computed([count], ([c]) => (c ?? 0) * 2))

			const store = useGjendje(doubled)
			const { value, unsub } = get(store)

			expect(value).toBe(4)

			count.set(5)

			expect(get(store).value).toBe(10)

			unsub()
		})

		it('select instance', () => {
			const user = tracked(state('svelte-select-src', { default: { name: 'Alice', age: 30 } }))

			const name = tracked(select(user, (u) => u.name))

			const store = useGjendje(name)
			const { value, unsub } = get(store)

			expect(value).toBe('Alice')

			user.patch({ name: 'Bob' })

			expect(get(store).value).toBe('Bob')

			unsub()
		})

		it('collection instance', () => {
			const todos = tracked(collection('svelte-collection', { default: ['a', 'b'] }))

			const store = useGjendje(todos)
			const { value, unsub } = get(store)

			expect(value).toEqual(['a', 'b'])

			todos.add('c')

			expect(get(store).value).toEqual(['a', 'b', 'c'])

			unsub()
		})
	})

	describe('batching', () => {
		it('applies all batched updates', () => {
			const count = tracked(state('svelte-batch', { default: 0 }))

			const store = useGjendje(count)
			const spy = vi.fn()

			const unsub = store.subscribe(spy)

			// Reset after initial call
			spy.mockClear()

			batch(() => {
				count.set(1)
				count.set(2)
				count.set(3)
			})

			// Batch should result in a single notification with final value
			expect(spy).toHaveBeenLastCalledWith(3)

			const { value } = get(store)

			expect(value).toBe(3)

			unsub()
		})
	})

	describe('multiple stores from one component', () => {
		it('both stores update independently', () => {
			const countA = tracked(state('svelte-multi-a', { default: 0 }))
			const countB = tracked(state('svelte-multi-b', { default: 100 }))

			const storeA = useGjendje(countA)
			const storeB = useGjendje(countB)

			const a = get(storeA)
			const b = get(storeB)

			expect(a.value).toBe(0)
			expect(b.value).toBe(100)

			countA.set(5)

			expect(get(storeA).value).toBe(5)
			expect(get(storeB).value).toBe(100)

			countB.set(200)

			expect(get(storeA).value).toBe(5)
			expect(get(storeB).value).toBe(200)

			a.unsub()
			b.unsub()
		})
	})

	describe('destroyed instance', () => {
		it('store holds the last value after destroy', () => {
			const count = tracked(state('svelte-destroyed-last', { default: 42 }))

			count.set(99)

			const store = useGjendje(count)
			const { value, unsub } = get(store)

			expect(value).toBe(99)

			count.destroy()

			// Last value should still be accessible via new subscription
			expect(get(store).value).toBe(99)

			unsub()
		})
	})

	describe('selector with derived computation', () => {
		it('filters an array and updates on change', () => {
			const items = tracked(
				state('svelte-selector-filter', {
					default: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
				}),
			)

			const store = useGjendje(items, (arr) => arr.filter((n) => n % 2 === 0))

			const { value, unsub } = get(store)

			expect(value).toEqual([2, 4, 6, 8, 10])

			items.set([1, 2, 3])

			expect(get(store).value).toEqual([2])

			unsub()
		})

		it('computes a sum and updates correctly', () => {
			const nums = tracked(state('svelte-selector-sum', { default: [10, 20, 30] }))

			const store = useGjendje(nums, (arr) => arr.reduce((sum, n) => sum + n, 0))

			const { value, unsub } = get(store)

			expect(value).toBe(60)

			nums.set([1, 2, 3, 4])

			expect(get(store).value).toBe(10)

			unsub()
		})

		it('derives a string from object fields', () => {
			const user = tracked(
				state('svelte-selector-derive', {
					default: { firstName: 'Jane', lastName: 'Doe', age: 25 },
				}),
			)

			const store = useGjendje(
				user,
				(u) => `${u.firstName} ${u.lastName} (${u.age >= 18 ? 'adult' : 'minor'})`,
			)

			const { value, unsub } = get(store)

			expect(value).toBe('Jane Doe (adult)')

			user.set({ firstName: 'Baby', lastName: 'Doe', age: 2 })

			expect(get(store).value).toBe('Baby Doe (minor)')

			unsub()
		})
	})

	describe('rapid updates', () => {
		it('shows the last value after many rapid set() calls', () => {
			const count = tracked(state('svelte-rapid', { default: 0 }))

			const store = useGjendje(count)

			for (let i = 1; i <= 100; i++) {
				count.set(i)
			}

			const { value, unsub } = get(store)

			expect(value).toBe(100)

			unsub()
		})

		it('selector reflects the final rapid update', () => {
			const data = tracked(state('svelte-rapid-selector', { default: { count: 0 } }))

			const store = useGjendje(data, (d) => d.count * 2)

			for (let i = 1; i <= 20; i++) {
				data.set({ count: i })
			}

			const { value, unsub } = get(store)

			expect(value).toBe(40)

			unsub()
		})
	})

	describe('multiple subscribers', () => {
		it('each subscriber receives updates independently', () => {
			const count = tracked(state('svelte-multi-sub', { default: 0 }))

			const store = useGjendje(count)

			const spy1 = vi.fn()
			const spy2 = vi.fn()

			const unsub1 = store.subscribe(spy1)
			const unsub2 = store.subscribe(spy2)

			expect(spy1).toHaveBeenCalledWith(0)
			expect(spy2).toHaveBeenCalledWith(0)

			count.set(5)

			expect(spy1).toHaveBeenCalledWith(5)
			expect(spy2).toHaveBeenCalledWith(5)

			unsub1()

			count.set(10)

			expect(spy1).toHaveBeenCalledTimes(2) // initial + first set only
			expect(spy2).toHaveBeenCalledWith(10)

			unsub2()
		})
	})
})
