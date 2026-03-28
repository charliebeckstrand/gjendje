import { collection } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Collection CRUD at scale
// ---------------------------------------------------------------------------

const crudSuite = defineSuite('collection-crud', {
	'Collection Operations (1000 items)': (bench) => {
		type Item = { id: number; name: string; done: boolean }

		const items: Item[] = Array.from({ length: 1000 }, (_, i) => ({
			id: i,
			name: `item-${i}`,
			done: i % 2 === 0,
		}))

		// --- add ---
		bench.add('collection.add (append 1 item)', () => {
			const col = collection(uniqueKey('col-add'), { default: [] as Item[] })
			col.add({ id: 0, name: 'new', done: false })
			col.destroy()
		})

		const colLarge = collection(uniqueKey('col-add-lg'), { default: [...items] })

		bench.add('collection.add (to 1000 items)', () => {
			colLarge.add({ id: 9999, name: 'new', done: false })
			colLarge.set([...items])
		})

		// --- remove ---
		const colRemove = collection(uniqueKey('col-rm'), { default: [...items] })
		let rmId = 0

		bench.add('collection.remove (from 1000 items)', () => {
			colRemove.set([...items])
			colRemove.remove((item) => item.id === rmId++ % 1000)
		})

		// --- remove one ---
		const colRemoveOne = collection(uniqueKey('col-rm1'), { default: [...items] })
		let rmOneId = 0

		bench.add('collection.remove one (from 1000 items)', () => {
			colRemoveOne.set([...items])
			colRemoveOne.remove((item) => item.id === rmOneId++ % 1000, { one: true })
		})

		// --- update ---
		const colUpdate = collection(uniqueKey('col-up'), { default: [...items] })
		let upId = 0

		bench.add('collection.update (in 1000 items)', () => {
			colUpdate.update((item) => item.id === upId++ % 1000, { done: true })
		})

		// --- update one ---
		const colUpdateOne = collection(uniqueKey('col-up1'), { default: [...items] })
		let upOneId = 0

		bench.add('collection.update one (in 1000 items)', () => {
			colUpdateOne.update((item) => item.id === upOneId++ % 1000, { done: true }, { one: true })
		})

		// --- find ---
		const colFind = collection(uniqueKey('col-find'), { default: [...items] })
		let findId = 0

		bench.add('collection.find (in 1000 items)', () => {
			colFind.find((item) => item.id === findId++ % 1000)
		})
	},
})

// ---------------------------------------------------------------------------
// 2. Collection size scaling
// ---------------------------------------------------------------------------

const scalingSuite = defineSuite('collection-scaling', {
	'Collection Size Scaling': (bench) => {
		type Item = { id: number; value: number }

		for (const size of [100, 1000, 5000]) {
			const items: Item[] = Array.from({ length: size }, (_, i) => ({
				id: i,
				value: i,
			}))

			const col = collection(uniqueKey(`col-scale-${size}`), { default: [...items] })

			col.subscribe(() => {})

			bench.add(`add + remove (${size} items)`, () => {
				col.add({ id: size, value: size })
				col.remove((item) => item.id === size)
			})
		}

		for (const size of [100, 1000, 5000]) {
			const items: Item[] = Array.from({ length: size }, (_, i) => ({
				id: i,
				value: i,
			}))

			const col = collection(uniqueKey(`col-findall-${size}`), { default: [...items] })

			bench.add(`findAll even items (${size} items)`, () => {
				col.findAll((item) => item.id % 2 === 0)
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 3. Collection has + clear
// ---------------------------------------------------------------------------

const utilSuite = defineSuite('collection-util', {
	'Collection Utilities': (bench) => {
		type Item = { id: number }

		const items500: Item[] = Array.from({ length: 500 }, (_, i) => ({ id: i }))

		const colHas = collection(uniqueKey('col-has'), { default: [...items500] })
		let hasId = 0

		bench.add('collection.has (500 items)', () => {
			colHas.has((item) => item.id === hasId++ % 500)
		})

		const colClear = collection(uniqueKey('col-clear'), { default: [] as Item[] })

		colClear.subscribe(() => {})

		bench.add('collection.clear (repopulate 100 + clear)', () => {
			const batch = Array.from({ length: 100 }, (_, i) => ({ id: i }))
			colClear.set(batch)
			colClear.clear()
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Collection',
	[crudSuite, scalingSuite, utilSuite],
	'internal/collection',
).catch(console.error)
