import { Bench } from 'tinybench'
import { proxy, subscribe as valtioSubscribe, snapshot as valtioSnapshot } from 'valtio/vanilla'
import { createStore as createZustandStore } from 'zustand/vanilla'
import { batch, computed, state } from '../src/index.js'
import { printResults, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// Benchmark: State creation
// ---------------------------------------------------------------------------

async function benchCreate() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	bench
		.add('gjendje', () => {
			state(uniqueKey('create'), { default: 0 })
		})
		.add('valtio', () => {
			proxy({ count: 0 })
		})
		.add('zustand', () => {
			createZustandStore(() => ({ count: 0 }))
		})

	await bench.run()

	console.log('── State Creation ──')
	
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark: Read (get)
// ---------------------------------------------------------------------------

async function benchRead() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const gj = state(uniqueKey('read'), { default: 42 })
	const vp = proxy({ value: 42 })
	const zStore = createZustandStore(() => ({ value: 42 }))

	bench
		.add('gjendje', () => {
			gj.get()
		})
		.add('valtio', () => {
			valtioSnapshot(vp).value
		})
		.add('zustand', () => {
			zStore.getState()
		})

	await bench.run()

	console.log('── State Read ──')
	
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark: Write (set)
// ---------------------------------------------------------------------------

async function benchWrite() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const gj = state(uniqueKey('write'), { default: 0 })
	const vp = proxy({ value: 0 })
	const zStore = createZustandStore<{ value: number }>(() => ({ value: 0 }))

	let i = 0

	bench
		.add('gjendje', () => {
			gj.set(++i)
		})
		.add('valtio', () => {
			vp.value = ++i
		})
		.add('zustand', () => {
			zStore.setState({ value: ++i })
		})

	await bench.run()

	console.log('── State Write ──')
	
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark: Subscribe + Write (notification throughput)
// ---------------------------------------------------------------------------

async function benchSubscribeWrite() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const gj = state(uniqueKey('sub'), { default: 0 })
	
	gj.subscribe(() => {})

	const vp = proxy({ value: 0 })
	
	valtioSubscribe(vp, () => {}, true)

	const zStore = createZustandStore<{ value: number }>(() => ({ value: 0 }))
	
	zStore.subscribe(() => {})

	let i = 0

	bench
		.add('gjendje', () => {
			gj.set(++i)
		})
		.add('valtio', () => {
			vp.value = ++i
		})
		.add('zustand', () => {
			zStore.setState({ value: ++i })
		})

	await bench.run()

	console.log('── Subscribe + Write (1 listener) ──')
	
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark: Subscribe with many listeners
// ---------------------------------------------------------------------------

async function benchManyListeners() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })
	
	const LISTENER_COUNT = 100

	const gj = state(uniqueKey('many'), { default: 0 })

	for (let j = 0; j < LISTENER_COUNT; j++) {
		gj.subscribe(() => {})
	}

	const vp = proxy({ value: 0 })

	for (let j = 0; j < LISTENER_COUNT; j++) {
		valtioSubscribe(vp, () => {}, true)
	}

	const zStore = createZustandStore<{ value: number }>(() => ({ value: 0 }))

	for (let j = 0; j < LISTENER_COUNT; j++) {
		zStore.subscribe(() => {})
	}

	let i = 0

	bench
		.add('gjendje', () => {
			gj.set(++i)
		})
		.add('valtio', () => {
			vp.value = ++i
		})
		.add('zustand', () => {
			zStore.setState({ value: ++i })
		})

	await bench.run()

	console.log(`── Subscribe + Write (${LISTENER_COUNT} listeners) ──`)
	
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark: Batch updates
// ---------------------------------------------------------------------------

async function benchBatch() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })
	
	const UPDATE_COUNT = 100

	const gjItems = Array.from({ length: UPDATE_COUNT }, (_, i) =>
		state(uniqueKey('batch'), { default: i }),
	)

	for (const item of gjItems) {
		item.subscribe(() => {})
	}

	const vpState: Record<string, number> = {}

	for (let i = 0; i < UPDATE_COUNT; i++) {
		vpState[`key${i}`] = i
	}

	const vp = proxy(vpState)
	valtioSubscribe(vp, () => {}, true)

	const zInitial: Record<string, number> = {}

	for (let i = 0; i < UPDATE_COUNT; i++) {
		zInitial[`key${i}`] = i
	}

	const zStore = createZustandStore<Record<string, number>>(() => zInitial)
	
	zStore.subscribe(() => {})

	let iter = 0

	bench
		.add('gjendje', () => {
			iter++

			batch(() => {
				for (let i = 0; i < UPDATE_COUNT; i++) {
					const item = gjItems[i]

					if (item) item.set(iter + i)
				}
			})
		})
		.add('valtio', () => {
			iter++

			for (let i = 0; i < UPDATE_COUNT; i++) {
				vp[`key${i}`] = iter + i
			}
		})
		.add('zustand', () => {
			iter++

			const partial: Record<string, number> = {}

			for (let i = 0; i < UPDATE_COUNT; i++) {
				partial[`key${i}`] = iter + i
			}

			zStore.setState(partial)
		})

	await bench.run()

	console.log(`── Batch Update (${UPDATE_COUNT} values) ──`)
	
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark: Computed / derived state
// ---------------------------------------------------------------------------

async function benchComputed() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const gjA = state(uniqueKey('compA'), { default: 1 })
	const gjB = state(uniqueKey('compB'), { default: 2 })
	const gjC = computed([gjA, gjB], ([a, b]) => a + b)

	const vpA = proxy({ value: 1 })
	const vpB = proxy({ value: 2 })

	const zA = createZustandStore<{ value: number }>(() => ({ value: 1 }))
	const zB = createZustandStore<{ value: number }>(() => ({ value: 2 }))
	
	let zDerived = zA.getState().value + zB.getState().value

	zA.subscribe((s) => {
		zDerived = s.value + zB.getState().value
	})

	zB.subscribe((s) => {
		zDerived = zA.getState().value + s.value
	})

	let i = 0

	bench
		.add('gjendje', () => {
			gjA.set(++i)
			gjC.get()
		})
		.add('valtio', () => {
			vpA.value = ++i
			valtioSnapshot(vpA).value + valtioSnapshot(vpB).value
		})
		.add('zustand', () => {
			zA.setState({ value: ++i })
			zDerived
		})

	await bench.run()

	console.log('── Computed / Derived State ──')
	
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Run suites — supports CLI filter: `pnpm tsx state-management.bench.ts read`
// ---------------------------------------------------------------------------

runSuites('State Management Benchmark: gjendje vs Valtio vs Zustand', [
	{ name: 'create', fn: benchCreate },
	{ name: 'read', fn: benchRead },
	{ name: 'write', fn: benchWrite },
	{ name: 'subscribe-write', fn: benchSubscribeWrite },
	{ name: 'many-listeners', fn: benchManyListeners },
	{ name: 'batch', fn: benchBatch },
	{ name: 'computed', fn: benchComputed },
]).catch(console.error)
