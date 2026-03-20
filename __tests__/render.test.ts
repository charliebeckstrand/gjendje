import { describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'

describe('render scope', () => {
	it('returns the default value', () => {
		const count = state('render-default', { default: 0 })

		expect(count.get()).toBe(0)

		count.destroy()
	})

	it('updates the value with set', () => {
		const count = state('render-set', { default: 0 })

		count.set(5)

		expect(count.get()).toBe(5)

		count.destroy()
	})

	it('supports updater function', () => {
		const count = state('render-updater', { default: 0 })

		count.set((prev) => prev + 1)
		count.set((prev) => prev + 1)

		expect(count.get()).toBe(2)

		count.destroy()
	})

	it('resets to default', () => {
		const count = state('render-reset', { default: 10 })

		count.set(99)
		count.reset()

		expect(count.get()).toBe(10)

		count.destroy()
	})

	it('notifies subscribers on change', () => {
		const theme = state('render-notify', { default: 'light' as 'light' | 'dark' })
		const listener = vi.fn()

		theme.subscribe(listener)
		theme.set('dark')

		expect(listener).toHaveBeenCalledWith('dark')
		expect(listener).toHaveBeenCalledTimes(1)

		theme.destroy()
	})

	it('unsubscribes cleanly', () => {
		const theme = state('render-unsub', { default: 'light' })
		const listener = vi.fn()

		const unsub = theme.subscribe(listener)

		theme.set('dark')
		unsub()
		theme.set('light')

		expect(listener).toHaveBeenCalledTimes(1)

		theme.destroy()
	})

	it('supports multiple subscribers', () => {
		const value = state('render-multi-sub', { default: 0 })
		const a = vi.fn()
		const b = vi.fn()

		value.subscribe(a)
		value.subscribe(b)
		value.set(42)

		expect(a).toHaveBeenCalledWith(42)
		expect(a).toHaveBeenCalledTimes(1)
		expect(b).toHaveBeenCalledWith(42)
		expect(b).toHaveBeenCalledTimes(1)

		value.destroy()
	})

	it('exposes scope and key', () => {
		const x = state('render-meta', { default: '' })

		expect(x.scope).toBe('render')
		expect(x.key).toBe('render-meta')

		x.destroy()
	})

	it('works with object values', () => {
		const user = state('render-object', { default: { name: 'Alice', age: 30 } })

		user.set((prev) => ({ ...prev, age: 31 }))

		expect(user.get()).toEqual({ name: 'Alice', age: 31 })

		user.destroy()
	})

	it('works with array values', () => {
		const items = state('render-array', { default: [] as string[] })

		items.set(['a', 'b'])
		items.set((prev) => [...prev, 'c'])

		expect(items.get()).toEqual(['a', 'b', 'c'])

		items.destroy()
	})

	it('stops notifying after destroy', () => {
		const x = state('render-post-destroy', { default: 0 })
		const listener = vi.fn()

		x.subscribe(listener)
		x.destroy()

		// Set on the destroyed instance — no-ops, no notification
		x.set(1)

		expect(listener).not.toHaveBeenCalled()
	})
})
