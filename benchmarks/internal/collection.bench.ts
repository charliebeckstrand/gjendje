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
// 4. Collection watch at scale
// ---------------------------------------------------------------------------

const watchSuite = defineSuite('collection-watch', {
	'Collection Watch at Scale': (bench) => {
		const items100 = Array.from({ length: 100 }, (_, i) => ({
			id: i,
			name: `item-${i}`,
			score: i,
		}))

		const col100 = collection(uniqueKey('cw-100'), { default: [...items100] })

		col100.watch('score', () => {})

		let ic100 = 0

		bench.add('collection.watch (100 items, 1 key)', () => {
			col100.update((item) => item.id === 0, { score: ++ic100 })
		})

		const items1000 = Array.from({ length: 1000 }, (_, i) => ({
			id: i,
			name: `item-${i}`,
			score: i,
		}))

		const col1000 = collection(uniqueKey('cw-1000'), { default: [...items1000] })

		col1000.watch('score', () => {})

		let ic1000 = 0

		bench.add('collection.watch (1000 items, 1 key)', () => {
			col1000.update((item) => item.id === 0, { score: ++ic1000 })
		})

		const col1000m = collection(uniqueKey('cw-1000m'), { default: [...items1000] })

		col1000m.watch('id', () => {})
		col1000m.watch('name', () => {})
		col1000m.watch('score', () => {})

		let ic1000m = 0

		bench.add('collection.watch (1000 items, 3 keys)', () => {
			col1000m.update((item) => item.id === 0, { score: ++ic1000m })
		})

		const colBase = collection(uniqueKey('cw-base'), { default: [...items1000] })

		colBase.subscribe(() => {})

		let icb = 0

		bench.add('collection.update (1000 items, no watch)', () => {
			colBase.update((item) => item.id === 0, { score: ++icb })
		})
	},
})

// ---------------------------------------------------------------------------
// 5. Collection operation chaining (batched vs unbatched)
// ---------------------------------------------------------------------------

import { batch } from '../../src/index.js'

const chainingSuite = defineSuite('collection-chaining', {
	'Collection Operation Chaining': (bench) => {
		const items = Array.from({ length: 100 }, (_, i) => ({ id: i, value: i }))

		const colSingle = collection(uniqueKey('chain-1'), { default: [...items] })

		colSingle.subscribe(() => {})

		let is = 0

		bench.add('1 mutation (add)', () => {
			colSingle.add({ id: 1000 + is, value: ++is })
			colSingle.set([...items])
		})

		const col3 = collection(uniqueKey('chain-3'), { default: [...items] })

		col3.subscribe(() => {})

		let i3 = 0

		bench.add('3 mutations unbatched', () => {
			i3++
			col3.add({ id: 1000 + i3, value: i3 })
			col3.update((item) => item.id === 0, { value: i3 })
			col3.remove((item) => item.id === 1000 + i3)
		})

		const col3b = collection(uniqueKey('chain-3b'), { default: [...items] })

		col3b.subscribe(() => {})

		let i3b = 0

		bench.add('3 mutations batched', () => {
			i3b++

			batch(() => {
				col3b.add({ id: 1000 + i3b, value: i3b })
				col3b.update((item) => item.id === 0, { value: i3b })
				col3b.remove((item) => item.id === 1000 + i3b)
			})
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Collection',
	[crudSuite, scalingSuite, utilSuite, watchSuite, chainingSuite],
	'internal/collection',
).catch(console.error)
