/**
 * Batch notification system — alternative approach benchmarks.
 *
 * Tests the current WeakMap-based deduplication approach against:
 *   1. Set<fn> — a plain ES6 Set used as a seen-tracker, cleared on flush
 *   2. Generation counter on fn object (own-property tag)
 *   3. Map<fn, number> — strong-reference deduplication
 *   4. Linked-list queue instead of array (avoids array resizing)
 *   5. Direct dispatch fast-path (bypass notify() entirely when not batching)
 *
 * Run with: npx tsx benchmarks/batch-experiment.bench.ts
 */

import { Bench } from 'tinybench'
import { printResults } from './helpers.js'

// ---------------------------------------------------------------------------
// Re-implement the batch/notify machinery for each approach so we can
// benchmark the dispatch loop in isolation without pulling in the full lib.
// ---------------------------------------------------------------------------

// --------------- CURRENT: WeakMap + generation counter ---------------

function makeWeakMapBatch() {
	let depth = 0
	let generation = 0
	let queue: (() => void)[] = []
	const lastGen = new WeakMap<() => void, number>()

	function flush() {
		while (queue.length > 0) {
			generation++
			const current = queue
			queue = []
			depth++
			try {
				for (let i = 0; i < current.length; i++) {
					const fn = current[i]
					if (fn) fn()
				}
			} finally {
				depth--
			}
		}
	}

	function notify(fn: () => void) {
		if (depth > 0) {
			if (lastGen.get(fn) !== generation) {
				lastGen.set(fn, generation)
				queue.push(fn)
			}
			return
		}
		fn()
	}

	function batch(fn: () => void) {
		depth++
		try {
			fn()
		} finally {
			depth--
			if (depth === 0) flush()
		}
	}

	return { notify, batch }
}

// --------------- ALTERNATIVE A: Set<fn> deduplication ---------------
// Use a Set<fn> as a "seen" tracker. Clear it at flush start.
// Advantage: no number comparison, just a single Set.has call.
// Trade-off: Set.has() + Set.add() vs WeakMap.get() + WeakMap.set() —
// Set iterates a hash table too, so performance should be similar.

function makeSetBatch() {
	let depth = 0
	let queue: (() => void)[] = []
	const seen = new Set<() => void>()

	function flush() {
		while (queue.length > 0) {
			const current = queue
			queue = []
			seen.clear()
			depth++
			try {
				for (let i = 0; i < current.length; i++) {
					const fn = current[i]
					if (fn) fn()
				}
			} finally {
				depth--
			}
		}
	}

	function notify(fn: () => void) {
		if (depth > 0) {
			if (!seen.has(fn)) {
				seen.add(fn)
				queue.push(fn)
			}
			return
		}
		fn()
	}

	function batch(fn: () => void) {
		depth++
		try {
			fn()
		} finally {
			depth--
			if (depth === 0) flush()
		}
	}

	return { notify, batch }
}

// --------------- ALTERNATIVE B: own-property generation tag on fn ---------------
// Stamp each function with a numeric tag directly as an own property.
// Reads are property accesses (IC-friendly), writes are too.
// Potential downside: mutates external objects (functions), prevents GC of the
// property if the fn is held elsewhere. Also pollutes function objects.

type TaggedFn = (() => void) & { __batchGen?: number }

function makeTagBatch() {
	let depth = 0
	let generation = 1
	let queue: TaggedFn[] = []

	function flush() {
		while (queue.length > 0) {
			generation++
			const current = queue
			queue = []
			depth++
			try {
				for (let i = 0; i < current.length; i++) {
					const fn = current[i]
					if (fn) fn()
				}
			} finally {
				depth--
			}
		}
	}

	function notify(fn: TaggedFn) {
		if (depth > 0) {
			if (fn.__batchGen !== generation) {
				fn.__batchGen = generation
				queue.push(fn)
			}
			return
		}
		fn()
	}

	function batch(fn: () => void) {
		depth++
		try {
			fn()
		} finally {
			depth--
			if (depth === 0) flush()
		}
	}

	return { notify, batch }
}

