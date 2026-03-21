import { Bench } from 'tinybench'
import { proxy, subscribe as valtioSubscribe, snapshot as valtioSnapshot } from 'valtio/vanilla'
import { createStore as createZustandStore } from 'zustand/vanilla'
import { state, computed, batch } from '../src/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatOps(hz: number): string {
	if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M ops/s`
	if (hz >= 1_000) return `${(hz / 1_000).toFixed(2)}K ops/s`
	return `${hz.toFixed(2)} ops/s`
}

function printResults(bench: Bench) {
	const tasks = bench.tasks.map((t) => {
		const r = t.result as Record<string, unknown> | undefined
		const throughput = r?.throughput as Record<string, number> | undefined
		const latency = r?.latency as Record<string, number> | undefined
		return {
			name: t.name,
			hz: throughput?.mean ?? 0,
			mean: latency?.mean ?? 0,
			p99: latency?.p99 ?? 0,
		}
	})

	// Sort by throughput descending
	tasks.sort((a, b) => b.hz - a.hz)

	const fastest = tasks[0]

	console.log('')
	for (const t of tasks) {
		const ratio = fastest && t.hz > 0 ? (fastest.hz / t.hz).toFixed(2) : '-'
		const marker = t === fastest ? ' ⇐ fastest' : ''
		console.log(
			`  ${t.name.padEnd(20)} ${formatOps(t.hz).padStart(16)}   (avg ${t.mean.toFixed(4)}ms, p99 ${t.p99.toFixed(4)}ms)  ${ratio === '1.00' ? '' : `${ratio}x slower`}${marker}`,
		)
	}
	console.log('')
}

// ---------------------------------------------------------------------------
// Unique key counter to avoid gjendje instance caching between benchmarks
// ---------------------------------------------------------------------------

let keyId = 0
function uniqueKey(prefix: string): string {
	return `${prefix}-${keyId++}`
}

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

	// gjendje
	const gj = state(uniqueKey('sub'), { default: 0 })
	gj.subscribe(() => {})

	// valtio
	const vp = proxy({ value: 0 })
	valtioSubscribe(vp, () => {}, true)

	// zustand
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

	// gjendje
	const gj = state(uniqueKey('many'), { default: 0 })
	for (let j = 0; j < LISTENER_COUNT; j++) {
		gj.subscribe(() => {})
	}

	// valtio
	const vp = proxy({ value: 0 })
	for (let j = 0; j < LISTENER_COUNT; j++) {
		valtioSubscribe(vp, () => {}, true)
	}

	// zustand
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

	// gjendje
	const gjItems = Array.from({ length: UPDATE_COUNT }, (_, i) =>
		state(uniqueKey('batch'), { default: i }),
	)
	for (const item of gjItems) {
		item.subscribe(() => {})
	}

	// valtio (single proxy with many keys - idiomatic)
	const vpState: Record<string, number> = {}
	for (let i = 0; i < UPDATE_COUNT; i++) {
		vpState[`key${i}`] = i
	}
	const vp = proxy(vpState)
	valtioSubscribe(vp, () => {}, true)

	// zustand (single store with many keys - idiomatic)
	const initialState: Record<string, number> = {}
	for (let i = 0; i < UPDATE_COUNT; i++) {
		initialState[`key${i}`] = i
	}
	const zStore = createZustandStore<Record<string, number>>(() => initialState)
	zStore.subscribe(() => {})

	let iter = 0

	bench
		.add('gjendje', () => {
			iter++
			batch(() => {
				for (let i = 0; i < UPDATE_COUNT; i++) {
					gjItems[i]!.set(iter + i)
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

	// gjendje
	const gjA = state(uniqueKey('compA'), { default: 1 })
	const gjB = state(uniqueKey('compB'), { default: 2 })
	const gjC = computed([gjA, gjB], ([a, b]) => a + b)

	// valtio - derive via snapshot
	const vpA = proxy({ value: 1 })
	const vpB = proxy({ value: 2 })

	// zustand - derive via subscribe (idiomatic vanilla pattern)
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
			void zDerived
		})

	await bench.run()

	console.log('── Computed / Derived State ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------

async function main() {
	console.log('='.repeat(70))
	console.log('  State Management Benchmark: gjendje vs Valtio vs Zustand')
	console.log('='.repeat(70))

	await benchCreate()
	await benchRead()
	await benchWrite()
	await benchSubscribeWrite()
	await benchManyListeners()
	await benchBatch()
	await benchComputed()

	console.log('='.repeat(70))
	console.log('  Done.')
	console.log('='.repeat(70))
}

main().catch(console.error)
