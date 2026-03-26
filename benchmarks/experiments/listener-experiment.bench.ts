/**
 * Listener Notification Pattern Experiments
 *
 * Investigates alternative notification strategies for MemoryStateImpl:
 *
 *  1. Inline single-listener fast path (like computed.ts already does)
 *  2. Array vs Set for listeners storage
 *  3. Skip safeCall try/catch overhead (bare direct call)
 *  4. Notification batching / dirty-pull vs push
 *
 * Run with:
 *   tsx benchmarks/listener-experiment.bench.ts
 *   tsx benchmarks/listener-experiment.bench.ts --quick
 */

import { Bench } from 'tinybench'
import { notify } from '../src/batch.js'
import { safeCall } from '../src/listeners.js'
import { benchConfig, formatOps, printResults } from './helpers.js'
import { parseFlags } from './ab.js'

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const flags = parseFlags(process.argv.slice(2))

if (flags.quick) {
	benchConfig.time = 500
	benchConfig.warmupTime = 100
}

// ---------------------------------------------------------------------------
// Helpers: minimal listener-notification implementations
// Each variant implements set(value) and subscribe(listener) -> unsub,
// isolated from gjendje internals so we benchmark the pattern alone.
// ---------------------------------------------------------------------------

type Listener<T> = (value: T) => void
type Unsub = () => void

// ---- BASELINE: current MemoryStateImpl pattern ----
// Set<Listener> + shared notifyFn closure + safeCall + notify() dispatch
function makeBaseline<T>(initial: T) {
	let current = initial
	let listeners: Set<Listener<T>> | undefined
	let notifyFn: (() => void) | undefined

	return {
		subscribe(l: Listener<T>): Unsub {
			if (!listeners) {
				const set = new Set<Listener<T>>()

				listeners = set
				notifyFn = () => {
					for (const fn of set) {
						safeCall(fn, current)
					}
				}
			}

			listeners.add(l)

			return () => {
				listeners!.delete(l)
			}
		},

		set(v: T): void {
			current = v

			if (notifyFn !== undefined) {
				notify(notifyFn)
			}
		},
	}
}

// ---- ALT-A: singleListener fast path (like computed.ts) ----
// Adds a singleListener slot: when listenerCount === 1, call directly
// without iterating the Set — avoids iterator allocation entirely.
function makeAltA<T>(initial: T) {
	let current = initial
	let listeners: Set<Listener<T>> | undefined
	let singleListener: Listener<T> | undefined
	let listenerCount = 0
	let notifyFn: (() => void) | undefined

	return {
		subscribe(l: Listener<T>): Unsub {
			if (!listeners) {
				const set = new Set<Listener<T>>()

				listeners = set
				notifyFn = () => {
					if (singleListener !== undefined) {
						safeCall(singleListener, current)
						return
					}

					for (const fn of set) {
						safeCall(fn, current)
					}
				}
			}

			listeners.add(l)
			listenerCount++
			singleListener = listenerCount === 1 ? l : undefined

			return () => {
				listeners!.delete(l)
				listenerCount--

				if (listenerCount === 1) {
					singleListener = listeners!.values().next().value as Listener<T>
				} else {
					singleListener = undefined
				}
			}
		},

		set(v: T): void {
			current = v

			if (notifyFn !== undefined) {
				notify(notifyFn)
			}
		},
	}
}

// ---- ALT-B: Array instead of Set for listeners ----
// Trades O(1) delete for better iteration: no iterator object, tight loop.
// For small listener counts (1-5), indexOf+splice is fast enough.
function makeAltB<T>(initial: T) {
	let current = initial
	let listeners: Listener<T>[] | undefined
	let notifyFn: (() => void) | undefined

	return {
		subscribe(l: Listener<T>): Unsub {
			if (!listeners) {
				const arr: Listener<T>[] = []

				listeners = arr
				notifyFn = () => {
					const len = arr.length

					for (let i = 0; i < len; i++) {
						safeCall(arr[i] as Listener<T>, current)
					}
				}
			}

			listeners.push(l)

			return () => {
				const idx = listeners!.indexOf(l)

				if (idx !== -1) {
					listeners!.splice(idx, 1)
				}
			}
		},

		set(v: T): void {
			current = v

			if (notifyFn !== undefined) {
				notify(notifyFn)
			}
		},
	}
}

