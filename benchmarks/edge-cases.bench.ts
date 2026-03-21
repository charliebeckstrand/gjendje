import { Bench } from 'tinybench'
import {
	batch,
	collection,
	computed,
	configure,
	effect,
	shallowEqual,
	snapshot,
	state,
	withHistory,
	withWatch,
} from '../src/index.js'
import { printResults, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// 1. Computed: diamond dependency graph
//    A single source fans out to two intermediates, which fan back into one
//    final computed. This reveals whether the final node recomputes once
//    or twice per source change.
// ---------------------------------------------------------------------------

async function benchComputedDiamond() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Diamond: src → [mid1, mid2] → final
	const src = state(uniqueKey('diamond'), { default: 0 })
	const mid1 = computed([src], ([v]) => v * 2)
	const mid2 = computed([src], ([v]) => v + 10)
	const final = computed([mid1, mid2], ([a, b]) => a + b)

	let recomputeCount = 0

	final.subscribe(() => {
		recomputeCount++
	})

	let i = 0

	bench.add('diamond (src → 2 mid → final)', () => {
		src.set(++i)
		final.get()
	})

	// Wider diamond: src → 5 intermediates → final
	const srcWide = state(uniqueKey('diamond-wide'), { default: 0 })
	const mids = Array.from({ length: 5 }, (_, j) =>
		computed([srcWide], ([v]) => v + j),
	)
	const finalWide = computed(mids, (vals) =>
		vals.reduce((a: number, b: number) => a + b, 0),
	)

	finalWide.subscribe(() => {})

	let iw = 0

	bench.add('diamond (src → 5 mid → final)', () => {
		srcWide.set(++iw)
		finalWide.get()
	})

	// Linear chain (same depth) for comparison
	const srcLin = state(uniqueKey('diamond-lin'), { default: 0 })
	let prev = computed([srcLin], ([v]) => v * 2)
	prev = computed([prev], ([v]) => v + 10)
	const finalLin = prev

	finalLin.subscribe(() => {})

	let il = 0

	bench.add('linear chain (depth 2, for comparison)', () => {
		srcLin.set(++il)
		finalLin.get()
	})

	await bench.run()

	console.log('── Computed Diamond Dependency ──')

	printResults(bench)

	void recomputeCount
}

// ---------------------------------------------------------------------------
// 2. Computed: peek() vs get() read cost
// ---------------------------------------------------------------------------

