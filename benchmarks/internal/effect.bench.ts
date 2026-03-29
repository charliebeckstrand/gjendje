import { effect, state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Effect trigger overhead
// ---------------------------------------------------------------------------

const triggerSuite = defineSuite('effect-trigger', {
	'Effect Trigger Overhead': (bench) => {
		// No cleanup
		const effSrc1 = state(uniqueKey('eff1'), { default: 0 })
		let effSink1 = 0

		effect([effSrc1], ([v]) => {
			effSink1 = v
		})

		let ie1 = 0

		bench.add('effect trigger (no cleanup)', () => {
			effSrc1.set(++ie1)
		})

		// With cleanup
		const effSrc2 = state(uniqueKey('eff2'), { default: 0 })

		let effSink2 = 0

		effect([effSrc2], ([v]) => {
			effSink2 = v

			return () => {
				effSink2 = 0
			}
		})

		let ie2 = 0

		bench.add('effect trigger (with cleanup)', () => {
			effSrc2.set(++ie2)
		})

		// 5 dependencies, change 1
		const effDeps5 = Array.from({ length: 5 }, (_, i) =>
			state(uniqueKey(`eff5-${i}`), { default: i }),
		)

		let effSum = 0

		effect(effDeps5, (vals) => {
			effSum = vals.reduce((a: number, b: number) => a + b, 0)
		})

		let ie5 = 0

		bench.add('effect trigger (5 deps, change 1)', () => {
			effDeps5[0].set(++ie5)
		})

		// Prevent dead-code elimination
		void effSink1
		void effSink2
		void effSum
	},
})

// ---------------------------------------------------------------------------
// 2. Effect with many dependencies
// ---------------------------------------------------------------------------

const manyDepsSuite = defineSuite('effect-many-deps', {
	'Effect with Many Dependencies': (bench) => {
		for (const count of [1, 10, 25]) {
			const deps = Array.from({ length: count }, (_, i) =>
				state(uniqueKey(`effdep${count}-${i}`), { default: i }),
			)

			let sink = 0

			effect(deps, (vals) => {
				sink = vals.length
			})

			let iter = 0

			bench.add(`effect trigger (${count} deps, change 1)`, () => {
				deps[0].set(++iter)
			})

			void sink
		}
	},
})

// ---------------------------------------------------------------------------
// 3. Effect start/stop lifecycle
// ---------------------------------------------------------------------------

const effectLifecycleSuite = defineSuite('effect-lifecycle', {
	'Effect Start/Stop Lifecycle': (bench) => {
		const src = state(uniqueKey('eff-lc'), { default: 0 })

		bench.add('create effect + stop', () => {
			const handle = effect([src], () => {})

			handle.stop()
		})

		bench.add('create effect + write + stop', () => {
			const handle = effect([src], () => {})

			src.set((v) => v + 1)
			
			handle.stop()
		})
	},
})

// ---------------------------------------------------------------------------
// 4. Multiple effects on same source
// ---------------------------------------------------------------------------

const multiEffectSuite = defineSuite('effect-multi', {
	'Multiple Effects on Same Source': (bench) => {
		for (const count of [1, 5, 20]) {
			const src = state(uniqueKey(`effmulti-${count}`), { default: 0 })

			const handles = Array.from({ length: count }, () => effect([src], () => {}))

			let iter = 0

			bench.add(`write with ${count} effect(s) listening`, () => {
				src.set(++iter)
			})

			// Keep handles alive for GC
			void handles
		}
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Effect',
	[triggerSuite, manyDepsSuite, effectLifecycleSuite, multiEffectSuite],
	'internal/effect',
).catch(console.error)
