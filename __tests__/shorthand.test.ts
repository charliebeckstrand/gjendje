import { describe, expect, it } from 'vitest'
import { state } from '../src/index.js'

describe('state shorthand (default value as second argument)', () => {
	it('accepts a number as default', () => {
		const count = state('sh-number', 0)

		expect(count.get()).toBe(0)

		count.set(42)

		expect(count.get()).toBe(42)

		count.destroy()
	})

	it('accepts a string as default', () => {
		const name = state('sh-string', 'guest')

		expect(name.get()).toBe('guest')

		name.set('alice')

		expect(name.get()).toBe('alice')

		name.destroy()
	})

	it('accepts a boolean as default', () => {
		const flag = state('sh-boolean', false)

		expect(flag.get()).toBe(false)

		flag.set(true)

		expect(flag.get()).toBe(true)

		flag.destroy()
	})

	it('accepts null as default', () => {
		const maybe = state<string | null>('sh-null', null)

		expect(maybe.get()).toBe(null)

		maybe.set('hello')

		expect(maybe.get()).toBe('hello')

		maybe.destroy()
	})

	it('resets to the shorthand default', () => {
		const count = state('sh-reset', 10)

		count.set(99)
		count.reset()

		expect(count.get()).toBe(10)

		count.destroy()
	})

	it('still works with full options object', () => {
		const count = state('sh-full-opts', { default: 5 })

		expect(count.get()).toBe(5)

		count.destroy()
	})
})