async function benchPeekVsGet() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const s = state(uniqueKey('peek'), { default: 42 })
	const c = computed([s], ([v]) => v * 2)

	bench.add('state.get()', () => {
		s.get()
	})

	bench.add('state.peek()', () => {
		s.peek()
	})

	bench.add('computed.get()', () => {
		c.get()
	})

	bench.add('computed.peek()', () => {
		c.peek()
	})

	await bench.run()

	console.log('── peek() vs get() Read Cost ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 3. Collection watch at scale — O(items × watchers) hot path
// ---------------------------------------------------------------------------

async function benchCollectionWatch() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	type Item = { id: number; name: string; score: number }

	// 100 items, 1 watcher
	const items100 = Array.from({ length: 100 }, (_, i) => ({
		id: i,
		name: `item-${i}`,
		score: i,
	}))

	const col100 = collection(uniqueKey('cw-100'), { default: [...items100] })

	col100.watch('score', () => {})

	let ic100 = 0

	bench.add('collection.watch (100 items, 1 key)', () => {
		col100.update((item) => item.id === 0, { score: ++ic100 })
	})

	// 1000 items, 1 watcher
	const items1000 = Array.from({ length: 1000 }, (_, i) => ({
		id: i,
		name: `item-${i}`,
		score: i,
	}))

	const col1000 = collection(uniqueKey('cw-1000'), { default: [...items1000] })

	col1000.watch('score', () => {})

	let ic1000 = 0

	bench.add('collection.watch (1000 items, 1 key)', () => {
		col1000.update((item) => item.id === 0, { score: ++ic1000 })
	})

	// 1000 items, 3 watchers on different keys
	const col1000m = collection(uniqueKey('cw-1000m'), {
		default: [...items1000],
	})

	col1000m.watch('id', () => {})
	col1000m.watch('name', () => {})
	col1000m.watch('score', () => {})

	let ic1000m = 0

	bench.add('collection.watch (1000 items, 3 keys)', () => {
		col1000m.update((item) => item.id === 0, { score: ++ic1000m })
	})

	// Baseline: same update without watch
	const colBase = collection(uniqueKey('cw-base'), { default: [...items1000] })

	colBase.subscribe(() => {})

	let icb = 0

	bench.add('collection.update (1000 items, no watch)', () => {
		colBase.update((item) => item.id === 0, { score: ++icb })
	})

	await bench.run()

	console.log('── Collection Watch at Scale ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 4. Snapshot (devtools) at scale
// ---------------------------------------------------------------------------

async function benchSnapshot() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Create many instances to stress snapshot
	const instances10 = Array.from({ length: 10 }, (_, i) =>
		state(uniqueKey('snap10'), { default: i }),
	)

	bench.add('snapshot (10 instances)', () => {
		snapshot()
	})

	const instances100 = Array.from({ length: 100 }, (_, i) =>
		state(uniqueKey('snap100'), { default: i }),
	)

	bench.add('snapshot (110 instances)', () => {
		snapshot()
	})

	const instances500 = Array.from({ length: 500 }, (_, i) =>
		state(uniqueKey('snap500'), { default: i }),
	)

	bench.add('snapshot (610 instances)', () => {
		snapshot()
	})

	await bench.run()

	console.log('── Snapshot (DevTools) at Scale ──')

	printResults(bench)

	// Cleanup
	for (const s of [...instances10, ...instances100, ...instances500]) {
		s.destroy()
	}
}

// ---------------------------------------------------------------------------
// 5. Instance cache hit vs fresh creation
// ---------------------------------------------------------------------------

async function benchCacheHit() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Cache hit — same key returns existing instance
	const cachedKey = uniqueKey('cache-hit')

	state(cachedKey, { default: 0 })

	bench.add('state() cache hit (existing key)', () => {
		state(cachedKey, { default: 0 })
	})

	// Fresh creation — new key each time
	bench.add('state() fresh creation (new key)', () => {
		const s = state(uniqueKey('cache-miss'), { default: 0 })
		s.destroy()
	})

	await bench.run()

	console.log('── Instance Cache Hit vs Fresh Creation ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 6. Effect stop + recreate (component mount/unmount simulation)
// ---------------------------------------------------------------------------

async function benchEffectLifecycle() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const src = state(uniqueKey('eff-lc'), { default: 0 })

	bench.add('effect create + stop (no cleanup)', () => {
		const handle = effect([src], () => {})
		handle.stop()
	})

	bench.add('effect create + stop (with cleanup)', () => {
		const handle = effect([src], () => {
			return () => {}
		})
		handle.stop()
	})

	// 3 dependencies
	const dep1 = state(uniqueKey('eff-lc-d1'), { default: 0 })
	const dep2 = state(uniqueKey('eff-lc-d2'), { default: 0 })
	const dep3 = state(uniqueKey('eff-lc-d3'), { default: 0 })

	bench.add('effect create + stop (3 deps)', () => {
		const handle = effect([dep1, dep2, dep3], () => {})
		handle.stop()
	})

	// Create + trigger + stop (full mount/update/unmount)
	let iv = 0

	bench.add('effect create + trigger + stop', () => {
		const handle = effect([src], () => {})
		src.set(++iv)
		handle.stop()
	})

	await bench.run()

	console.log('── Effect Lifecycle (Create + Stop) ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 7. Batch with computed consumers — does computed recompute once or N times?
// ---------------------------------------------------------------------------

async function benchBatchWithComputed() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// 5 sources feeding 1 computed, all batched
	const sources5 = Array.from({ length: 5 }, (_, i) =>
		state(uniqueKey(`bcomp5-${i}`), { default: i }),
	)
	const comp5 = computed(sources5, (vals) =>
		vals.reduce((a: number, b: number) => a + b, 0),
	)

	comp5.subscribe(() => {})

	let i5 = 0

	bench.add('batch 5 sources (1 computed consumer)', () => {
		i5++

		batch(() => {
			for (const s of sources5) {
				s.set(i5)
			}
		})
	})

	// Same without batch (baseline)
	const sources5nb = Array.from({ length: 5 }, (_, i) =>
		state(uniqueKey(`bcomp5nb-${i}`), { default: i }),
	)
	const comp5nb = computed(sources5nb, (vals) =>
		vals.reduce((a: number, b: number) => a + b, 0),
	)

	comp5nb.subscribe(() => {})

	let i5nb = 0

	bench.add('unbatched 5 sources (1 computed consumer)', () => {
		i5nb++

		for (const s of sources5nb) {
			s.set(i5nb)
		}
	})

	// 20 sources, 1 computed
	const sources20 = Array.from({ length: 20 }, (_, i) =>
		state(uniqueKey(`bcomp20-${i}`), { default: i }),
	)
	const comp20 = computed(sources20, (vals) =>
		vals.reduce((a: number, b: number) => a + b, 0),
	)

	comp20.subscribe(() => {})

	let i20 = 0

	bench.add('batch 20 sources (1 computed consumer)', () => {
		i20++

		batch(() => {
			for (const s of sources20) {
				s.set(i20)
			}
		})
	})

	let i20nb = 0

	bench.add('unbatched 20 sources (1 computed consumer)', () => {
		i20nb++

		for (const s of sources20) {
			s.set(i20nb)
		}
	})

	await bench.run()

	console.log('── Batch with Computed Consumers ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 8. Read/write interleaving — rapid alternating get() and set()
// ---------------------------------------------------------------------------

async function benchReadWriteInterleave() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const s = state(uniqueKey('rw'), { default: 0 })

	s.subscribe(() => {})

	let irw = 0

	bench.add('write-only (baseline)', () => {
		s.set(++irw)
	})

	let irw2 = 0

	bench.add('read-write alternating', () => {
		s.set(++irw2)
		s.get()
	})

	let irw3 = 0

	bench.add('write-read-read-read pattern', () => {
		s.set(++irw3)
		s.get()
		s.get()
		s.get()
	})

	// With computed dependent
	const c = computed([s], ([v]) => v * 2)

	c.subscribe(() => {})

	let irw4 = 0

	bench.add('write + computed.get() interleaved', () => {
		s.set(++irw4)
		c.get()
	})

	await bench.run()

	console.log('── Read/Write Interleaving ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 9. History with large objects — memory & copy overhead
// ---------------------------------------------------------------------------

async function benchHistoryLargeValues() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Small value (primitive)
	const hSmall = withHistory(state(uniqueKey('hist-sm'), { default: 0 }), {
		maxSize: 100,
	})

	let ism = 0

	bench.add('history write (primitive)', () => {
		hSmall.set(++ism)
	})

	// Medium object (20 keys)
	type MedObj = Record<string, number>

	const medDefault: MedObj = {}

	for (let i = 0; i < 20; i++) medDefault[`k${i}`] = i

	const hMed = withHistory(
		state(uniqueKey('hist-med'), { default: medDefault }),
		{ maxSize: 100 },
	)

	let imd = 0

	bench.add('history write (20-key object)', () => {
		hMed.set({ ...medDefault, k0: ++imd })
	})

	// Large object (200 keys)
	const lgDefault: Record<string, number> = {}

	for (let i = 0; i < 200; i++) lgDefault[`k${i}`] = i

	const hLg = withHistory(
		state(uniqueKey('hist-lg'), { default: lgDefault }),
		{ maxSize: 100 },
	)

	let ilg = 0

	bench.add('history write (200-key object)', () => {
		hLg.set({ ...lgDefault, k0: ++ilg })
	})

	// Undo/redo with large objects
	const hUndoLg = withHistory(
		state(uniqueKey('hist-undo-lg'), { default: lgDefault }),
		{ maxSize: 100 },
	)

	for (let i = 0; i < 50; i++) {
		hUndoLg.set({ ...lgDefault, k0: i })
	}

	bench.add('undo + redo (200-key object)', () => {
		hUndoLg.undo()
		hUndoLg.redo()
	})

	await bench.run()

	console.log('── History with Large Values ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 10. Collection operation chaining — multiple mutations without batch
// ---------------------------------------------------------------------------

async function benchCollectionChaining() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	type Item = { id: number; value: number }

	const items = Array.from({ length: 100 }, (_, i) => ({
		id: i,
		value: i,
	}))

	// Single operation
	const colSingle = collection(uniqueKey('chain-1'), { default: [...items] })

	colSingle.subscribe(() => {})

	let is = 0

	bench.add('1 mutation (add)', () => {
		colSingle.add({ id: 1000 + is, value: ++is })
		colSingle.set([...items]) // reset
	})

	// 3 operations without batch
	const col3 = collection(uniqueKey('chain-3'), { default: [...items] })

	col3.subscribe(() => {})

	let i3 = 0

	bench.add('3 mutations unbatched', () => {
		i3++
		col3.add({ id: 1000 + i3, value: i3 })
		col3.update((item) => item.id === 0, { value: i3 })
		col3.remove((item) => item.id === 1000 + i3)
	})

	// 3 operations with batch
	const col3b = collection(uniqueKey('chain-3b'), { default: [...items] })

	col3b.subscribe(() => {})

	let i3b = 0

	bench.add('3 mutations batched', () => {
		i3b++

		batch(() => {
			col3b.add({ id: 1000 + i3b, value: i3b })
			col3b.update((item) => item.id === 0, { value: i3b })
			col3b.remove((item) => item.id === 1000 + i3b)
		})
	})

	await bench.run()

	console.log('── Collection Operation Chaining ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 11. shallowEqual scaling
// ---------------------------------------------------------------------------

async function benchShallowEqual() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Identical primitives
	bench.add('shallowEqual (identical primitives)', () => {
		shallowEqual(42, 42)
	})

	// Small objects (equal)
	const smallA = { a: 1, b: 2, c: 3 }
	const smallB = { a: 1, b: 2, c: 3 }

	bench.add('shallowEqual (3-key objects, equal)', () => {
		shallowEqual(smallA, smallB)
	})

	// Medium objects (equal)
	const medA: Record<string, number> = {}
	const medB: Record<string, number> = {}

	for (let i = 0; i < 50; i++) {
		medA[`k${i}`] = i
		medB[`k${i}`] = i
	}

	bench.add('shallowEqual (50-key objects, equal)', () => {
		shallowEqual(medA, medB)
	})

	// Large objects (equal)
	const lgA: Record<string, number> = {}
	const lgB: Record<string, number> = {}

	for (let i = 0; i < 500; i++) {
		lgA[`k${i}`] = i
		lgB[`k${i}`] = i
	}

	bench.add('shallowEqual (500-key objects, equal)', () => {
		shallowEqual(lgA, lgB)
	})

	await bench.run()

	console.log('── shallowEqual Scaling ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 12. withWatch enhancer vs native state.watch
// ---------------------------------------------------------------------------

async function benchWatchEnhancer() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	type Obj = { a: number; b: number; c: number }

	// Native state.watch()
	const sNative = state(uniqueKey('wn'), {
		default: { a: 0, b: 0, c: 0 } as Obj,
	})

	sNative.watch('a', () => {})

	let in1 = 0

	bench.add('state.watch() native', () => {
		sNative.set({ a: ++in1, b: 0, c: 0 })
	})

	// withWatch enhancer
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

	// Plain subscribe (baseline)
	const sPlain = state(uniqueKey('wp'), {
		default: { a: 0, b: 0, c: 0 } as Obj,
	})

	sPlain.subscribe(() => {})

	let ip1 = 0

	bench.add('subscribe() baseline', () => {
		sPlain.set({ a: ++ip1, b: 0, c: 0 })
	})

	await bench.run()

	console.log('── withWatch Enhancer vs Native watch ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 13. GC pressure — rapid create/destroy cycles at scale
// ---------------------------------------------------------------------------

async function benchGCPressure() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Single create + destroy
	bench.add('create + destroy (×1)', () => {
		const s = state(uniqueKey('gc1'), { default: 0 })
		s.destroy()
	})

	// Burst of 10
	bench.add('create + destroy burst (×10)', () => {
		const instances = []

		for (let i = 0; i < 10; i++) {
			instances.push(state(uniqueKey('gc10'), { default: i }))
		}

		for (const s of instances) {
			s.destroy()
		}
	})

	// Burst of 50 with subscribers
	bench.add('create + subscribe + destroy burst (×50)', () => {
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

	await bench.run()

	console.log('── GC Pressure (Create/Destroy Churn) ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 14. Interceptor rejection rate — how fast can set() bail out?
// ---------------------------------------------------------------------------

async function benchInterceptorRejection() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// No interceptor (baseline)
	const sNone = state(uniqueKey('rej-none'), { default: 0 })

	sNone.subscribe(() => {})

	let in0 = 0

	bench.add('write (no interceptor)', () => {
		sNone.set(++in0)
	})

	// Interceptor that always passes through
	const sPass = state(uniqueKey('rej-pass'), { default: 0 })

	sPass.intercept((next) => next)
	sPass.subscribe(() => {})

	let ip0 = 0

	bench.add('write (interceptor passthrough)', () => {
		sPass.set(++ip0)
	})

	// Interceptor that transforms value
	const sTx = state(uniqueKey('rej-tx'), { default: 0 })

	sTx.intercept((next) => Math.max(0, next))
	sTx.subscribe(() => {})

	let it0 = 0

	bench.add('write (interceptor transform)', () => {
		sTx.set(++it0)
	})

	// isEqual that rejects 50% of writes (no change half the time)
	const sEqHalf = state(uniqueKey('rej-half'), {
		default: 0,
		isEqual: (a, b) => a === b,
	})

	sEqHalf.subscribe(() => {})

	let ih = 0

	bench.add('write (isEqual rejects ~50%)', () => {
		// Alternates between new value and same value
		sEqHalf.set(Math.floor(++ih / 2))
	})

	await bench.run()

	console.log('── Interceptor / Rejection Overhead ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 15. Computed: stale read after dependency change
//     Measures the cost of recomputation when get() is called after
//     a dependency changes but before any subscriber fires.
// ---------------------------------------------------------------------------

async function benchComputedStaleness() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Cheap compute function
	const sCheap = state(uniqueKey('stale-cheap'), { default: 0 })
	const cCheap = computed([sCheap], ([v]) => v + 1)

	let ic = 0

	bench.add('set + computed.get() (cheap fn)', () => {
		sCheap.set(++ic)
		cCheap.get()
	})

	// Moderate compute function (string concat)
	const sMod = state(uniqueKey('stale-mod'), { default: 0 })
	const cMod = computed([sMod], ([v]) => `value-${v}-end`)

	let im = 0

	bench.add('set + computed.get() (string concat)', () => {
		sMod.set(++im)
		cMod.get()
	})

	// Expensive compute function (object creation + array)
	const sExp = state(uniqueKey('stale-exp'), { default: 0 })
	const cExp = computed([sExp], ([v]) => ({
		id: v,
		label: `item-${v}`,
		tags: [v, v + 1, v + 2],
	}))

	let ie = 0

	bench.add('set + computed.get() (object creation)', () => {
		sExp.set(++ie)
		cExp.get()
	})

	// Multiple reads of same stale computed (should only recompute once)
	const sMulti = state(uniqueKey('stale-multi'), { default: 0 })
	const cMulti = computed([sMulti], ([v]) => v + 1)

	let imr = 0

	bench.add('set + 3× computed.get() (recompute once?)', () => {
		sMulti.set(++imr)
		cMulti.get()
		cMulti.get()
		cMulti.get()
	})

	await bench.run()

	console.log('── Computed Staleness / Recomputation ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// Run suites — supports CLI filter: `pnpm tsx edge-cases.bench.ts diamond`
// ---------------------------------------------------------------------------

runSuites('Edge-Case Benchmark: subtle performance pain points', [
	{ name: 'diamond', fn: benchComputedDiamond },
	{ name: 'peek-vs-get', fn: benchPeekVsGet },
	{ name: 'collection-watch', fn: benchCollectionWatch },
	{ name: 'snapshot', fn: benchSnapshot },
	{ name: 'cache-hit', fn: benchCacheHit },
	{ name: 'effect-lifecycle', fn: benchEffectLifecycle },
	{ name: 'batch-computed', fn: benchBatchWithComputed },
	{ name: 'read-write', fn: benchReadWriteInterleave },
	{ name: 'history-large', fn: benchHistoryLargeValues },
	{ name: 'collection-chaining', fn: benchCollectionChaining },
	{ name: 'shallow-equal', fn: benchShallowEqual },
	{ name: 'watch-enhancer', fn: benchWatchEnhancer },
	{ name: 'gc-pressure', fn: benchGCPressure },
	{ name: 'interceptor', fn: benchInterceptorRejection },
	{ name: 'computed-staleness', fn: benchComputedStaleness },
]).catch(console.error)