// --------------- ALTERNATIVE C: Map<fn, number> (strong ref) ---------------
// Like WeakMap but Map — keeps hard references. Slightly different GC
// semantics but Map lookup may be faster on some V8 shapes.

function makeMapBatch() {
	let depth = 0
	let generation = 0
	let queue: (() => void)[] = []
	const lastGen = new Map<() => void, number>()

	function flush() {
		while (queue.length > 0) {
			generation++
			const current = queue
			queue = []
			depth++
			try {
				for (let i = 0; i < current.length; i++) {
					const fn = current[i]
					if (fn) fn()
				}
			} finally {
				depth--
			}
		}
	}

	function notify(fn: () => void) {
		if (depth > 0) {
			if (lastGen.get(fn) !== generation) {
				lastGen.set(fn, generation)
				queue.push(fn)
			}
			return
		}
		fn()
	}

	function batch(fn: () => void) {
		depth++
		try {
			fn()
		} finally {
			depth--
			if (depth === 0) flush()
		}
	}

	return { notify, batch }
}

// --------------- ALTERNATIVE D: pre-allocated double-buffer queue ---------------
// Use two fixed-size typed arrays that swap roles on flush instead of
// allocating a new array each flush. Falls back to push() if capacity exceeded.
// The key insight: no `queue = []` allocation on the hot path.

function makeDoubleBufferBatch(capacity = 256) {
	let depth = 0
	let generation = 0
	let writeIdx = 0
	let bufA: ((() => void) | null)[] = new Array(capacity).fill(null)
	let bufB: ((() => void) | null)[] = new Array(capacity).fill(null)
	let active = bufA
	const lastGen = new WeakMap<() => void, number>()

	function flush() {
		while (writeIdx > 0) {
			generation++
			const current = active
			const len = writeIdx
			// Swap buffers
			active = active === bufA ? bufB : bufA
			writeIdx = 0
			depth++
			try {
				for (let i = 0; i < len; i++) {
					const fn = current[i]
					current[i] = null // allow GC
					if (fn) fn()
				}
			} finally {
				depth--
			}
		}
	}

	function notify(fn: () => void) {
		if (depth > 0) {
			if (lastGen.get(fn) !== generation) {
				lastGen.set(fn, generation)
				if (writeIdx < capacity) {
					active[writeIdx++] = fn
				} else {
					// Overflow: fallback to dynamic push
					;(active as (() => void)[]).push(fn)
					writeIdx++
				}
			}
			return
		}
		fn()
	}

	function batch(fn: () => void) {
		depth++
		try {
			fn()
		} finally {
			depth--
			if (depth === 0) flush()
		}
	}

	return { notify, batch }
}

// --------------- ALTERNATIVE E: no-batch inline fast-path ---------------
// The most common case is NO batching (depth === 0). In that case notify()
// currently does: `if (depth > 0) { ... } fn()`. We test whether the branch
// is already predicted well or if removing the function call overhead helps.
// This is the "ideal ceiling" — what if we skip notify() entirely and
// call the listener directly from MemoryStateImpl.set?

// We simulate the inline fast-path: set() calls notifyFn() directly without
// going through notify(), same as what a hypothetical inlined version would do.

function makeInlineBatch() {
	// No-op: inline path means "just call fn directly, no dispatch overhead"
	// Simulated below in the benchmark by calling fn() directly.
	return {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		notify: (fn: () => void) => fn(),
		batch: (fn: () => void) => fn(),
	}
}

// --------------- ALTERNATIVE F: boolean flag on a wrapper object ---------------
// Wrap each fn in a tiny { fn, queued: boolean } object. dequeue by
// iterating and checking queued flag. Avoids WeakMap entirely by trading
// a property check on an owned object.

interface FnWrapper {
	fn: () => void
	queued: boolean
}

