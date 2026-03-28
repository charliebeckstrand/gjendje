import { describe, expect, it, vi } from 'vitest'
import { collection } from '../../src/index.js'

type Todo = { id: number; text: string; done: boolean }

const defaults: Todo[] = [
	{ id: 1, text: 'Buy milk', done: false },
	{ id: 2, text: 'Walk dog', done: true },
	{ id: 3, text: 'Read book', done: false },
]

describe('collection edge cases', () => {
	it('remove with one:true is no-op when predicate never matches', () => {
		const todos = collection('edge-rm-one-noop', { default: [...defaults] })

		const listener = vi.fn()

		todos.subscribe(listener)
		todos.remove((item) => item.id === 999, { one: true })

		expect(listener).not.toHaveBeenCalled()
		expect(todos.size).toBe(3)

		todos.destroy()
	})

	it('remove without one is no-op when all items pass', () => {
		const todos = collection('edge-rm-multi-noop', { default: [...defaults] })

		const listener = vi.fn()

		todos.subscribe(listener)
		todos.remove((item) => item.id === 999)

		expect(listener).not.toHaveBeenCalled()
		expect(todos.size).toBe(3)

		todos.destroy()
	})

	it('update with one:true is no-op when predicate never matches', () => {
		const todos = collection('edge-upd-one-noop', { default: [...defaults] })

		const listener = vi.fn()

		todos.subscribe(listener)
		todos.update((item) => item.id === 999, { done: true }, { one: true })

		expect(listener).not.toHaveBeenCalled()
		expect(todos.get()).toEqual(defaults)

		todos.destroy()
	})

	it('update without one is no-op when no items match', () => {
		const todos = collection('edge-upd-multi-noop', { default: [...defaults] })

		const listener = vi.fn()

		todos.subscribe(listener)
		todos.update((item) => item.id === 999, { done: true })

		expect(listener).not.toHaveBeenCalled()
		expect(todos.get()).toEqual(defaults)

		todos.destroy()
	})

	it('update with function patch transforms the item', () => {
		const todos = collection('edge-upd-fn-patch', { default: [...defaults] })

		todos.update(
			(item) => item.id === 1,
			(item) => ({ ...item, text: 'updated', done: true }),
			{ one: true },
		)

		const updated = todos.find((item) => item.id === 1)

		expect(updated).toEqual({ id: 1, text: 'updated', done: true })

		todos.destroy()
	})

	it('find returns first matching item', () => {
		const todos = collection('edge-find', {
			default: [
				{ id: 1, text: 'a', done: true },
				{ id: 2, text: 'b', done: true },
				{ id: 3, text: 'c', done: false },
			],
		})

		const result = todos.find((item) => item.done)

		expect(result).toEqual({ id: 1, text: 'a', done: true })

		todos.destroy()
	})

	it('findAll returns all matching items', () => {
		const todos = collection('edge-findAll', {
			default: [
				{ id: 1, text: 'a', done: true },
				{ id: 2, text: 'b', done: false },
				{ id: 3, text: 'c', done: true },
			],
		})

		const result = todos.findAll((item) => item.done)

		expect(result).toEqual([
			{ id: 1, text: 'a', done: true },
			{ id: 3, text: 'c', done: true },
		])

		todos.destroy()
	})

	it('has returns true when match exists and false otherwise', () => {
		const todos = collection('edge-has', { default: [...defaults] })

		expect(todos.has((item) => item.id === 1)).toBe(true)
		expect(todos.has((item) => item.id === 999)).toBe(false)

		todos.destroy()
	})

	it('destroy cleans up watcher subscriptions', () => {
		const todos = collection('edge-destroy-watch', {
			default: [{ id: 1, text: 'a', done: false }],
		})

		const listener = vi.fn()

		todos.watch('text', listener)
		todos.add({ id: 2, text: 'b', done: false })

		expect(listener).toHaveBeenCalledTimes(1)

		todos.destroy()

		expect(todos.isDestroyed).toBe(true)
	})

	it('clear sets empty array and notifies subscriber', () => {
		const todos = collection('edge-clear', { default: [...defaults] })

		const listener = vi.fn()

		todos.subscribe(listener)
		todos.clear()

		expect(listener).toHaveBeenCalledWith([])
		expect(todos.size).toBe(0)

		todos.destroy()
	})
})
