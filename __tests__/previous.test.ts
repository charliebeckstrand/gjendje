import { describe, expect, it, vi } from 'vitest'
import { previous, state } from '../src/index.js'

describe('previous', () => {
	it('returns undefined before the first change', () => {
		const counter = state('prev-init', { default: 0, scope: 'render' })
		const prev = previous(counter)

		expect(prev.get()).toBeUndefined()
	})

	it('returns the previous value after a change', () => {
		const counter = state('prev-basic', { default: 0, scope: 'render' })
		const prev = previous(counter)

		counter.set(1)
		expect(prev.get()).toBe(0)

		counter.set(2)
		expect(prev.get()).toBe(1)

		counter.set(3)
		expect(prev.get()).toBe(2)
	})

	it('notifies subscribers when previous value changes', () => {
		const counter = state('prev-notify', { default: 0, scope: 'render' })
		const prev = previous(counter)

		const listener = vi.fn()

		prev.subscribe(listener)

		counter.set(1)
		expect(listener).toHaveBeenCalledWith(0)

		counter.set(2)
		expect(listener).toHaveBeenCalledWith(1)
	})

	it('works with object values', () => {
		const user = state('prev-obj', {
			default: { name: 'Jane', age: 30 },
			scope: 'render',
		})
		const prev = previous(user)

		const original = user.get()

		user.set({ name: 'John', age: 25 })
		expect(prev.get()).toBe(original)
	})

	it('auto-generates unique keys', () => {
		const s = state('prev-key-auto', { default: 0, scope: 'render' })
		const a = previous(s)
		const b = previous(s)

		expect(a.key).toContain('previous:')
		expect(b.key).toContain('previous:')
		expect(a.key).not.toBe(b.key)
	})

	it('uses provided key', () => {
		const s = state('prev-key-custom', { default: 0, scope: 'render' })
		const prev = previous(s, { key: 'my-previous' })

		expect(prev.key).toBe('my-previous')
	})

	it('peek returns same as get', () => {
		const counter = state('prev-peek', { default: 0, scope: 'render' })
		const prev = previous(counter)

		counter.set(1)
		expect(prev.peek()).toBe(prev.get())
	})

	it('destroy stops listening', () => {
		const counter = state('prev-destroy', { default: 0, scope: 'render' })
		const prev = previous(counter)

		const listener = vi.fn()

		prev.subscribe(listener)
		prev.destroy()

		counter.set(5)
		expect(listener).not.toHaveBeenCalled()
		expect(prev.isDestroyed).toBe(true)
	})

	it('has render scope', () => {
		const s = state('prev-scope', { default: 0, scope: 'render' })
		const prev = previous(s)

		expect(prev.scope).toBe('render')
	})
})
