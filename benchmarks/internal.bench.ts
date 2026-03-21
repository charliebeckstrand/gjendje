import { Bench } from 'tinybench'
import { batch, collection, computed, effect, state, withHistory } from '../src/index.js'

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

	tasks.sort((a, b) => b.hz - a.hz)

	const fastest = tasks[0]

	console.log('')

	for (const t of tasks) {
		const ratio = fastest && t.hz > 0 ? (fastest.hz / t.hz).toFixed(2) : '-'
		const marker = t === fastest ? ' ⇐ fastest' : ''

		console.log(
			`  ${t.name.padEnd(36)} ${formatOps(t.hz).padStart(16)}   (avg ${t.mean.toFixed(4)}ms, p99 ${t.p99.toFixed(4)}ms)  ${ratio === '1.00' ? '' : `${ratio}x slower`}${marker}`,
		)
	}

	console.log('')
}

let keyId = 0

function uniqueKey(prefix: string): string {
	return `${prefix}-${keyId++}`
}

// ---------------------------------------------------------------------------
// 1. Collection: add, remove, update, find at scale
// ---------------------------------------------------------------------------

async function benchCollectionOperations() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	type Item = { id: number; name: string; done: boolean }

	// Pre-populate a collection with 1000 items
	const items: Item[] = Array.from({ length: 1000 }, (_, i) => ({
		id: i,
		name: `item-${i}`,
		done: i % 2 === 0,
	}))

	// --- add ---
	bench.add('collection.add (append 1 item)', () => {
		const col = collection(uniqueKey('col-add'), { default: [] as Item[] })
		col.add({ id: 0, name: 'new', done: false })
		col.destroy()
	})

	// --- add to large collection ---
	const colLarge = collection(uniqueKey('col-add-lg'), { default: [...items] })

	bench.add('collection.add (to 1000 items)', () => {
		colLarge.add({ id: 9999, name: 'new', done: false })
		// Reset to avoid unbounded growth
		colLarge.set([...items])
	})

	// --- remove from large collection ---
	const colRemove = collection(uniqueKey('col-rm'), { default: [...items] })
	let rmId = 0

	bench.add('collection.remove (from 1000 items)', () => {
		colRemove.set([...items])
		colRemove.remove((item) => item.id === rmId++ % 1000)
	})

	// --- update in large collection ---
	const colUpdate = collection(uniqueKey('col-up'), { default: [...items] })
	let upId = 0

	bench.add('collection.update (in 1000 items)', () => {
		colUpdate.update((item) => item.id === upId++ % 1000, { done: true })
	})

	// --- update one in large collection ---
	const colUpdateOne = collection(uniqueKey('col-up1'), { default: [...items] })
	let upOneId = 0

	bench.add('collection.update one (in 1000 items)', () => {
		colUpdateOne.update((item) => item.id === upOneId++ % 1000, { done: true }, { one: true })
	})

	// --- remove one from large collection ---
	const colRemoveOne = collection(uniqueKey('col-rm1'), { default: [...items] })
	let rmOneId = 0

	bench.add('collection.remove one (from 1000 items)', () => {
		colRemoveOne.set([...items])
		colRemoveOne.remove((item) => item.id === rmOneId++ % 1000, { one: true })
	})

	// --- find in large collection ---
	const colFind = collection(uniqueKey('col-find'), { default: [...items] })
	let findId = 0

	bench.add('collection.find (in 1000 items)', () => {
		colFind.find((item) => item.id === findId++ % 1000)
	})

	await bench.run()

	console.log('── Collection Operations ──')

	printResults(bench)

	colLarge.destroy()
	colRemove.destroy()
	colUpdate.destroy()
	colFind.destroy()
}

// ---------------------------------------------------------------------------
// 2. Computed: dependency chain depth
// ---------------------------------------------------------------------------

