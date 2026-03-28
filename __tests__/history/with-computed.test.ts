import { describe, expect, it } from 'vitest'
import { computed } from '../../src/computed.js'
import { effect } from '../../src/effect.js'
import { withHistory } from '../../src/enhancers/history.js'
import { state } from '../../src/shortcuts.js'

describe('withHistory + computed', () => {
	it('computed reacts to undo/redo', () => {
		const counter = state('hist-comp-counter', { default: 0 })

		const h = withHistory(counter, { maxSize: 10 })

		const doubled = computed([h], ([v]) => (v ?? 0) * 2)

		h.set(5)

		expect(doubled.get()).toBe(10)

		h.undo()

		expect(doubled.get()).toBe(0)

		h.redo()

		expect(doubled.get()).toBe(10)

		doubled.destroy()
		counter.destroy()
	})

	it('computed subscriber fires on undo', () => {
		const counter = state('hist-comp-sub', { default: 1 })

		const h = withHistory(counter, { maxSize: 10 })

		const tripled = computed([h], ([v]) => (v ?? 0) * 3)

		const calls: number[] = []

		tripled.subscribe((v) => calls.push(v))

		h.set(2)
		h.set(3)
		h.undo()

		// Notifications: set(2) → 6, set(3) → 9, undo → 6
		expect(calls).toEqual([6, 9, 6])

		tripled.destroy()
		counter.destroy()
	})
})

describe('withHistory + effect', () => {
	it('effect reacts to undo', () => {
		const counter = state('hist-eff-counter', { default: 0 })

		const h = withHistory(counter, { maxSize: 10 })

		const values: number[] = []

		const e = effect([h], ([v]) => {
			values.push(v ?? 0)
			return undefined
		})

		h.set(10)
		h.set(20)
		h.undo()

		// Runs: initial 0, set(10), set(20), undo → 10
		expect(values).toEqual([0, 10, 20, 10])

		e.stop()
		counter.destroy()
	})
})
