import { afterEach, describe, expect, it } from 'vitest'
import { collection } from '../../src/collection.js'
import { destroyAll, snapshot, state } from '../../src/index.js'

afterEach(() => {
	destroyAll()
})

describe('snapshot with collection', () => {
	it('includes collection instances', () => {
		const items = collection('snap-coll', { default: [1, 2, 3] })

		const snap = snapshot()

		const entry = snap.find((s) => s.key === 'snap-coll')

		expect(entry).toBeDefined()
		expect(entry?.value).toEqual([1, 2, 3])
		expect(entry?.scope).toBe('memory')
		expect(entry?.isDestroyed).toBe(false)

		items.destroy()
	})

	it('reflects mutated values', () => {
		const a = state('snap-mut', { default: 0 })

		a.set(42)

		const snap = snapshot()

		const entry = snap.find((s) => s.key === 'snap-mut')

		expect(entry?.value).toBe(42)
	})

	it('excludes destroyed collection instances', () => {
		const items = collection('snap-coll-destroyed', { default: ['a'] })

		items.destroy()

		const snap = snapshot()

		const entry = snap.find((s) => s.key === 'snap-coll-destroyed')

		expect(entry).toBeUndefined()
	})
})
