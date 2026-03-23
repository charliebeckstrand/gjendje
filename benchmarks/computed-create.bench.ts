import { Bench } from 'tinybench'
import { computed, select, state } from '../src/index.js'
import { printResults, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// 1. Computed creation + destroy (memory deps)
// ---------------------------------------------------------------------------

async function benchComputedCreate() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Single dep
	const src1 = state(uniqueKey('cc-1'), { default: 0 })

	bench.add('computed create + destroy (1 memory dep)', () => {
		const c = computed([src1], ([v]) => v + 1)

		c.destroy()
	})

	// 3 deps
	const deps3 = Array.from({ length: 3 }, (_, i) => state(uniqueKey(`cc-3-${i}`), { default: i }))

	bench.add('computed create + destroy (3 memory deps)', () => {
		const c = computed(deps3, (vals) => vals.reduce((a: number, b: number) => a + b, 0))

		c.destroy()
	})

	// 10 deps
	const deps10 = Array.from({ length: 10 }, (_, i) =>
		state(uniqueKey(`cc-10-${i}`), { default: i }),
	)

	bench.add('computed create + destroy (10 memory deps)', () => {
		const c = computed(deps10, (vals) => vals.reduce((a: number, b: number) => a + b, 0))

		c.destroy()
	})

	// Chain of 5 computeds (each creates + destroys)
	bench.add('computed chain create + destroy (depth 5)', () => {
		const chain = []

		let prev = computed([src1], ([v]) => v + 1)

		chain.push(prev)

		for (let i = 0; i < 4; i++) {
			prev = computed([prev], ([v]) => v + 1)

			chain.push(prev)
		}

		for (const c of chain) {
			c.destroy()
		}
	})

	await bench.run()

	console.log('── Computed Create + Destroy ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 2. Select creation + destroy
// ---------------------------------------------------------------------------

async function benchSelectCreate() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const src = state(uniqueKey('sc'), { default: { a: 1, b: 2 } })

	bench.add('select create + destroy (memory dep)', () => {
		const s = select(src, (v) => v.a)

		s.destroy()
	})

	await bench.run()

	console.log('── Select Create + Destroy ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 3. Promise identity check — verify RESOLVED short-circuit
// ---------------------------------------------------------------------------

async function benchPromiseIdentity() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const src = state(uniqueKey('pi'), { default: 0 })

	const c = computed([src], ([v]) => v + 1)

	bench.add('computed.ready access (memory dep)', () => {
		c.ready
	})

	bench.add('computed.settled access (memory dep)', () => {
		c.settled
	})

	bench.add('computed.hydrated access (memory dep)', () => {
		c.hydrated
	})

	await bench.run()

	console.log('── Promise Property Access ──')

	printResults(bench)

	c.destroy()
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites('Computed/Select Creation Benchmark', [
	{ name: 'computed-create', fn: benchComputedCreate },
	{ name: 'select-create', fn: benchSelectCreate },
	{ name: 'promise-identity', fn: benchPromiseIdentity },
]).catch(console.error)
