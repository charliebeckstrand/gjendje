import { computed, select, state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Select vs computed for single-dep projections
// ---------------------------------------------------------------------------

const selectVsComputedSuite = defineSuite('select-vs-computed', {
	'Select vs Computed (Single Dependency)': (bench) => {
		type User = { name: string; age: number; email: string }

		const userDefault: User = { name: 'Jane', age: 30, email: 'jane@example.com' }

		// select: field projection
		const sSrc = state(uniqueKey('sel-src'), { default: userDefault })

		const sName = select(sSrc, (u) => u.name)

		sName.subscribe(() => {})

		let is = 0

		bench.add('select (field projection)', () => {
			sSrc.set({ ...userDefault, age: ++is })
			sName.get()
		})

		// computed: equivalent single-dep
		const cSrc = state(uniqueKey('comp-src'), { default: userDefault })

		const cName = computed([cSrc], ([u]) => u.name)

		cName.subscribe(() => {})

		let ic = 0

		bench.add('computed (single dep, same projection)', () => {
			cSrc.set({ ...userDefault, age: ++ic })
			cName.get()
		})
	},
})

// ---------------------------------------------------------------------------
// 2. Select chain (select of select)
// ---------------------------------------------------------------------------

const selectChainSuite = defineSuite('select-chain', {
	'Select Chain': (bench) => {
		type Nested = { data: { items: { count: number } } }

		const nested: Nested = { data: { items: { count: 0 } } }

		const src = state(uniqueKey('sel-chain'), { default: nested })

		const data = select(src, (v) => v.data)

		const items = select(data, (v) => v.items)

		const count = select(items, (v) => v.count)

		count.subscribe(() => {})

		let iter = 0

		bench.add('select chain (3 levels deep)', () => {
			src.set({ data: { items: { count: ++iter } } })
			count.get()
		})

		// Single select doing the same
		const srcFlat = state(uniqueKey('sel-flat'), { default: nested })

		const countFlat = select(srcFlat, (v) => v.data.items.count)

		countFlat.subscribe(() => {})

		let iterFlat = 0

		bench.add('select flat (1 level, deep access)', () => {
			srcFlat.set({ data: { items: { count: ++iterFlat } } })
			countFlat.get()
		})
	},
})

// ---------------------------------------------------------------------------
// 3. Select creation throughput
// ---------------------------------------------------------------------------

const selectCreationSuite = defineSuite('select-creation', {
	'Select Creation Throughput': (bench) => {
		bench.add('create + destroy 10 selects', () => {
			const src = state(uniqueKey('sel-c10'), { default: { x: 0 } })

			const selects = Array.from({ length: 10 }, () => select(src, (v) => v.x))

			for (const s of selects) s.destroy()

			src.destroy()
		})

		bench.add('create + destroy 50 selects', () => {
			const src = state(uniqueKey('sel-c50'), { default: { x: 0 } })

			const selects = Array.from({ length: 50 }, () => select(src, (v) => v.x))

			for (const s of selects) s.destroy()

			src.destroy()
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Select',
	[selectVsComputedSuite, selectChainSuite, selectCreationSuite],
	'internal/select',
).catch(console.error)
