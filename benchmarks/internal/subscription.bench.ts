import { state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Subscribe/unsubscribe churn
// ---------------------------------------------------------------------------

const churnSuite = defineSuite('subscribe-churn', {
	'Subscribe/Unsubscribe Churn': (bench) => {
		const sSrc = state(uniqueKey('churn'), { default: 0 })

		bench.add('subscribe + immediate unsubscribe', () => {
			const unsub = sSrc.subscribe(() => {})
			unsub()
		})

		bench.add('subscribe + write + unsubscribe', () => {
			const unsub = sSrc.subscribe(() => {})
			sSrc.set((v) => v + 1)
			unsub()
		})

		// Accumulate then teardown
		bench.add('accumulate 100 subs + teardown', () => {
			const unsubs: (() => void)[] = []

			for (let i = 0; i < 100; i++) {
				unsubs.push(sSrc.subscribe(() => {}))
			}

			for (const unsub of unsubs) {
				unsub()
			}
		})
	},
})

// ---------------------------------------------------------------------------
// 2. Subscriber fan-out (write cost with N subscribers)
// ---------------------------------------------------------------------------

const fanOutSuite = defineSuite('subscriber-fan-out', {
	'Subscriber Fan-Out (Write Cost with N Subscribers)': (bench) => {
		for (const count of [1, 10, 50, 200]) {
			const s = state(uniqueKey(`fanout-${count}`), { default: 0 })

			for (let i = 0; i < count; i++) {
				s.subscribe(() => {})
			}

			let iter = 0

			bench.add(`write with ${count} subscriber(s)`, () => {
				s.set(++iter)
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 3. Watch (per-key) overhead
// ---------------------------------------------------------------------------

const watchSuite = defineSuite('watch', {
	'Watch (Per-Key) Overhead': (bench) => {
		type Obj = { a: number; b: number; c: number; d: number; e: number }

		// Subscribe (whole value) baseline
		const wSub = state(uniqueKey('watch-sub'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		wSub.subscribe(() => {})

		let isub = 0

		bench.add('write + subscribe (whole object)', () => {
			wSub.set({ a: ++isub, b: 0, c: 0, d: 0, e: 0 })
		})

		// Watch 1 key
		const w1 = state(uniqueKey('watch-1'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		w1.watch('a', () => {})

		let iw1 = 0

		bench.add('write + watch (1 key)', () => {
			w1.set({ a: ++iw1, b: 0, c: 0, d: 0, e: 0 })
		})

		// Watch 5 keys
		const w5 = state(uniqueKey('watch-5'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		w5.watch('a', () => {})
		w5.watch('b', () => {})
		w5.watch('c', () => {})
		w5.watch('d', () => {})
		w5.watch('e', () => {})

		let iw5 = 0

		bench.add('write + watch (5 keys)', () => {
			w5.set({ a: ++iw5, b: 0, c: 0, d: 0, e: 0 })
		})

		// Watch key that did NOT change (no-op)
		const wNoop = state(uniqueKey('watch-noop'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		wNoop.watch('b', () => {})

		let iwn = 0

		bench.add('write + watch (key unchanged)', () => {
			wNoop.set({ a: ++iwn, b: 0, c: 0, d: 0, e: 0 })
		})
	},
})

// ---------------------------------------------------------------------------
// 4. withWatch enhancer vs native state.watch
// ---------------------------------------------------------------------------

import { withWatch } from '../../src/index.js'

const watchEnhancerSuite = defineSuite('watch-enhancer', {
	'withWatch Enhancer vs Native watch': (bench) => {
		type Obj = { a: number; b: number; c: number }

		const sNative = state(uniqueKey('wn'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
		})

		sNative.watch('a', () => {})

		let in1 = 0

		bench.add('state.watch() native', () => {
			sNative.set({ a: ++in1, b: 0, c: 0 })
		})

		const sEnhanced = withWatch(
			state(uniqueKey('we'), {
				default: { a: 0, b: 0, c: 0 } as Obj,
			}),
		)

		sEnhanced.watch('a', () => {})

		let ie1 = 0

		bench.add('withWatch() enhancer', () => {
			sEnhanced.set({ a: ++ie1, b: 0, c: 0 })
		})

		const sPlain = state(uniqueKey('wp'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
		})

		sPlain.subscribe(() => {})

		let ip1 = 0

		bench.add('subscribe() baseline', () => {
			sPlain.set({ a: ++ip1, b: 0, c: 0 })
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Subscription',
	[churnSuite, fanOutSuite, watchSuite, watchEnhancerSuite],
	'internal/subscription',
).catch(console.error)
