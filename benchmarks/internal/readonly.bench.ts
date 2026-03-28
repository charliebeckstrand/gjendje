import { computed, readonly, select, state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Readonly wrapper overhead
// ---------------------------------------------------------------------------

const readonlyOverheadSuite = defineSuite('readonly-overhead', {
	'Readonly Wrapper Overhead': (bench) => {
		// Direct state get
		const src = state(uniqueKey('ro-src'), { default: 42 })

		bench.add('state.get() — direct', () => {
			src.get()
		})

		// Readonly wrapper get
		const ro = readonly(src)

		bench.add('readonly.get() — via wrapper', () => {
			ro.get()
		})

		// Subscribe through readonly
		const srcSub = state(uniqueKey('ro-sub'), { default: 0 })

		const roSub = readonly(srcSub)

		roSub.subscribe(() => {})

		let iter = 0

		bench.add('write source → readonly subscriber notified', () => {
			srcSub.set(++iter)
		})

		// Direct subscribe for comparison
		const srcDirect = state(uniqueKey('ro-dir'), { default: 0 })

		srcDirect.subscribe(() => {})

		let iterD = 0

		bench.add('write source → direct subscriber notified', () => {
			srcDirect.set(++iterD)
		})
	},
})

// ---------------------------------------------------------------------------
// 2. Readonly of computed
// ---------------------------------------------------------------------------

const readonlyComputedSuite = defineSuite('readonly-computed', {
	'Readonly of Computed': (bench) => {
		// Computed get
		const a = state(uniqueKey('roc-a'), { default: 1 })

		const c = computed([a], ([v]) => v * 2)

		c.subscribe(() => {})

		let ic = 0

		bench.add('computed.get() — direct', () => {
			a.set(++ic)
			c.get()
		})

		// Readonly(computed) get
		const a2 = state(uniqueKey('roc-a2'), { default: 1 })

		const c2 = computed([a2], ([v]) => v * 2)

		const ro2 = readonly(c2)

		ro2.subscribe(() => {})

		let ic2 = 0

		bench.add('readonly(computed).get() — via wrapper', () => {
			a2.set(++ic2)
			ro2.get()
		})
	},
})

// ---------------------------------------------------------------------------
// 3. Readonly creation cost
// ---------------------------------------------------------------------------

const readonlyCreationSuite = defineSuite('readonly-creation', {
	'Readonly Creation Cost': (bench) => {
		bench.add('create readonly wrapper', () => {
			const src = state(uniqueKey('roc-create'), { default: 0 })

			readonly(src)

			src.destroy()
		})

		bench.add('create readonly(select(state))', () => {
			const src = state(uniqueKey('roc-sel'), { default: { x: 1 } })

			const sel = select(src, (v) => v.x)

			readonly(sel)

			sel.destroy()
			src.destroy()
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Readonly',
	[readonlyOverheadSuite, readonlyComputedSuite, readonlyCreationSuite],
	'internal/readonly',
).catch(console.error)