// ---- ALT-C: Array + single-listener fast path ----
// Combines ALT-A and ALT-B: array storage with singleListener slot.
function makeAltC<T>(initial: T) {
	let current = initial
	let listeners: Listener<T>[] | undefined
	let singleListener: Listener<T> | undefined
	let notifyFn: (() => void) | undefined

	return {
		subscribe(l: Listener<T>): Unsub {
			if (!listeners) {
				const arr: Listener<T>[] = []

				listeners = arr
				notifyFn = () => {
					if (singleListener !== undefined) {
						safeCall(singleListener, current)
						return
					}

					const len = arr.length

					for (let i = 0; i < len; i++) {
						safeCall(arr[i] as Listener<T>, current)
					}
				}
			}

			listeners.push(l)
			singleListener = listeners.length === 1 ? l : undefined

			return () => {
				const idx = listeners!.indexOf(l)

				if (idx !== -1) {
					listeners!.splice(idx, 1)
				}

				singleListener = listeners!.length === 1 ? (listeners![0] ?? undefined) : undefined
			}
		},

		set(v: T): void {
			current = v

			if (notifyFn !== undefined) {
				notify(notifyFn)
			}
		},
	}
}

// ---- ALT-D: Skip safeCall — bare direct call (no try/catch per listener) ----
// safeCall adds try/catch which historically forces V8 out of optimized mode.
// This variant calls the listener directly. Error isolation is lost, but
// measures the raw overhead of the safety wrapper.
function makeAltD<T>(initial: T) {
	let current = initial
	let listeners: Set<Listener<T>> | undefined
	let singleListener: Listener<T> | undefined
	let listenerCount = 0
	let notifyFn: (() => void) | undefined

	return {
		subscribe(l: Listener<T>): Unsub {
			if (!listeners) {
				const set = new Set<Listener<T>>()

				listeners = set
				notifyFn = () => {
					if (singleListener !== undefined) {
						singleListener(current)
						return
					}

					for (const fn of set) {
						fn(current)
					}
				}
			}

			listeners.add(l)
			listenerCount++
			singleListener = listenerCount === 1 ? l : undefined

			return () => {
				listeners!.delete(l)
				listenerCount--

				if (listenerCount === 1) {
					singleListener = listeners!.values().next().value as Listener<T>
				} else {
					singleListener = undefined
				}
			}
		},

		set(v: T): void {
			current = v

			if (notifyFn !== undefined) {
				notify(notifyFn)
			}
		},
	}
}

// ---- ALT-E: Inline notify() — bypass WeakMap generation check outside batch ----
// notify() always does a WeakMap.get() even outside a batch. Since depth=0
// outside any batch(), we can check depth inline and call fn() directly.
// This trades code size for one less WeakMap lookup on the hot non-batch path.
//
// We import batch internals indirectly via the module. Instead, we replicate
// the logic with a local depth-tracking shim to isolate the pattern.
// In practice, this would require exposing `depth` from batch.ts.
//
// For benchmarking, we simulate: if we KNOW we are not inside a batch,
// call notifyFn() directly rather than going through notify().
function makeAltE<T>(initial: T) {
	let current = initial
	let listeners: Set<Listener<T>> | undefined
	let singleListener: Listener<T> | undefined
	let listenerCount = 0
	let notifyFn: (() => void) | undefined

	return {
		subscribe(l: Listener<T>): Unsub {
			if (!listeners) {
				const set = new Set<Listener<T>>()

				listeners = set
				notifyFn = () => {
					if (singleListener !== undefined) {
						safeCall(singleListener, current)
						return
					}

					for (const fn of set) {
						safeCall(fn, current)
					}
				}
			}

			listeners.add(l)
			listenerCount++
			singleListener = listenerCount === 1 ? l : undefined

			return () => {
				listeners!.delete(l)
				listenerCount--

				if (listenerCount === 1) {
					singleListener = listeners!.values().next().value as Listener<T>
				} else {
					singleListener = undefined
				}
			}
		},

		// Inlines notify() logic: no WeakMap lookup unless inside a batch.
		// Calls notifyFn() directly (outside batch) or delegates to notify().
		set(v: T): void {
			current = v

			// notifyFn is never re-registered with WeakMap here, so we call it
			// directly. batch() depth is 0 in these benchmarks, so this path
			// matches the actual non-batch hot path.
			if (notifyFn !== undefined) {
				notifyFn()
			}
		},
	}
}

