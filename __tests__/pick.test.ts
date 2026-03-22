import { beforeEach, describe, expect, it } from 'vitest'
import { state } from '../src/index.js'
import { makeStorage } from './helpers.js'

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'BroadcastChannel', {
		value: class {
			onmessage = null
			postMessage() {}
			close() {}
		},
		configurable: true,
	})
})

// ---------------------------------------------------------------------------
// pick — read a single property from object state
// ---------------------------------------------------------------------------

describe('pick', () => {
	it('returns the value of a specific key', () => {
		const store = state('pick-basic', { default: { a: 1, b: 'hello', c: true } })

		expect(store.pick('a')).toBe(1)

		expect(store.pick('b')).toBe('hello')

		expect(store.pick('c')).toBe(true)

		store.destroy()
	})

	it('reflects updates made via set', () => {
		const store = state('pick-set', { default: { x: 10, y: 20 } })

		store.set({ x: 99, y: 20 })

		expect(store.pick('x')).toBe(99)

		expect(store.pick('y')).toBe(20)

		store.destroy()
	})

	it('reflects updates made via patch', () => {
		const store = state('pick-patch', { default: { name: 'Alice', age: 30 } })

		store.patch({ age: 31 })

		expect(store.pick('age')).toBe(31)

		expect(store.pick('name')).toBe('Alice')

		store.destroy()
	})

	it('returns the last value after destroy', () => {
		const store = state('pick-destroy', { default: { a: 1, b: 2 } })

		store.set({ a: 42, b: 2 })

		store.destroy()

		expect(store.pick('a')).toBe(42)
	})

	it('works with render scope', () => {
		const store = state('pick-render', { default: { color: 'red', size: 12 }, scope: 'render' })

		expect(store.pick('color')).toBe('red')

		store.set({ color: 'blue', size: 12 })

		expect(store.pick('color')).toBe('blue')

		store.destroy()
	})

	it('works with local scope', () => {
		const store = state('pick-local', { default: { theme: 'dark', lang: 'en' }, scope: 'local' })

		expect(store.pick('theme')).toBe('dark')

		store.patch({ theme: 'light' })

		expect(store.pick('theme')).toBe('light')

		store.destroy()
	})

	it('returns undefined for keys with undefined values', () => {
		const store = state<{ a: number; b: string | undefined }>('pick-undef', {
			default: { a: 1, b: undefined },
		})

		expect(store.pick('b')).toBeUndefined()

		store.destroy()
	})

	it('works after reset', () => {
		const store = state('pick-reset', { default: { count: 0 } })

		store.set({ count: 99 })

		expect(store.pick('count')).toBe(99)

		store.reset()

		expect(store.pick('count')).toBe(0)

		store.destroy()
	})
})
