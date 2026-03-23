import { describe, expect, it } from 'vitest'
import { state } from '../src/index.js'

describe('state three-argument overload', () => {
	it('accepts default value and options as separate arguments', () => {
		const s = state('ta-basic', 'light', { scope: 'memory' })

		expect(s.get()).toBe('light')
		expect(s.scope).toBe('memory')

		s.destroy()
	})

	it('works with number default', () => {
		const s = state('ta-number', 42, { scope: 'memory' })

		expect(s.get()).toBe(42)

		s.set(100)

		expect(s.get()).toBe(100)

		s.destroy()
	})

	it('works with object default', () => {
		const s = state('ta-object', { name: 'alice' }, { scope: 'memory' })

		expect(s.get()).toEqual({ name: 'alice' })

		s.destroy()
	})

	it('resets to the three-arg default', () => {
		const s = state('ta-reset', 'initial', { scope: 'memory' })

		s.set('changed')

		expect(s.get()).toBe('changed')

		s.reset()

		expect(s.get()).toBe('initial')

		s.destroy()
	})

	it('passes through advanced options', () => {
		const values: [string, string][] = []

		const s = state('ta-opts', 'a', {
			scope: 'memory',
			isEqual: (a, b) => a === b,
		})

		s.subscribe((v) => values.push([v, '']))

		s.set('a') // should be skipped (equal)
		s.set('b') // should fire

		expect(values.length).toBe(1)

		s.destroy()
	})

	it('still works with two-argument shorthand', () => {
		const s = state('ta-two-arg', 99)

		expect(s.get()).toBe(99)

		s.destroy()
	})

	it('still works with options object form', () => {
		const s = state('ta-opts-form', { default: 'hello' })

		expect(s.get()).toBe('hello')

		s.destroy()
	})
})
