import { state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. patch() vs set() for partial updates
// ---------------------------------------------------------------------------

const patchVsSetSuite = defineSuite('patch-vs-set', {
	'patch() vs set() for Partial Updates': (bench) => {
		type Obj = { a: number; b: number; c: number; d: number; e: number }

		const defaultObj: Obj = { a: 0, b: 0, c: 0, d: 0, e: 0 }

		// set() with spread
		const sSet = state(uniqueKey('pset'), { default: defaultObj })

		sSet.subscribe(() => {})

		let iSet = 0

		bench.add('set({ ...prev, a: n }) — spread', () => {
			iSet++
			sSet.set((prev) => ({ ...prev, a: iSet }))
		})

		// patch() single key
		const sPatch = state(uniqueKey('ppatch'), { default: defaultObj })

		sPatch.subscribe(() => {})

		let iPatch = 0

		bench.add('patch({ a: n }) — single key', () => {
			sPatch.patch({ a: ++iPatch })
		})

		// patch() multiple keys
		const sMulti = state(uniqueKey('pmulti'), { default: defaultObj })

		sMulti.subscribe(() => {})

		let iMulti = 0

		bench.add('patch({ a, b, c }) — 3 keys', () => {
			iMulti++
			sMulti.patch({ a: iMulti, b: iMulti, c: iMulti })
		})
	},
})

// ---------------------------------------------------------------------------
// 2. patch() scaling with object size
// ---------------------------------------------------------------------------

const patchScalingSuite = defineSuite('patch-scaling', {
	'patch() Scaling with Object Size': (bench) => {
		for (const size of [5, 50, 200]) {
			const obj: Record<string, number> = {}

			for (let i = 0; i < size; i++) obj[`k${i}`] = i

			const s = state(uniqueKey(`pscale-${size}`), { default: obj })

			s.subscribe(() => {})

			let iter = 0

			bench.add(`patch 1 key (object has ${size} keys)`, () => {
				s.patch({ k0: ++iter })
			})
		}

		for (const patchSize of [1, 10, 50]) {
			const obj: Record<string, number> = {}

			for (let i = 0; i < 100; i++) obj[`k${i}`] = i

			const s = state(uniqueKey(`ppatch-${patchSize}`), { default: obj })

			s.subscribe(() => {})

			let iter = 0

			const patchObj: Record<string, number> = {}

			for (let i = 0; i < patchSize; i++) patchObj[`k${i}`] = 0

			bench.add(`patch ${patchSize} key(s) (object has 100 keys)`, () => {
				iter++

				for (const k of Object.keys(patchObj)) {
					patchObj[k] = iter
				}

				s.patch(patchObj)
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 3. patch() with interceptors
// ---------------------------------------------------------------------------

const patchMiddlewareSuite = defineSuite('patch-middleware', {
	'patch() with Middleware': (bench) => {
		type Obj = { a: number; b: number; c: number }

		const defaultObj: Obj = { a: 0, b: 0, c: 0 }

		// patch() with no middleware
		const sPlain = state(uniqueKey('pp-plain'), { default: defaultObj })

		sPlain.subscribe(() => {})

		let ip = 0

		bench.add('patch (no middleware)', () => {
			sPlain.patch({ a: ++ip })
		})

		// patch() with 1 interceptor
		const s1i = state(uniqueKey('pp-1i'), { default: defaultObj })

		s1i.intercept((next) => next)
		s1i.subscribe(() => {})

		let i1 = 0

		bench.add('patch (1 interceptor)', () => {
			s1i.patch({ a: ++i1 })
		})

		// patch() with 1 interceptor + 1 onChange
		const sBoth = state(uniqueKey('pp-both'), { default: defaultObj })

		sBoth.intercept((next) => next)
		sBoth.onChange(() => {})
		sBoth.subscribe(() => {})

		let ib = 0

		bench.add('patch (1 interceptor + 1 onChange)', () => {
			sBoth.patch({ a: ++ib })
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Patch',
	[patchVsSetSuite, patchScalingSuite, patchMiddlewareSuite],
	'internal/patch',
).catch(console.error)
