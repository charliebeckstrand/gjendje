import { computed, state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Computed chain depth
// ---------------------------------------------------------------------------

const chainSuite = defineSuite('computed-chain', {
	'Computed Chain Depth': (bench) => {
		for (const depth of [5, 10, 25]) {
			const src = state(uniqueKey(`chain${depth}`), { default: 0 })

			let prev = computed([src], ([v]) => v + 1)

			for (let i = 1; i < depth; i++) {
				prev = computed([prev], ([v]) => v + 1)
			}

			const end = prev

			let iter = 0

			bench.add(`computed chain (depth ${depth})`, () => {
				src.set(++iter)
				end.get()
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 2. Computed fan-in (many dependencies)
// ---------------------------------------------------------------------------

const fanInSuite = defineSuite('computed-fan-in', {
	'Computed Fan-In (Many Dependencies)': (bench) => {
		for (const count of [5, 20, 50]) {
			const deps = Array.from({ length: count }, (_, i) =>
				state(uniqueKey(`fan${count}-${i}`), { default: i }),
			)

			const comp = computed(deps, (vals) => vals.reduce((a: number, b: number) => a + b, 0))

			let iter = 0

			bench.add(`computed fan-in (${count} deps)`, () => {
				deps[0].set(++iter)
				comp.get()
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 3. Diamond dependency graph
// ---------------------------------------------------------------------------

const diamondSuite = defineSuite('computed-diamond', {
	'Diamond Dependency Graph': (bench) => {
		// Simple diamond: A → B, A → C, B+C → D
		const a = state(uniqueKey('dia-a'), { default: 0 })

		const b = computed([a], ([v]) => v * 2)

		const c = computed([a], ([v]) => v + 10)

		const d = computed([b, c], ([bv, cv]) => bv + cv)

		d.subscribe(() => {})

		let iter = 0

		bench.add('diamond (A→B,C→D)', () => {
			a.set(++iter)
			d.get()
		})

		// Wide diamond: A → 10 intermediaries → final
		const wSrc = state(uniqueKey('dia-w'), { default: 0 })

		const intermediaries = Array.from({ length: 10 }, (_, i) => computed([wSrc], ([v]) => v + i))

		const wFinal = computed(intermediaries, (vals) =>
			vals.reduce((a: number, b: number) => a + b, 0),
		)

		wFinal.subscribe(() => {})

		let wIter = 0

		bench.add('wide diamond (A → 10 → final)', () => {
			wSrc.set(++wIter)
			wFinal.get()
		})

		// Deep diamond: A → B1,B2 → C1,C2 → D (3 levels)
		const dSrc = state(uniqueKey('dia-d'), { default: 0 })

		const dB1 = computed([dSrc], ([v]) => v + 1)
		const dB2 = computed([dSrc], ([v]) => v * 2)

		const dC1 = computed([dB1, dB2], ([x, y]) => x + y)
		const dC2 = computed([dB1, dB2], ([x, y]) => x * y)

		const dD = computed([dC1, dC2], ([x, y]) => x + y)

		dD.subscribe(() => {})

		let dIter = 0

		bench.add('deep diamond (3 levels, 5 nodes)', () => {
			dSrc.set(++dIter)
			dD.get()
		})
	},
})

// ---------------------------------------------------------------------------
// 4. Computed with subscriber overhead
// ---------------------------------------------------------------------------

const subscriberOverheadSuite = defineSuite('computed-subscribers', {
	'Computed Subscriber Overhead': (bench) => {
		// 0 subscribers (lazy — just .get())
		const s0 = state(uniqueKey('csub-0'), { default: 0 })

		const c0 = computed([s0], ([v]) => v * 2)

		let i0 = 0

		bench.add('computed get (0 subscribers)', () => {
			s0.set(++i0)
			c0.get()
		})

		// 1 subscriber
		const s1 = state(uniqueKey('csub-1'), { default: 0 })

		const c1 = computed([s1], ([v]) => v * 2)

		c1.subscribe(() => {})

		let i1 = 0

		bench.add('computed get (1 subscriber)', () => {
			s1.set(++i1)
			c1.get()
		})

		// 10 subscribers
		const s10 = state(uniqueKey('csub-10'), { default: 0 })

		const c10 = computed([s10], ([v]) => v * 2)

		for (let j = 0; j < 10; j++) c10.subscribe(() => {})

		let i10 = 0

		bench.add('computed get (10 subscribers)', () => {
			s10.set(++i10)
			c10.get()
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Computed',
	[chainSuite, fanInSuite, diamondSuite, subscriberOverheadSuite],
	'internal/computed',
).catch(console.error)
