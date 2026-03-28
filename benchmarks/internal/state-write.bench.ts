import { state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Updater styles: direct value vs functional updater
// ---------------------------------------------------------------------------

const updaterStyleSuite = defineSuite('updater-style', {
	'Updater Style (Direct vs Functional)': (bench) => {
		const sDirect = state(uniqueKey('upd-dir'), { default: 0 })

		sDirect.subscribe(() => {})

		let id = 0

		bench.add('set(value)', () => {
			sDirect.set(++id)
		})

		const sFn = state(uniqueKey('upd-fn'), { default: 0 })

		sFn.subscribe(() => {})

		bench.add('set(prev => prev + 1)', () => {
			sFn.set((prev) => prev + 1)
		})

		// No subscriber baseline
		const sNoSub = state(uniqueKey('upd-nosub'), { default: 0 })

		let ins = 0

		bench.add('set(value) — no subscribers', () => {
			sNoSub.set(++ins)
		})
	},
})

// ---------------------------------------------------------------------------
// 2. Large object writes
// ---------------------------------------------------------------------------

const largeObjectSuite = defineSuite('large-object', {
	'Large Object State (spread from prev)': (bench) => {
		// Spread from the previous state value — this is the realistic pattern.
		// Users typically do: set(prev => ({ ...prev, key: newVal }))
		// V8 optimises this well because the source shape is consistent.
		for (const size of [5, 50, 500]) {
			const obj: Record<string, number> = {}

			for (let i = 0; i < size; i++) obj[`k${i}`] = i

			const s = state(uniqueKey(`obj-${size}`), { default: obj })

			s.subscribe(() => {})

			bench.add(`set(prev => spread) (${size} keys)`, () => {
				s.set((prev) => ({ ...prev, k0: (prev as Record<string, number>).k0 + 1 }))
			})
		}
	},
	'Large Object State (spread from constant)': (bench) => {
		// Spread from a constant object — a V8 deopt worst case.
		// Included so regressions in this path are visible, but the numbers
		// are dominated by JS spread cost, not library overhead.
		for (const size of [5, 50, 500]) {
			const obj: Record<string, number> = {}

			for (let i = 0; i < size; i++) obj[`k${i}`] = i

			const s = state(uniqueKey(`obj-const-${size}`), { default: obj })

			s.subscribe(() => {})

			let iter = 0

			bench.add(`set({ ...constant }) (${size} keys)`, () => {
				s.set({ ...obj, k0: ++iter })
			})
		}
	},
	'Large Object State (set only, pre-built)': (bench) => {
		// Isolates pure library set() cost — no spread involved.
		for (const size of [5, 50, 500]) {
			const obj: Record<string, number> = {}

			for (let i = 0; i < size; i++) obj[`k${i}`] = i

			const prebuilt = Array.from({ length: 10000 }, (_, i) => ({ ...obj, k0: i }))

			const s = state(uniqueKey(`obj-pre-${size}`), { default: obj })

			s.subscribe(() => {})

			let idx = 0

			bench.add(`set(prebuilt) (${size} keys)`, () => {
				s.set(prebuilt[idx++ % 10000])
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 3. Custom equality (isEqual) overhead
// ---------------------------------------------------------------------------

const isEqualSuite = defineSuite('is-equal', {
	'Custom Equality (isEqual) Overhead': (bench) => {
		type Obj = { a: number; b: number; c: number }

		// No custom equality
		const sNoEq = state(uniqueKey('eq-none'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
		})

		sNoEq.subscribe(() => {})

		let ine = 0

		bench.add('write (no isEqual)', () => {
			sNoEq.set({ a: ++ine, b: 0, c: 0 })
		})

		// Always false (worst case — always notifies)
		const sEqFalse = state(uniqueKey('eq-false'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
			isEqual: () => false,
		})

		sEqFalse.subscribe(() => {})

		let ief = 0

		bench.add('write (isEqual: always false)', () => {
			sEqFalse.set({ a: ++ief, b: 0, c: 0 })
		})

		// Skips update (same value each time)
		const sEqSkip = state(uniqueKey('eq-skip'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
			isEqual: (a, b) => a.a === b.a && a.b === b.b && a.c === b.c,
		})

		sEqSkip.subscribe(() => {})

		bench.add('write (isEqual: skips update)', () => {
			sEqSkip.set({ a: 0, b: 0, c: 0 })
		})

		// JSON.stringify equality (expensive)
		const sJson = state(uniqueKey('eq-json'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
			isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
		})

		sJson.subscribe(() => {})

		let ij = 0

		bench.add('write (isEqual: JSON.stringify)', () => {
			sJson.set({ a: ++ij, b: 0, c: 0 })
		})
	},
})

// ---------------------------------------------------------------------------
// 4. Reset performance
// ---------------------------------------------------------------------------

const resetSuite = defineSuite('reset', {
	'Reset Performance': (bench) => {
		const sPlain = state(uniqueKey('rst-plain'), { default: 42 })

		sPlain.subscribe(() => {})
		sPlain.set(100)

		bench.add('reset (primitive)', () => {
			sPlain.set(100)
			sPlain.reset()
		})

		const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 }

		const sObj = state(uniqueKey('rst-obj'), { default: obj })

		sObj.subscribe(() => {})
		sObj.set({ a: 99, b: 99, c: 99, d: 99, e: 99 })

		bench.add('reset (object)', () => {
			sObj.set({ a: 99, b: 99, c: 99, d: 99, e: 99 })
			sObj.reset()
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: State Write',
	[updaterStyleSuite, largeObjectSuite, isEqualSuite, resetSuite],
	'internal/state-write',
).catch(console.error)
