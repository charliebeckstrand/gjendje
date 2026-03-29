import { state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Interceptor overhead
// ---------------------------------------------------------------------------

const interceptorSuite = defineSuite('interceptor', {
	'Interceptor Overhead': (bench) => {
		// Baseline: no middleware
		const mPlain = state(uniqueKey('mw-plain'), { default: 0 })

		mPlain.subscribe(() => {})

		let imp = 0

		bench.add('write (no middleware)', () => {
			mPlain.set(++imp)
		})

		// 1 interceptor (passthrough)
		const m1i = state(uniqueKey('mw-1i'), { default: 0 })

		m1i.intercept((next) => next)

		m1i.subscribe(() => {})

		let i1i = 0

		bench.add('write (1 interceptor)', () => {
			m1i.set(++i1i)
		})

		// 5 interceptors (passthrough)
		const m5i = state(uniqueKey('mw-5i'), { default: 0 })

		for (let j = 0; j < 5; j++) {
			m5i.intercept((next) => next)
		}

		m5i.subscribe(() => {})

		let i5i = 0

		bench.add('write (5 interceptors)', () => {
			m5i.set(++i5i)
		})

		// Interceptor that transforms value
		const mTransform = state(uniqueKey('mw-transform'), { default: 0 })

		mTransform.intercept((next) => Math.max(0, next))
		
		mTransform.subscribe(() => {})

		let iTr = 0

		bench.add('write (1 clamping interceptor)', () => {
			mTransform.set(++iTr)
		})
	},
})

// ---------------------------------------------------------------------------
// 2. onChange hook overhead
// ---------------------------------------------------------------------------

const onChangeSuite = defineSuite('on-change', {
	'onChange Hook Overhead': (bench) => {
		// 1 onChange hook
		const m1h = state(uniqueKey('mw-1h'), { default: 0 })

		m1h.onChange(() => {})
		m1h.subscribe(() => {})

		let i1h = 0

		bench.add('write (1 onChange hook)', () => {
			m1h.set(++i1h)
		})

		// 5 onChange hooks
		const m5h = state(uniqueKey('mw-5h'), { default: 0 })

		for (let j = 0; j < 5; j++) {
			m5h.onChange(() => {})
		}

		m5h.subscribe(() => {})

		let i5h = 0

		bench.add('write (5 onChange hooks)', () => {
			m5h.set(++i5h)
		})

		// 10 onChange hooks
		const m10h = state(uniqueKey('mw-10h'), { default: 0 })

		for (let j = 0; j < 10; j++) {
			m10h.onChange(() => {})
		}

		m10h.subscribe(() => {})

		let i10h = 0

		bench.add('write (10 onChange hooks)', () => {
			m10h.set(++i10h)
		})
	},
})

// ---------------------------------------------------------------------------
// 3. Combined interceptors + hooks
// ---------------------------------------------------------------------------

const combinedSuite = defineSuite('combined-middleware', {
	'Combined Interceptors + Hooks': (bench) => {
		// 5 interceptors + 5 hooks
		const mAll = state(uniqueKey('mw-all'), { default: 0 })

		for (let j = 0; j < 5; j++) {
			mAll.intercept((next) => next)
			mAll.onChange(() => {})
		}

		mAll.subscribe(() => {})

		let iAll = 0

		bench.add('write (5 interceptors + 5 hooks)', () => {
			mAll.set(++iAll)
		})

		// 10 interceptors + 10 hooks
		const mHeavy = state(uniqueKey('mw-heavy'), { default: 0 })

		for (let j = 0; j < 10; j++) {
			mHeavy.intercept((next) => next)
			mHeavy.onChange(() => {})
		}

		mHeavy.subscribe(() => {})

		let iHeavy = 0

		bench.add('write (10 interceptors + 10 hooks)', () => {
			mHeavy.set(++iHeavy)
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Middleware',
	[interceptorSuite, onChangeSuite, combinedSuite],
	'internal/middleware',
).catch(console.error)