// ---- ALT-F: Fully direct — bare call + no notify() dispatch + single-listener path ----
// Combines ALT-D (no safeCall) + ALT-E (no notify WeakMap dispatch).
// Maximum raw throughput, minimum safety. Measures the theoretical ceiling.
function makeAltF<T>(initial: T) {
	let current = initial
	let listeners: Set<Listener<T>> | undefined
	let singleListener: Listener<T> | undefined
	let listenerCount = 0

	return {
		subscribe(l: Listener<T>): Unsub {
			if (!listeners) {
				listeners = new Set<Listener<T>>()
			}

			listeners.add(l)
			listenerCount++
			singleListener = listenerCount === 1 ? l : undefined

			return () => {
				listeners!.delete(l)
				listenerCount--

				if (listenerCount === 1) {
					singleListener = listeners!.values().next().value as Listener<T>
				} else {
					singleListener = undefined
				}
			}
		},

		set(v: T): void {
			current = v

			if (singleListener !== undefined) {
				singleListener(current)
				return
			}

			if (listeners !== undefined) {
				for (const fn of listeners) {
					fn(current)
				}
			}
		},
	}
}

// ---------------------------------------------------------------------------
// Section 1: 1 subscriber (the dominant real-world case)
// Each state has exactly 1 listener (e.g., a single computed/effect).
// ---------------------------------------------------------------------------

