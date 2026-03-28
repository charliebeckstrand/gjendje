import { describe, expect, it } from 'vitest'
import { batch } from '../../src/batch.js'
import { collection } from '../../src/collection.js'
import { computed } from '../../src/computed.js'

describe('collection + computed', () => {
	it('computed derives from a collection', () => {
		const todos = collection('coll-comp-todos', {
			default: [
				{ id: 1, done: false },
				{ id: 2, done: true },
			],
		})

		const doneCount = computed([todos], ([items]) => (items ?? []).filter((t) => t.done).length)

		expect(doneCount.get()).toBe(1)

		todos.update((t) => t.id === 1, { done: true })

		expect(doneCount.get()).toBe(2)

		doneCount.destroy()
		todos.destroy()
	})

	it('computed reacts to add and remove', () => {
		const items = collection('coll-comp-add', {
			default: [{ name: 'a' }],
		})

		const count = computed([items], ([list]) => (list ?? []).length)

		expect(count.get()).toBe(1)

		items.add({ name: 'b' }, { name: 'c' })

		expect(count.get()).toBe(3)

		items.remove((i) => i.name === 'b')

		expect(count.get()).toBe(2)

		count.destroy()
		items.destroy()
	})

	it('computed subscriber fires on collection mutation', () => {
		const tags = collection('coll-comp-sub', { default: ['a', 'b'] })

		const joined = computed([tags], ([list]) => (list ?? []).join(','))

		const calls: string[] = []

		joined.subscribe((v) => calls.push(v))

		tags.add('c')

		expect(calls).toEqual(['a,b,c'])

		joined.destroy()
		tags.destroy()
	})

	it('batch coalesces multiple collection ops for computed', () => {
		const nums = collection('coll-comp-batch', { default: [1, 2, 3] })

		const sum = computed([nums], ([list]) => (list ?? []).reduce((a, b) => a + b, 0))

		const calls: number[] = []

		sum.subscribe((v) => calls.push(v))

		batch(() => {
			nums.add(4)
			nums.remove((n) => n === 1)
		})

		// Single notification with final value: 2 + 3 + 4 = 9
		expect(calls).toEqual([9])

		sum.destroy()
		nums.destroy()
	})
})
