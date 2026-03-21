import { describe, expect, it } from 'vitest'
import { snapshot, state } from '../src/index.js'

describe('snapshot', () => {
	it('returns an empty array when no state is registered', () => {
		expect(snapshot()).toEqual([])
	})

	it('returns all registered instances', () => {
		state('snap-a', { default: 1, scope: 'render' })
		state('snap-b', { default: 'hello', scope: 'render' })

		const result = snapshot()

		expect(result).toHaveLength(2)
		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'snap-a', scope: 'render', value: 1, isDestroyed: false }),
				expect.objectContaining({
					key: 'snap-b',
					scope: 'render',
					value: 'hello',
					isDestroyed: false,
				}),
			]),
		)
	})

	it('reflects current values', () => {
		const s = state('snap-val', { default: 0, scope: 'render' })

		s.set(42)

		const result = snapshot()
		const entry = result.find((e) => e.key === 'snap-val')

		expect(entry?.value).toBe(42)
	})
})