async function benchComputedChain() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Chain of 5
	const src5 = state(uniqueKey('chain5'), { default: 0 })
	let prev5 = computed([src5], ([v]) => v + 1)

	for (let i = 0; i < 4; i++) {
		prev5 = computed([prev5], ([v]) => v + 1)
	}

	const end5 = prev5
	let i5 = 0

	bench.add('computed chain (depth 5)', () => {
		src5.set(++i5)
		end5.get()
	})

	// Chain of 10
	const src10 = state(uniqueKey('chain10'), { default: 0 })
	let prev10 = computed([src10], ([v]) => v + 1)

	for (let i = 0; i < 9; i++) {
		prev10 = computed([prev10], ([v]) => v + 1)
	}

	const end10 = prev10
	let i10 = 0

	bench.add('computed chain (depth 10)', () => {
		src10.set(++i10)
		end10.get()
	})

	// Chain of 25
	const src25 = state(uniqueKey('chain25'), { default: 0 })
	let prev25 = computed([src25], ([v]) => v + 1)

	for (let i = 0; i < 24; i++) {
		prev25 = computed([prev25], ([v]) => v + 1)
	}

	const end25 = prev25
	let i25 = 0

	bench.add('computed chain (depth 25)', () => {
		src25.set(++i25)
		end25.get()
	})

	await bench.run()

	console.log('── Computed Chain Depth ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 3. Computed: fan-in (many dependencies)
// ---------------------------------------------------------------------------

async function benchComputedFanIn() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// 5 deps
	const deps5 = Array.from({ length: 5 }, (_, i) => state(uniqueKey(`fan5-${i}`), { default: i }))
	const comp5 = computed(deps5, (vals) => vals.reduce((a: number, b: number) => a + b, 0))
	let i5 = 0

	bench.add('computed fan-in (5 deps)', () => {
		deps5[0]!.set(++i5)
		comp5.get()
	})

	// 20 deps
	const deps20 = Array.from({ length: 20 }, (_, i) =>
		state(uniqueKey(`fan20-${i}`), { default: i }),
	)
	const comp20 = computed(deps20, (vals) => vals.reduce((a: number, b: number) => a + b, 0))
	let i20 = 0

	bench.add('computed fan-in (20 deps)', () => {
		deps20[0]!.set(++i20)
		comp20.get()
	})

	// 50 deps
	const deps50 = Array.from({ length: 50 }, (_, i) =>
		state(uniqueKey(`fan50-${i}`), { default: i }),
	)
	const comp50 = computed(deps50, (vals) => vals.reduce((a: number, b: number) => a + b, 0))
	let i50 = 0

	bench.add('computed fan-in (50 deps)', () => {
		deps50[0]!.set(++i50)
		comp50.get()
	})

	await bench.run()

	console.log('── Computed Fan-In (Many Dependencies) ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 4. Effect: trigger + cleanup overhead
// ---------------------------------------------------------------------------

async function benchEffect() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Effect with no cleanup
	const effSrc1 = state(uniqueKey('eff1'), { default: 0 })
	let effSink1 = 0

	effect([effSrc1], ([v]) => {
		effSink1 = v
	})

	let ie1 = 0

	bench.add('effect trigger (no cleanup)', () => {
		effSrc1.set(++ie1)
	})

	// Effect with cleanup
	const effSrc2 = state(uniqueKey('eff2'), { default: 0 })
	let effSink2 = 0

	effect([effSrc2], ([v]) => {
		effSink2 = v

		return () => {
			effSink2 = 0
		}
	})

	let ie2 = 0

	bench.add('effect trigger (with cleanup)', () => {
		effSrc2.set(++ie2)
	})

	// Effect with 5 dependencies
	const effDeps5 = Array.from({ length: 5 }, (_, i) =>
		state(uniqueKey(`eff5-${i}`), { default: i }),
	)
	let effSum = 0

	effect(effDeps5, (vals) => {
		effSum = vals.reduce((a: number, b: number) => a + b, 0)
	})

	let ie5 = 0

	bench.add('effect trigger (5 deps, change 1)', () => {
		effDeps5[0]!.set(++ie5)
	})

	await bench.run()

	console.log('── Effect Overhead ──')

	printResults(bench)

	// Prevent dead-code elimination
	void effSink1
	void effSink2
	void effSum
}

// ---------------------------------------------------------------------------
// 5. withHistory: write + undo/redo cost
// ---------------------------------------------------------------------------

async function benchHistory() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Write with history tracking
	const hPlain = state(uniqueKey('hist-plain'), { default: 0 })
	let ipw = 0

	bench.add('write (no history)', () => {
		hPlain.set(++ipw)
	})

	const hTracked = withHistory(state(uniqueKey('hist-tracked'), { default: 0 }))
	let iht = 0

	bench.add('write (with history)', () => {
		hTracked.set(++iht)
	})

	// Undo/redo cycle
	const hCycle = withHistory(state(uniqueKey('hist-cycle'), { default: 0 }), { maxSize: 100 })

	// Pre-fill history
	for (let i = 0; i < 50; i++) {
		hCycle.set(i)
	}

	bench.add('undo + redo cycle', () => {
		hCycle.undo()
		hCycle.redo()
	})

	// Write at max history (eviction)
	const hEvict = withHistory(state(uniqueKey('hist-evict'), { default: 0 }), { maxSize: 50 })

	// Fill to capacity
	for (let i = 0; i < 50; i++) {
		hEvict.set(i)
	}

	let iev = 50

	bench.add('write (history at capacity, evicting)', () => {
		hEvict.set(++iev)
	})

	await bench.run()

	console.log('── History (undo/redo) Overhead ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 6. Interceptor + hook (middleware) overhead
// ---------------------------------------------------------------------------

async function benchMiddleware() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Baseline: no middleware
	const mPlain = state(uniqueKey('mw-plain'), { default: 0 })
	let imp = 0

	bench.add('write (no middleware)', () => {
		mPlain.set(++imp)
	})

	// 1 interceptor
	const m1i = state(uniqueKey('mw-1i'), { default: 0 })

	m1i.intercept((next) => next)

	let i1i = 0

	bench.add('write (1 interceptor)', () => {
		m1i.set(++i1i)
	})

	// 5 interceptors
	const m5i = state(uniqueKey('mw-5i'), { default: 0 })

	for (let j = 0; j < 5; j++) {
		m5i.intercept((next) => next)
	}

	let i5i = 0

	bench.add('write (5 interceptors)', () => {
		m5i.set(++i5i)
	})

	// 1 use hook
	const m1h = state(uniqueKey('mw-1h'), { default: 0 })

	m1h.use(() => {})

	let i1h = 0

	bench.add('write (1 use hook)', () => {
		m1h.set(++i1h)
	})

	// 5 interceptors + 5 hooks
	const mAll = state(uniqueKey('mw-all'), { default: 0 })

	for (let j = 0; j < 5; j++) {
		mAll.intercept((next) => next)
		mAll.use(() => {})
	}

	let iAll = 0

	bench.add('write (5 interceptors + 5 hooks)', () => {
		mAll.set(++iAll)
	})

	await bench.run()

	console.log('── Interceptor / Hook Middleware Overhead ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 7. Watch (per-key) overhead
// ---------------------------------------------------------------------------

async function benchWatch() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

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

	// Watch key that did NOT change (no-op fire)
	const wNoop = state(uniqueKey('watch-noop'), {
		default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
	})

	wNoop.watch('b', () => {})

	let iwn = 0

	bench.add('write + watch (key unchanged)', () => {
		wNoop.set({ a: ++iwn, b: 0, c: 0, d: 0, e: 0 })
	})

	await bench.run()

	console.log('── Watch (Per-Key) Overhead ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 8. Subscribe/unsubscribe churn
// ---------------------------------------------------------------------------

async function benchSubscribeChurn() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const sSrc = state(uniqueKey('churn'), { default: 0 })

	bench.add('subscribe + immediate unsubscribe', () => {
		const unsub = sSrc.subscribe(() => {})
		unsub()
	})

	// Subscribe then write then unsubscribe
	bench.add('subscribe + write + unsubscribe', () => {
		const unsub = sSrc.subscribe(() => {})
		sSrc.set((v) => v + 1)
		unsub()
	})

	// Rapid subscribe accumulation (100 listeners, then cleanup)
	bench.add('accumulate 100 subs + teardown', () => {
		const unsubs: (() => void)[] = []

		for (let i = 0; i < 100; i++) {
			unsubs.push(sSrc.subscribe(() => {}))
		}

		for (const unsub of unsubs) {
			unsub()
		}
	})

	await bench.run()

	console.log('── Subscribe/Unsubscribe Churn ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 9. Large object state: read/write with many keys
// ---------------------------------------------------------------------------

async function benchLargeObject() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Small object (5 keys)
	type Small = Record<string, number>
	const smallObj: Small = {}

	for (let i = 0; i < 5; i++) smallObj[`k${i}`] = i

	const sSmall = state(uniqueKey('obj-small'), { default: smallObj })

	sSmall.subscribe(() => {})

	let ism = 0

	bench.add('write object (5 keys)', () => {
		const next = { ...smallObj, k0: ++ism }
		sSmall.set(next)
	})

	// Medium object (50 keys)
	const medObj: Record<string, number> = {}

	for (let i = 0; i < 50; i++) medObj[`k${i}`] = i

	const sMed = state(uniqueKey('obj-med'), { default: medObj })

	sMed.subscribe(() => {})

	let imd = 0

	bench.add('write object (50 keys)', () => {
		const next = { ...medObj, k0: ++imd }
		sMed.set(next)
	})

	// Large object (500 keys)
	const lgObj: Record<string, number> = {}

	for (let i = 0; i < 500; i++) lgObj[`k${i}`] = i

	const sLg = state(uniqueKey('obj-lg'), { default: lgObj })

	sLg.subscribe(() => {})

	let ilg = 0

	bench.add('write object (500 keys)', () => {
		const next = { ...lgObj, k0: ++ilg }
		sLg.set(next)
	})

	await bench.run()

	console.log('── Large Object State ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 10. Batch: scaling with number of state instances
// ---------------------------------------------------------------------------

async function benchBatchScaling() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	for (const count of [10, 50, 200]) {
		const items = Array.from({ length: count }, (_, i) =>
			state(uniqueKey(`bscale-${count}`), { default: i }),
		)

		for (const item of items) {
			item.subscribe(() => {})
		}

		let iter = 0

		bench.add(`batch (${count} states)`, () => {
			iter++

			batch(() => {
				for (let i = 0; i < count; i++) {
					items[i]!.set(iter + i)
				}
			})
		})
	}

	await bench.run()

	console.log('── Batch Scaling ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 11. Nested batch depth
// ---------------------------------------------------------------------------

async function benchNestedBatch() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const nbSrc = state(uniqueKey('nb'), { default: 0 })

	nbSrc.subscribe(() => {})

	let inb1 = 0

	bench.add('flat batch (1 level)', () => {
		batch(() => {
			nbSrc.set(++inb1)
		})
	})

	let inb3 = 0

	bench.add('nested batch (3 levels)', () => {
		batch(() => {
			batch(() => {
				batch(() => {
					nbSrc.set(++inb3)
				})
			})
		})
	})

	let inb10 = 0

	bench.add('nested batch (10 levels)', () => {
		function nest(depth: number): void {
			if (depth === 0) {
				nbSrc.set(++inb10)

				return
			}

			batch(() => nest(depth - 1))
		}

		nest(10)
	})

	await bench.run()

	console.log('── Nested Batch Depth ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 12. Instance create + destroy lifecycle
// ---------------------------------------------------------------------------

async function benchLifecycle() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	bench.add('create + destroy (render)', () => {
		const s = state(uniqueKey('lc-r'), { default: 0 })
		s.destroy()
	})

	bench.add('create + subscribe + write + destroy', () => {
		const s = state(uniqueKey('lc-full'), { default: 0 })
		const unsub = s.subscribe(() => {})
		s.set(42)
		unsub()
		s.destroy()
	})

	bench.add('create + destroy collection', () => {
		const col = collection(uniqueKey('lc-col'), { default: [] as number[] })
		col.destroy()
	})

	await bench.run()

	console.log('── Instance Lifecycle (Create + Destroy) ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 13. Custom equality (isEqual) overhead
// ---------------------------------------------------------------------------

async function benchIsEqual() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

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

	// With isEqual that always returns false (worst case)
	const sEqFalse = state(uniqueKey('eq-false'), {
		default: { a: 0, b: 0, c: 0 } as Obj,
		isEqual: () => false,
	})

	sEqFalse.subscribe(() => {})

	let ief = 0

	bench.add('write (isEqual: always false)', () => {
		sEqFalse.set({ a: ++ief, b: 0, c: 0 })
	})

	// With isEqual that skips (same value written repeatedly)
	const sEqSkip = state(uniqueKey('eq-skip'), {
		default: { a: 0, b: 0, c: 0 } as Obj,
		isEqual: (a, b) => a.a === b.a && a.b === b.b && a.c === b.c,
	})

	sEqSkip.subscribe(() => {})

	bench.add('write (isEqual: skips update)', () => {
		sEqSkip.set({ a: 0, b: 0, c: 0 }) // Same value each time
	})

	// JSON stringify equality (expensive)
	const sJson = state(uniqueKey('eq-json'), {
		default: { a: 0, b: 0, c: 0 } as Obj,
		isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
	})

	sJson.subscribe(() => {})

	let ij = 0

	bench.add('write (isEqual: JSON.stringify)', () => {
		sJson.set({ a: ++ij, b: 0, c: 0 })
	})

	await bench.run()

	console.log('── Custom Equality (isEqual) Overhead ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// 14. Functional updater vs direct value
// ---------------------------------------------------------------------------

async function benchUpdaterStyle() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

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

	await bench.run()

	console.log('── Updater Style (Direct vs Functional) ──')

	printResults(bench)
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------

async function main() {
	console.log('='.repeat(70))
	console.log('  Internal Benchmark: gjendje self-analysis')
	console.log('='.repeat(70))

	await benchCollectionOperations()
	await benchComputedChain()
	await benchComputedFanIn()
	await benchEffect()
	await benchHistory()
	await benchMiddleware()
	await benchWatch()
	await benchSubscribeChurn()
	await benchLargeObject()
	await benchBatchScaling()
	await benchNestedBatch()
	await benchLifecycle()
	await benchIsEqual()
	await benchUpdaterStyle()

	console.log('='.repeat(70))
	console.log('  Done.')
	console.log('='.repeat(70))
}

main().catch(console.error)