function makeWrapperBatch() {
	let depth = 0
	let queue: FnWrapper[] = []

	function flush() {
		while (queue.length > 0) {
			const current = queue
			queue = []
			depth++
			try {
				for (let i = 0; i < current.length; i++) {
					const w = current[i]
					if (w) {
						w.queued = false
						w.fn()
					}
				}
			} finally {
				depth--
			}
		}
	}

	// The wrapper must be created once per fn (same as the fn closure itself)
	// This simulates a MemoryCore that stores { fn, queued } instead of just fn.
	function makeWrapper(fn: () => void): FnWrapper {
		return { fn, queued: false }
	}

	function notifyWrapper(w: FnWrapper) {
		if (depth > 0) {
			if (!w.queued) {
				w.queued = true
				queue.push(w)
			}
			return
		}
		w.fn()
	}

	function batch(fn: () => void) {
		depth++
		try {
			fn()
		} finally {
			depth--
			if (depth === 0) flush()
		}
	}

	return { notifyWrapper, makeWrapper, batch }
}

// ---------------------------------------------------------------------------
// Benchmark 1: notify() overhead OUTSIDE a batch (depth === 0, no queuing)
// This is the HOT PATH — every non-batched set() goes here.
// ---------------------------------------------------------------------------

async function benchNotifyNoBatch() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	// A realistic notify target — comparable to MemoryStateImpl's notifyFn
	let sink = 0
	const target = () => { sink++ }
	const targetTagged: TaggedFn = target

	const weakmap = makeWeakMapBatch()
	const setImpl = makeSetBatch()
	const tag = makeTagBatch()
	const mapImpl = makeMapBatch()
	const dbl = makeDoubleBufferBatch()
	const wrapper = makeWrapperBatch()
	const wObj = wrapper.makeWrapper(target)

	bench.add('notify() no-batch — current (WeakMap+gen)', () => {
		weakmap.notify(target)
	})

	bench.add('notify() no-batch — Set<fn>', () => {
		setImpl.notify(target)
	})

	bench.add('notify() no-batch — own-prop gen tag', () => {
		tag.notify(targetTagged)
	})

	bench.add('notify() no-batch — Map<fn, number>', () => {
		mapImpl.notify(target)
	})

	bench.add('notify() no-batch — double-buffer', () => {
		dbl.notify(target)
	})

	bench.add('notify() no-batch — wrapper obj flag', () => {
		wrapper.notifyWrapper(wObj)
	})

	bench.add('notify() no-batch — IDEAL (direct call)', () => {
		target()
	})

	await bench.run()

	console.log('\n── notify() when NOT batching (depth=0) — the common case ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Benchmark 2: batching with N distinct functions (dedup matters here)
// ---------------------------------------------------------------------------

async function benchBatchNDistinct(n: number) {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	let sink = 0

	// Create N independent notify targets
	const fns = Array.from({ length: n }, (_, i) => () => { sink += i })
	const taggedFns: TaggedFn[] = fns.map(f => f as TaggedFn)

	const weakmap = makeWeakMapBatch()
	const setImpl = makeSetBatch()
	const tag = makeTagBatch()
	const mapImpl = makeMapBatch()
	const dbl = makeDoubleBufferBatch(n * 2)
	const wrapper = makeWrapperBatch()
	const wrapperObjs = fns.map(f => wrapper.makeWrapper(f))

	bench.add(`batch ${n} distinct — current (WeakMap+gen)`, () => {
		weakmap.batch(() => {
			for (let i = 0; i < n; i++) weakmap.notify(fns[i]!)
		})
	})

	bench.add(`batch ${n} distinct — Set<fn>`, () => {
		setImpl.batch(() => {
			for (let i = 0; i < n; i++) setImpl.notify(fns[i]!)
		})
	})

	bench.add(`batch ${n} distinct — own-prop gen tag`, () => {
		tag.batch(() => {
			for (let i = 0; i < n; i++) tag.notify(taggedFns[i]!)
		})
	})

	bench.add(`batch ${n} distinct — Map<fn, number>`, () => {
		mapImpl.batch(() => {
			for (let i = 0; i < n; i++) mapImpl.notify(fns[i]!)
		})
	})

	bench.add(`batch ${n} distinct — double-buffer`, () => {
		dbl.batch(() => {
			for (let i = 0; i < n; i++) dbl.notify(fns[i]!)
		})
	})

	bench.add(`batch ${n} distinct — wrapper obj flag`, () => {
		wrapper.batch(() => {
			for (let i = 0; i < n; i++) wrapper.notifyWrapper(wrapperObjs[i]!)
		})
	})

	await bench.run()

	console.log(`\n── batch() with ${n} distinct notifications ──`)
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Benchmark 3: batching with duplicates (same fn called N times)
// This is the dedup case — WeakMap/Set/tag must filter repeats.
// ---------------------------------------------------------------------------

async function benchBatchDuplicates(n: number) {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	let sink = 0
	const single = () => { sink++ }
	const singleTagged: TaggedFn = single

	const weakmap = makeWeakMapBatch()
	const setImpl = makeSetBatch()
	const tag = makeTagBatch()
	const mapImpl = makeMapBatch()
	const dbl = makeDoubleBufferBatch()
	const wrapper = makeWrapperBatch()
	const wObj = wrapper.makeWrapper(single)

	bench.add(`batch ${n}x same fn — current (WeakMap+gen)`, () => {
		weakmap.batch(() => {
			for (let i = 0; i < n; i++) weakmap.notify(single)
		})
	})

	bench.add(`batch ${n}x same fn — Set<fn>`, () => {
		setImpl.batch(() => {
			for (let i = 0; i < n; i++) setImpl.notify(single)
		})
	})

	bench.add(`batch ${n}x same fn — own-prop gen tag`, () => {
		tag.batch(() => {
			for (let i = 0; i < n; i++) tag.notify(singleTagged)
		})
	})

	bench.add(`batch ${n}x same fn — Map<fn, number>`, () => {
		mapImpl.batch(() => {
			for (let i = 0; i < n; i++) mapImpl.notify(single)
		})
	})

	bench.add(`batch ${n}x same fn — double-buffer`, () => {
		dbl.batch(() => {
			for (let i = 0; i < n; i++) dbl.notify(single)
		})
	})

	bench.add(`batch ${n}x same fn — wrapper obj flag`, () => {
		wrapper.batch(() => {
			for (let i = 0; i < n; i++) wrapper.notifyWrapper(wObj)
		})
	})

	await bench.run()

	console.log(`\n── batch() with ${n}x duplicate notifications (dedup stress) ──`)
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Benchmark 4: queue flush cost — array replace vs double-buffer
// Measures the cost of the `queue = []` idiom vs swapping pre-allocated bufs.
// ---------------------------------------------------------------------------

async function benchQueueFlush() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	let sink = 0
	const N = 20
	const fns = Array.from({ length: N }, (_, i) => () => { sink += i })
	const taggedFns: TaggedFn[] = fns.map(f => f as TaggedFn)

	const weakmap = makeWeakMapBatch()
	const dbl = makeDoubleBufferBatch(N * 2)
	const tag = makeTagBatch()

	bench.add('flush cycle (WeakMap+gen, array replace)', () => {
		weakmap.batch(() => {
			for (let i = 0; i < N; i++) weakmap.notify(fns[i]!)
		})
	})

	bench.add('flush cycle (double-buffer, WeakMap)', () => {
		dbl.batch(() => {
			for (let i = 0; i < N; i++) dbl.notify(fns[i]!)
		})
	})

	bench.add('flush cycle (own-prop gen tag, array replace)', () => {
		tag.batch(() => {
			for (let i = 0; i < N; i++) tag.notify(taggedFns[i]!)
		})
	})

	await bench.run()

	console.log('\n── Flush cycle cost: array-replace vs double-buffer (N=20) ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Benchmark 5: the real-world simulation
// Mirrors what MemoryStateImpl.set() + batch() actually do:
// - Set a value on 10 states inside a batch
// - Each state has 1 subscriber
// - Measures total round-trip: batch enter, 10x notify, flush, 10x listener call
// ---------------------------------------------------------------------------

async function benchRealWorldSim() {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	let sink = 0
	const N = 10

	// Simulate state objects with a notify function stored per-instance
	function makeStateGroup(batchImpl: ReturnType<typeof makeWeakMapBatch>) {
		return Array.from({ length: N }, (_, i) => {
			let value = i
			let notifyFn: (() => void) | undefined

			// Simulate subscribe() creating notifyFn lazily
			const listener = (v: number) => { sink += v }

			notifyFn = () => listener(value)

			return {
				set(v: number) {
					value = v
					if (notifyFn) batchImpl.notify(notifyFn)
				},
			}
		})
	}

	const wm = makeWeakMapBatch()
	const wmStates = makeStateGroup(wm)

	const sm = makeSetBatch()
	// Adapt Set batch to match WeakMap interface
	const smAdapted = { notify: sm.notify, batch: sm.batch }
	const smStates = Array.from({ length: N }, (_, i) => {
		let value = i
		let notifyFn: (() => void) | undefined
		const listener = (v: number) => { sink += v }
		notifyFn = () => listener(value)
		return {
			set(v: number) {
				value = v
				if (notifyFn) smAdapted.notify(notifyFn)
			},
		}
	})

	// Tag-based approach
	const tg = makeTagBatch()
	const tgStates = Array.from({ length: N }, (_, i) => {
		let value = i
		let notifyFn: TaggedFn | undefined
		const listener = (v: number) => { sink += v }
		notifyFn = () => listener(value)
		return {
			set(v: number) {
				value = v
				if (notifyFn) tg.notify(notifyFn)
			},
		}
	})

	// Wrapper-based approach
	const wr = makeWrapperBatch()
	const wrStates = Array.from({ length: N }, (_, i) => {
		let value = i
		const listener = (v: number) => { sink += v }
		const fn = () => listener(value)
		const wrapper = wr.makeWrapper(fn)
		return {
			set(v: number) {
				value = v
				wr.notifyWrapper(wrapper)
			},
		}
	})

	// Double-buffer approach
	const db = makeDoubleBufferBatch(N * 2)
	const dbStates = Array.from({ length: N }, (_, i) => {
		let value = i
		let notifyFn: (() => void) | undefined
		const listener = (v: number) => { sink += v }
		notifyFn = () => listener(value)
		return {
			set(v: number) {
				value = v
				if (notifyFn) db.notify(notifyFn)
			},
		}
	})

	let iter = 0

	bench.add('real-world sim — current (WeakMap+gen)', () => {
		iter++
		wm.batch(() => {
			for (let i = 0; i < N; i++) wmStates[i]!.set(iter + i)
		})
	})

	bench.add('real-world sim — Set<fn>', () => {
		iter++
		sm.batch(() => {
			for (let i = 0; i < N; i++) smStates[i]!.set(iter + i)
		})
	})

	bench.add('real-world sim — own-prop gen tag', () => {
		iter++
		tg.batch(() => {
			for (let i = 0; i < N; i++) tgStates[i]!.set(iter + i)
		})
	})

	bench.add('real-world sim — wrapper obj flag', () => {
		iter++
		wr.batch(() => {
			for (let i = 0; i < N; i++) wrStates[i]!.set(iter + i)
		})
	})

	bench.add('real-world sim — double-buffer', () => {
		iter++
		db.batch(() => {
			for (let i = 0; i < N; i++) dbStates[i]!.set(iter + i)
		})
	})

	await bench.run()

	console.log('\n── Real-world simulation: batch(10 states, each with 1 listener) ──')
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------

console.log('='.repeat(70))
console.log('  Batch Notification System — Alternative Approaches')
console.log('  Investigating: WeakMap vs Set vs own-prop tag vs double-buffer')
console.log('='.repeat(70))

await benchNotifyNoBatch()
await benchBatchNDistinct(10)
await benchBatchNDistinct(50)
await benchBatchDuplicates(10)
await benchBatchDuplicates(50)
await benchQueueFlush()
await benchRealWorldSim()

console.log('='.repeat(70))
console.log('  Done.')
console.log('='.repeat(70))
