import { describe, expect, it, vi } from 'vitest'
import { batch, computed, select, state } from '../src/index.js'

describe('select', () => {
	it('derives a value from a single source', () => {
		const user = state('sel-basic', { default: { name: 'Jane', age: 30 }, scope: 'memory' })

		const name = select(user, (u) => u.name)

		expect(name.get()).toBe('Jane')
	})

	it('recomputes when source changes', () => {
		const counter = state('sel-recompute', { default: 1, scope: 'memory' })

		const doubled = select(counter, (n) => n * 2)

		expect(doubled.get()).toBe(2)

		counter.set(5)
		expect(doubled.get()).toBe(10)
	})

	it('caches value between source changes', () => {
		const counter = state('sel-cache', { default: 1, scope: 'memory' })

		const fn = vi.fn((n: number) => n * 2)

		const doubled = select(counter, fn)

		doubled.get()
		doubled.get()
		doubled.get()

		expect(fn).toHaveBeenCalledTimes(1)
	})

	it('notifies subscribers on change', () => {
		const counter = state('sel-notify', { default: 0, scope: 'memory' })

		const doubled = select(counter, (n) => n * 2)

		const listener = vi.fn()

		doubled.subscribe(listener)
		counter.set(3)

		expect(listener).toHaveBeenCalledWith(6)
	})

	it('skips notification when derived value is unchanged', () => {
		const counter = state('sel-skip', { default: 1, scope: 'memory' })

		const isPositive = select(counter, (n) => n > 0)

		const listener = vi.fn()

		isPositive.subscribe(listener)
		counter.set(2) // still positive

		expect(listener).not.toHaveBeenCalled()
	})

	it('participates in batch()', () => {
		const counter = state('sel-batch', { default: 0, scope: 'memory' })

		const doubled = select(counter, (n) => n * 2)

		const listener = vi.fn()

		doubled.subscribe(listener)

		batch(() => {
			counter.set(1)
			counter.set(2)
			counter.set(3)
		})

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(6)
	})

	it('can depend on a computed instance', () => {
		const a = state('sel-comp-a', { default: 2, scope: 'memory' })
		const b = state('sel-comp-b', { default: 3, scope: 'memory' })

		const sum = computed([a, b], ([x, y]) => (x ?? 0) + (y ?? 0))

		const label = select(sum, (s) => `sum: ${s}`)

		expect(label.get()).toBe('sum: 5')

		a.set(10)
		expect(label.get()).toBe('sum: 13')
	})

	it('auto-generates unique keys', () => {
		const s = state('sel-key-auto', { default: 0, scope: 'memory' })

		const a = select(s, (n) => n)
		const b = select(s, (n) => n)

		expect(a.key).toContain('select:')
		expect(b.key).toContain('select:')
		expect(a.key).not.toBe(b.key)
	})

	it('uses provided key', () => {
		const s = state('sel-key-custom', { default: 0, scope: 'memory' })

		const derived = select(s, (n) => n, { key: 'my-select' })

		expect(derived.key).toBe('my-select')
	})

	it('has memory scope', () => {
		const s = state('sel-scope', { default: 0, scope: 'memory' })

		const derived = select(s, (n) => n)

		expect(derived.scope).toBe('memory')
	})

	it('peek returns cached value', () => {
		const s = state('sel-peek', { default: 5, scope: 'memory' })

		const doubled = select(s, (n) => n * 2)

		expect(doubled.peek()).toBe(10)
	})

	it('destroy stops listening', () => {
		const counter = state('sel-destroy', { default: 0, scope: 'memory' })

		const doubled = select(counter, (n) => n * 2)

		const listener = vi.fn()

		doubled.subscribe(listener)
		doubled.destroy()

		counter.set(5)
		expect(listener).not.toHaveBeenCalled()
		expect(doubled.isDestroyed).toBe(true)
	})
})
