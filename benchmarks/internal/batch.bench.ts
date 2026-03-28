import { batch, computed, effect, state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Batch scaling with number of state instances
// ---------------------------------------------------------------------------

const scalingSuite = defineSuite('batch-scaling', {
	'Batch Scaling': (bench) => {
		for (const count of [10, 50, 200]) {
			const items = Array.from({ length: count }, (_, i) =>
				state(uniqueKey(`bscale-${count}`), { default: i }),
			)

			for (const item of items) {
				item.subscribe(() => {})
			}

			let iter = 0

			bench.add(`batch (${count} states)`, () => {
				iter++

				batch(() => {
					for (let i = 0; i < count; i++) {
						items[i].set(iter + i)
					}
				})
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 2. Nested batch depth
// ---------------------------------------------------------------------------

const nestedSuite = defineSuite('nested-batch', {
	'Nested Batch Depth': (bench) => {
		const nbSrc = state(uniqueKey('nb'), { default: 0 })

		nbSrc.subscribe(() => {})

		let inb1 = 0

		bench.add('flat batch (1 level)', () => {
			batch(() => {
				nbSrc.set(++inb1)
			})
		})

		let inb3 = 0

		bench.add('nested batch (3 levels)', () => {
			batch(() => {
				batch(() => {
					batch(() => {
						nbSrc.set(++inb3)
					})
				})
			})
		})

		let inb10 = 0

		bench.add('nested batch (10 levels)', () => {
			function nest(depth: number): void {
				if (depth === 0) {
					nbSrc.set(++inb10)

					return
				}

				batch(() => nest(depth - 1))
			}

			nest(10)
		})
	},
})

// ---------------------------------------------------------------------------
// 3. Batch with computed consumers
// ---------------------------------------------------------------------------

const batchComputedSuite = defineSuite('batch-computed', {
	'Batch with Computed Consumers': (bench) => {
		// Batch updates to multiple deps of a single computed
		const deps10 = Array.from({ length: 10 }, (_, i) =>
			state(uniqueKey(`bc10-${i}`), { default: i }),
		)

		const sum10 = computed(deps10, (vals) => vals.reduce((a: number, b: number) => a + b, 0))

		sum10.subscribe(() => {})

		let iter10 = 0

		bench.add('batch 10 deps → 1 computed', () => {
			iter10++

			batch(() => {
				for (const dep of deps10) {
					dep.set(iter10)
				}
			})
		})

		// Batch updates to deps shared by multiple computeds
		const sharedA = state(uniqueKey('bc-sha'), { default: 0 })
		const sharedB = state(uniqueKey('bc-shb'), { default: 0 })

		const c1 = computed([sharedA, sharedB], ([a, b]) => a + b)
		const c2 = computed([sharedA, sharedB], ([a, b]) => a * b)
		const c3 = computed([sharedA, sharedB], ([a, b]) => a - b)

		c1.subscribe(() => {})
		c2.subscribe(() => {})
		c3.subscribe(() => {})

		let iterShared = 0

		bench.add('batch 2 deps → 3 computeds', () => {
			iterShared++

			batch(() => {
				sharedA.set(iterShared)
				sharedB.set(iterShared + 1)
			})
		})
	},
})

// ---------------------------------------------------------------------------
// 4. Batch with effects
// ---------------------------------------------------------------------------

const batchEffectSuite = defineSuite('batch-effect', {
	'Batch with Effect Consumers': (bench) => {
		const deps5 = Array.from({ length: 5 }, (_, i) => state(uniqueKey(`be5-${i}`), { default: i }))

		for (const dep of deps5) {
			effect([dep], () => {})
		}

		let iter = 0

		bench.add('batch 5 states with 5 independent effects', () => {
			iter++

			batch(() => {
				for (const dep of deps5) {
					dep.set(iter)
				}
			})
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Batch',
	[scalingSuite, nestedSuite, batchComputedSuite, batchEffectSuite],
	'internal/batch',
).catch(console.error)
