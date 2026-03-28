import { describe, expect, it } from 'vitest'
import { computed } from '../../src/computed.js'
import { effect } from '../../src/effect.js'
import { state } from '../../src/shortcuts.js'

describe('DepValues runtime verification', () => {
	it('computed derivation receives correct tuple of dependency values', () => {
		const a = state('depval-a', { default: 10 })
		const b = state('depval-b', { default: 'hello' })
		const c = state('depval-c', { default: true })

		let receivedValues: unknown[] = []

		const derived = computed([a, b, c], (values) => {
			receivedValues = [...values]
			return `${values[0]}-${values[1]}-${values[2]}`
		})

		expect(receivedValues).toEqual([10, 'hello', true])
		expect(derived.get()).toBe('10-hello-true')

		a.set(20)
		b.set('world')

		expect(derived.get()).toBe('20-world-true')
		expect(receivedValues).toEqual([20, 'world', true])

		derived.destroy()
		a.destroy()
		b.destroy()
		c.destroy()
	})

	it('effect callback receives correct tuple of dependency values', () => {
		const x = state('depval-eff-x', { default: 5 })
		const y = state('depval-eff-y', { default: 'test' })

		const received: unknown[][] = []

		const e = effect([x, y], (values) => {
			received.push([...values])
			return undefined
		})

		expect(received).toEqual([[5, 'test']])

		x.set(10)

		expect(received).toEqual([
			[5, 'test'],
			[10, 'test'],
		])

		e.stop()
		x.destroy()
		y.destroy()
	})
})
