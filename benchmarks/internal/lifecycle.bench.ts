import {
	collection,
	computed,
	effect,
	readonly,
	select,
	state,
	withHistory,
} from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Basic create + destroy
// ---------------------------------------------------------------------------

const basicLifecycleSuite = defineSuite('lifecycle-basic', {
	'Create + Destroy': (bench) => {
		bench.add('state: create + destroy', () => {
			const s = state(uniqueKey('lc-s'), { default: 0 })
			s.destroy()
		})

		bench.add('collection: create + destroy', () => {
			const col = collection(uniqueKey('lc-col'), { default: [] as number[] })
			col.destroy()
		})

		bench.add('computed: create + destroy (1 dep)', () => {
			const src = state(uniqueKey('lc-c1'), { default: 0 })

			const c = computed([src], ([v]) => v)

			c.destroy()
			src.destroy()
		})

		bench.add('select: create + destroy', () => {
			const src = state(uniqueKey('lc-sel'), { default: { x: 1 } })

			const s = select(src, (v) => v.x)

			s.destroy()
			src.destroy()
		})

		bench.add('effect: create + stop', () => {
			const src = state(uniqueKey('lc-eff'), { default: 0 })

			const handle = effect([src], () => {})

			handle.stop()
			src.destroy()
		})

		bench.add('readonly: create (zero-cost wrapper)', () => {
			const src = state(uniqueKey('lc-ro'), { default: 0 })

			readonly(src)

			src.destroy()
		})

		bench.add('withHistory: create + destroy', () => {
			const src = state(uniqueKey('lc-hist'), { default: 0 })

			const h = withHistory(src)

			h.destroy()
		})
	},
})

// ---------------------------------------------------------------------------
// 2. Full lifecycle: create + subscribe + write + unsubscribe + destroy
// ---------------------------------------------------------------------------

const fullLifecycleSuite = defineSuite('lifecycle-full', {
	'Full Lifecycle (create → subscribe → write → unsub → destroy)': (bench) => {
		bench.add('state: full lifecycle', () => {
			const s = state(uniqueKey('lc-full'), { default: 0 })
			const unsub = s.subscribe(() => {})
			s.set(42)
			unsub()
			s.destroy()
		})

		bench.add('collection: full lifecycle', () => {
			const col = collection(uniqueKey('lc-cfull'), { default: [] as number[] })
			const unsub = col.subscribe(() => {})
			col.add(1)
			unsub()
			col.destroy()
		})

		bench.add('computed: full lifecycle (2 deps)', () => {
			const a = state(uniqueKey('lc-ca'), { default: 1 })
			const b = state(uniqueKey('lc-cb'), { default: 2 })

			const c = computed([a, b], ([x, y]) => x + y)
			const unsub = c.subscribe(() => {})
			a.set(10)
			c.get()
			unsub()

			c.destroy()
			a.destroy()
			b.destroy()
		})
	},
})

// ---------------------------------------------------------------------------
// 3. Rapid creation throughput
// ---------------------------------------------------------------------------

const creationThroughputSuite = defineSuite('lifecycle-throughput', {
	'Creation Throughput (batch create + destroy)': (bench) => {
		bench.add('create + destroy 10 states', () => {
			const instances = Array.from({ length: 10 }, (_, i) =>
				state(uniqueKey(`lc-t10-${i}`), { default: i }),
			)

			for (const s of instances) s.destroy()
		})

		bench.add('create + destroy 50 states', () => {
			const instances = Array.from({ length: 50 }, (_, i) =>
				state(uniqueKey(`lc-t50-${i}`), { default: i }),
			)

			for (const s of instances) s.destroy()
		})

		bench.add('create + destroy 100 states', () => {
			const instances = Array.from({ length: 100 }, (_, i) =>
				state(uniqueKey(`lc-t100-${i}`), { default: i }),
			)

			for (const s of instances) s.destroy()
		})
	},
})

// ---------------------------------------------------------------------------
// 4. GC pressure — rapid create/destroy churn
// ---------------------------------------------------------------------------

const gcPressureSuite = defineSuite('gc-pressure', {
	'GC Pressure (Create/Destroy Churn)': (bench) => {
		bench.add('create + destroy (x1)', () => {
			const s = state(uniqueKey('gc1'), { default: 0 })
			s.destroy()
		})

		bench.add('create + destroy burst (x10)', () => {
			const instances = []

			for (let i = 0; i < 10; i++) {
				instances.push(state(uniqueKey('gc10'), { default: i }))
			}

			for (const s of instances) {
				s.destroy()
			}
		})

		bench.add('create + subscribe + destroy burst (x50)', () => {
			const instances = []

			for (let i = 0; i < 50; i++) {
				const s = state(uniqueKey('gc50'), { default: i })
				s.subscribe(() => {})
				instances.push(s)
			}

			for (const s of instances) {
				s.destroy()
			}
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Lifecycle',
	[basicLifecycleSuite, fullLifecycleSuite, creationThroughputSuite, gcPressureSuite],
	'internal/lifecycle',
).catch(console.error)