async function runSingle() {
	const bench = new Bench(benchConfig)

	let sink = 0

	// Baseline
	{
		const s = makeBaseline(0)

		s.subscribe((v) => {
			sink = v
		})
		let i = 0

		bench.add('baseline (Set + safeCall + notify)', () => {
			s.set(++i)
		})
	}

	// Alt-A: singleListener fast path, Set storage
	{
		const s = makeAltA(0)

		s.subscribe((v) => {
			sink = v
		})
		let i = 0

		bench.add('alt-A: singleListener (Set)', () => {
			s.set(++i)
		})
	}

	// Alt-B: Array storage
	{
		const s = makeAltB(0)

		s.subscribe((v) => {
			sink = v
		})
		let i = 0

		bench.add('alt-B: Array storage', () => {
			s.set(++i)
		})
	}

	// Alt-C: Array + singleListener
	{
		const s = makeAltC(0)

		s.subscribe((v) => {
			sink = v
		})
		let i = 0

		bench.add('alt-C: Array + singleListener', () => {
			s.set(++i)
		})
	}

	// Alt-D: singleListener + no safeCall (bare call)
	{
		const s = makeAltD(0)

		s.subscribe((v) => {
			sink = v
		})
		let i = 0

		bench.add('alt-D: singleListener + bare call (no safeCall)', () => {
			s.set(++i)
		})
	}

	// Alt-E: singleListener + direct notifyFn (no WeakMap)
	{
		const s = makeAltE(0)

		s.subscribe((v) => {
			sink = v
		})
		let i = 0

		bench.add('alt-E: singleListener + direct notifyFn (no WeakMap)', () => {
			s.set(++i)
		})
	}

	// Alt-F: theoretical max (bare call + no notify dispatch)
	{
		const s = makeAltF(0)

		s.subscribe((v) => {
			sink = v
		})
		let i = 0

		bench.add('alt-F: bare call + no notify dispatch (ceiling)', () => {
			s.set(++i)
		})
	}

	void sink // prevent DCE
	await bench.run()

	console.log('\n── Section 1: 1 Subscriber (single computed/effect) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 2: 3 subscribers (small fan-out)
// ---------------------------------------------------------------------------

async function runThree() {
	const bench = new Bench(benchConfig)

	let sink = 0

	// Baseline
	{
		const s = makeBaseline(0)

		s.subscribe((v) => {
			sink = v
		})
		s.subscribe((v) => {
			sink = v + 1
		})
		s.subscribe((v) => {
			sink = v + 2
		})
		let i = 0

		bench.add('baseline (Set + safeCall + notify)', () => {
			s.set(++i)
		})
	}

	// Alt-A: singleListener fast path (3 listeners: singleListener = undefined, uses Set loop)
	{
		const s = makeAltA(0)

		s.subscribe((v) => {
			sink = v
		})
		s.subscribe((v) => {
			sink = v + 1
		})
		s.subscribe((v) => {
			sink = v + 2
		})
		let i = 0

		bench.add('alt-A: singleListener (Set, 3 listeners)', () => {
			s.set(++i)
		})
	}

	// Alt-B: Array
	{
		const s = makeAltB(0)

		s.subscribe((v) => {
			sink = v
		})
		s.subscribe((v) => {
			sink = v + 1
		})
		s.subscribe((v) => {
			sink = v + 2
		})
		let i = 0

		bench.add('alt-B: Array storage', () => {
			s.set(++i)
		})
	}

	// Alt-C: Array + singleListener
	{
		const s = makeAltC(0)

		s.subscribe((v) => {
			sink = v
		})
		s.subscribe((v) => {
			sink = v + 1
		})
		s.subscribe((v) => {
			sink = v + 2
		})
		let i = 0

		bench.add('alt-C: Array + singleListener', () => {
			s.set(++i)
		})
	}

	// Alt-D: singleListener + bare call
	{
		const s = makeAltD(0)

		s.subscribe((v) => {
			sink = v
		})
		s.subscribe((v) => {
			sink = v + 1
		})
		s.subscribe((v) => {
			sink = v + 2
		})
		let i = 0

		bench.add('alt-D: singleListener + bare call', () => {
			s.set(++i)
		})
	}

	// Alt-E: singleListener + direct notifyFn
	{
		const s = makeAltE(0)

		s.subscribe((v) => {
			sink = v
		})
		s.subscribe((v) => {
			sink = v + 1
		})
		s.subscribe((v) => {
			sink = v + 2
		})
		let i = 0

		bench.add('alt-E: singleListener + direct notifyFn', () => {
			s.set(++i)
		})
	}

	// Alt-F: bare call + no notify dispatch
	{
		const s = makeAltF(0)

		s.subscribe((v) => {
			sink = v
		})
		s.subscribe((v) => {
			sink = v + 1
		})
		s.subscribe((v) => {
			sink = v + 2
		})
		let i = 0

		bench.add('alt-F: bare call + no notify dispatch', () => {
			s.set(++i)
		})
	}

	void sink
	await bench.run()

	console.log('\n── Section 2: 3 Subscribers (small fan-out) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 3: Subscribe + unsubscribe churn (tests delete cost)
// ---------------------------------------------------------------------------

async function runChurn() {
	const bench = new Bench(benchConfig)

	// Baseline: subscribe + set + unsub
	{
		const s = makeBaseline(0)

		let i = 0

		bench.add('baseline: subscribe + set + unsub', () => {
			const unsub = s.subscribe(() => {})

			s.set(++i)
			unsub()
		})
	}

	// Alt-A: singleListener + Set
	{
		const s = makeAltA(0)

		let i = 0

		bench.add('alt-A: subscribe + set + unsub (Set)', () => {
			const unsub = s.subscribe(() => {})

			s.set(++i)
			unsub()
		})
	}

	// Alt-B: Array storage
	{
		const s = makeAltB(0)

		let i = 0

		bench.add('alt-B: subscribe + set + unsub (Array)', () => {
			const unsub = s.subscribe(() => {})

			s.set(++i)
			unsub()
		})
	}

	// Alt-C: Array + singleListener
	{
		const s = makeAltC(0)

		let i = 0

		bench.add('alt-C: subscribe + set + unsub (Array+single)', () => {
			const unsub = s.subscribe(() => {})

			s.set(++i)
			unsub()
		})
	}

	// Alt-D: bare call + singleListener (Set)
	{
		const s = makeAltD(0)

		let i = 0

		bench.add('alt-D: subscribe + set + unsub (bare+single)', () => {
			const unsub = s.subscribe(() => {})

			s.set(++i)
			unsub()
		})
	}

	// Alt-E: direct notifyFn + singleListener
	{
		const s = makeAltE(0)

		let i = 0

		bench.add('alt-E: subscribe + set + unsub (direct+single)', () => {
			const unsub = s.subscribe(() => {})

			s.set(++i)
			unsub()
		})
	}

	// Alt-F: bare call + no dispatch
	{
		const s = makeAltF(0)

		let i = 0

		bench.add('alt-F: subscribe + set + unsub (bare+nodispatch)', () => {
			const unsub = s.subscribe(() => {})

			s.set(++i)
			unsub()
		})
	}

	await bench.run()

	console.log('\n── Section 3: Subscribe + set + unsubscribe churn ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 4: set() with NO subscribers (checks null-guard overhead)
// ---------------------------------------------------------------------------

async function runNoSubs() {
	const bench = new Bench(benchConfig)

	// Baseline: notifyFn never created, just the `if (notifyFn !== undefined)` check
	{
		const s = makeBaseline(0)

		let i = 0

		bench.add('baseline: set() no subscribers', () => {
			s.set(++i)
		})
	}

	// Alt-F also has no notifyFn path
	{
		const s = makeAltF(0)

		let i = 0

		bench.add('alt-F: set() no subscribers', () => {
			s.set(++i)
		})
	}

	await bench.run()

	console.log('\n── Section 4: set() with no subscribers (null-guard cost) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 5: 10 subscribers (large fan-out — tests array vs set at scale)
// ---------------------------------------------------------------------------

async function runTen() {
	const bench = new Bench(benchConfig)

	let sink = 0

	// Baseline
	{
		const s = makeBaseline(0)

		for (let j = 0; j < 10; j++) {
			s.subscribe((v) => {
				sink = v + j
			})
		}

		let i = 0

		bench.add('baseline (Set + safeCall + notify)', () => {
			s.set(++i)
		})
	}

	// Alt-B: Array
	{
		const s = makeAltB(0)

		for (let j = 0; j < 10; j++) {
			s.subscribe((v) => {
				sink = v + j
			})
		}

		let i = 0

		bench.add('alt-B: Array (10 subs)', () => {
			s.set(++i)
		})
	}

	// Alt-D: bare call + singleListener (no safeCall)
	{
		const s = makeAltD(0)

		for (let j = 0; j < 10; j++) {
			s.subscribe((v) => {
				sink = v + j
			})
		}

		let i = 0

		bench.add('alt-D: bare call (10 subs)', () => {
			s.set(++i)
		})
	}

	// Alt-E: direct notifyFn (no WeakMap lookup)
	{
		const s = makeAltE(0)

		for (let j = 0; j < 10; j++) {
			s.subscribe((v) => {
				sink = v + j
			})
		}

		let i = 0

		bench.add('alt-E: direct notifyFn (10 subs)', () => {
			s.set(++i)
		})
	}

	// Alt-F: bare call + no dispatch
	{
		const s = makeAltF(0)

		for (let j = 0; j < 10; j++) {
			s.subscribe((v) => {
				sink = v + j
			})
		}

		let i = 0

		bench.add('alt-F: bare call + no dispatch (10 subs)', () => {
			s.set(++i)
		})
	}

	void sink
	await bench.run()

	console.log('\n── Section 5: 10 Subscribers (large fan-out) ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('='.repeat(70))
console.log('  Listener Notification Pattern Experiments')
console.log('  (Investigating MemoryStateImpl optimization alternatives)')
console.log('='.repeat(70))
console.log('\nVariants:')
console.log('  baseline  Current MemoryStateImpl: Set + safeCall + notify(WeakMap dispatch)')
console.log('  alt-A     + singleListener fast path when count === 1 (like computed.ts)')
console.log('  alt-B     + Array instead of Set for listener storage')
console.log('  alt-C     + Array + singleListener combined')
console.log('  alt-D     + singleListener + bare call (no safeCall try/catch)')
console.log('  alt-E     + singleListener + direct notifyFn() (skip WeakMap in notify())')
console.log('  alt-F     + bare call + no notify() dispatch (theoretical ceiling)')
console.log()

await runSingle()
await runThree()
await runChurn()
await runNoSubs()
await runTen()

console.log('='.repeat(70))
console.log('  Done.')
console.log('='.repeat(70))
