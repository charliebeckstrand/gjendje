import { shallowEqual } from '../../src/index.js'
import { defineSuite, runSuites } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. shallowEqual scaling
// ---------------------------------------------------------------------------

const shallowEqualSuite = defineSuite('shallow-equal', {
	'shallowEqual Scaling': (bench) => {
		bench.add('shallowEqual (identical primitives)', () => {
			shallowEqual(42, 42)
		})

		const smallA = { a: 1, b: 2, c: 3 }
		const smallB = { a: 1, b: 2, c: 3 }

		bench.add('shallowEqual (3-key objects, equal)', () => {
			shallowEqual(smallA, smallB)
		})

		const medA: Record<string, number> = {}
		const medB: Record<string, number> = {}

		for (let i = 0; i < 50; i++) {
			medA[`k${i}`] = i
			medB[`k${i}`] = i
		}

		bench.add('shallowEqual (50-key objects, equal)', () => {
			shallowEqual(medA, medB)
		})

		const lgA: Record<string, number> = {}
		const lgB: Record<string, number> = {}

		for (let i = 0; i < 500; i++) {
			lgA[`k${i}`] = i
			lgB[`k${i}`] = i
		}

		bench.add('shallowEqual (500-key objects, equal)', () => {
			shallowEqual(lgA, lgB)
		})

		// Unequal (early exit)
		const uneqA = { a: 1, b: 2, c: 3 }
		const uneqB = { a: 999, b: 2, c: 3 }

		bench.add('shallowEqual (3-key objects, first key differs)', () => {
			shallowEqual(uneqA, uneqB)
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites('Internal Benchmark: Utilities', [shallowEqualSuite], 'internal/utilities').catch(
	console.error,
)
