import { afterEach, describe, expect, it } from 'vitest'
import { batch } from '../../src/batch.js'
import { collection } from '../../src/collection.js'
import { computed } from '../../src/computed.js'
import { resetConfig } from '../../src/config.js'
import { effect } from '../../src/effect.js'
import { destroyAll, state } from '../../src/index.js'

afterEach(() => {
	resetConfig()
})

describe('destroyAll with live computed and effects', () => {
	it('destroys state instances used by computed', () => {
		const a = state('da-comp-a', { default: 1 })
		const b = state('da-comp-b', { default: 2 })

		const sum = computed([a, b], ([va, vb]) => (va ?? 0) + (vb ?? 0))

		expect(sum.get()).toBe(3)

		destroyAll()

		expect(a.isDestroyed).toBe(true)
		expect(b.isDestroyed).toBe(true)

		// Setting values on destroyed state is a no-op
		a.set(10)

		expect(a.peek()).toBe(1)

		sum.destroy()
	})

	it('stops effects from receiving updates after destroyAll', () => {
		const a = state('da-eff-a', { default: 1 })

		const values: number[] = []

		const e = effect([a], ([v]) => {
			values.push(v ?? 0)
			return undefined
		})

		expect(values).toEqual([1])

		destroyAll()

		a.set(99)

		expect(values).toEqual([1])

		e.stop()
	})

	it('handles mix of state and collection types', () => {
		const s = state('da-mix-state', { default: 'hello' })
		const c = collection('da-mix-coll', { default: [1, 2, 3] })

		destroyAll()

		expect(s.isDestroyed).toBe(true)
		expect(c.isDestroyed).toBe(true)
	})

	it('does not crash during a batch', () => {
		const a = state('da-batch-a', { default: 0 })
		const b = state('da-batch-b', { default: 0 })

		expect(() => {
			batch(() => {
				a.set(1)
				destroyAll()
				b.set(2)
			})
		}).not.toThrow()
	})
})
