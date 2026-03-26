/**
 * enhancer-chain.bench.ts
 *
 * Investigates prototype chain traversal overhead introduced by Object.create-based
 * enhancer wrapping (withHistory, withWatch, collection, etc.).
 *
 * Each enhancer wraps the previous instance with Object.create(instance), adding
 * one more level to the prototype chain. When chained:
 *   withHistory(withWatch(state))
 * ...creates a 3-level chain: historyObj -> watchObj -> MemoryStateImpl -> StateImpl.
 *
 * Every call to get()/set()/subscribe() must traverse this chain to find the method.
 * This benchmark measures how much each level costs and whether flat-copy or mixin
 * alternatives offer a meaningful speedup.
 *
 * Sections:
 *   1. Chain depth vs get() latency — 0 to 3 levels, Object.create vs Object.assign flat
 *   2. Chain depth vs set() latency — same comparison for the write path
 *   3. Cold method (destroy) vs hot method (get/set) across depths
 *   4. Flat-copy (Object.assign) alternatives at each chain depth
 *   5. Mixin pattern — mutate original instance directly
 *   6. Hybrid — prototype chain for cold methods, direct property for hot get/set
 *   7. Chain creation cost — how expensive is Object.create vs Object.assign vs closure
 *
 * Run with:
 *   tsx benchmarks/experiments/enhancer-chain.bench.ts
 *   tsx benchmarks/experiments/enhancer-chain.bench.ts --quick
 */

import { Bench } from 'tinybench'
import { benchConfig, formatOps, printResults } from '../helpers.js'
import { parseFlags } from '../ab.js'

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const flags = parseFlags(process.argv.slice(2))

if (flags.quick) {
	benchConfig.time = 500
	benchConfig.warmupTime = 100
}

// ---------------------------------------------------------------------------
// Minimal base instance — mirrors MemoryStateImpl's hot-path shape.
//
// We intentionally avoid importing from src/ to isolate the prototype chain
// overhead from MemoryStateImpl's own internals (adapter calls, batching, etc.).
// This lets us measure *only* the cost of prototype traversal.
// ---------------------------------------------------------------------------

interface FakeInstance {
	get(): number
	set(v: number): void
	subscribe(listener: (v: number) => void): () => void
	destroy(): void
	readonly value: number
}

function makeBase(initial: number): FakeInstance {
	let current = initial
	const listeners: Array<(v: number) => void> = []

	return {
		get(): number {
			return current
		},
		set(v: number): void {
			current = v
			for (const l of listeners) l(v)
		},
		subscribe(listener: (v: number) => void): () => void {
			listeners.push(listener)
			return () => {
				const idx = listeners.indexOf(listener)
				if (idx !== -1) listeners.splice(idx, 1)
			}
		},
		destroy(): void {
			listeners.length = 0
		},
		get value(): number {
			return current
		},
	}
}

// ---------------------------------------------------------------------------
// Enhancer-like wrappers — each adds one level of Object.create chain
// ---------------------------------------------------------------------------

interface WithExtra extends FakeInstance {
	extra1(): number
	extra2(): number
}

interface WithExtra2 extends WithExtra {
	extra3(): number
	extra4(): number
}

interface WithExtra3 extends WithExtra2 {
	extra5(): number
	extra6(): number
}

/** Simulates withWatch — adds 1 prototype level, defines 2 own methods */
function addLevel1(base: FakeInstance): WithExtra {
	const obj = Object.create(base) as WithExtra
	obj.extra1 = () => 1
	obj.extra2 = () => 2
	obj.destroy = () => {
		base.destroy()
	}
	return obj
}

/** Simulates withHistory — adds 2nd prototype level, defines 2 more own methods */
function addLevel2(base: WithExtra): WithExtra2 {
	const obj = Object.create(base) as WithExtra2
	obj.extra3 = () => 3
	obj.extra4 = () => 4
	obj.destroy = () => {
		base.destroy()
	}
	return obj
}

/** Simulates collection — adds 3rd prototype level, defines 2 more own methods */
function addLevel3(base: WithExtra2): WithExtra3 {
	const obj = Object.create(base) as WithExtra3
	obj.extra5 = () => 5
	obj.extra6 = () => 6
	obj.destroy = () => {
		base.destroy()
	}
	return obj
}

// ---------------------------------------------------------------------------
// Flat-copy alternatives — Object.assign instead of Object.create
// Creates a shallow copy of all own + inherited methods onto a plain object.
// Eliminates chain traversal but snapshots the interface (getters evaluated once).
// ---------------------------------------------------------------------------

function flatCopy<T extends object>(obj: T): T {
	const flat: Record<string, unknown> = {}
	// Walk prototype chain manually to collect all methods
	let proto: object | null = obj
	while (proto && proto !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			if (key === 'constructor') continue
			const desc = Object.getOwnPropertyDescriptor(proto, key)
			if (desc) {
				// Re-define property descriptors to preserve getters/setters
				Object.defineProperty(flat, key, desc)
			}
		}
		proto = Object.getPrototypeOf(proto)
	}
	return flat as T
}

/** Flat copy at depth 1 (1 enhancer level) */
function flatLevel1(base: FakeInstance): WithExtra {
	const level1 = addLevel1(base)
	return flatCopy(level1)
}

/** Flat copy at depth 2 (2 enhancer levels) */
function flatLevel2(base: FakeInstance): WithExtra2 {
	const level2 = addLevel2(addLevel1(base))
	return flatCopy(level2)
}

/** Flat copy at depth 3 (3 enhancer levels) */
function flatLevel3(base: FakeInstance): WithExtra3 {
	const level3 = addLevel3(addLevel2(addLevel1(base)))
	return flatCopy(level3)
}

// ---------------------------------------------------------------------------
// Mixin pattern — apply methods directly onto the original instance (mutate it)
// No prototype chain at all — methods are own properties on the base object.
// ---------------------------------------------------------------------------

interface MixedInstance extends FakeInstance {
	extra1(): number
	extra2(): number
	extra3(): number
	extra4(): number
	extra5(): number
	extra6(): number
}

function applyMixin1(base: FakeInstance): MixedInstance {
	const m = base as MixedInstance
	m.extra1 = () => 1
	m.extra2 = () => 2
	return m
}

function applyMixin2(base: FakeInstance): MixedInstance {
	const m = applyMixin1(base)
	m.extra3 = () => 3
	m.extra4 = () => 4
	return m
}

function applyMixin3(base: FakeInstance): MixedInstance {
	const m = applyMixin2(base)
	m.extra5 = () => 5
	m.extra6 = () => 6
	return m
}

// ---------------------------------------------------------------------------
// Hybrid pattern — prototype chain for cold methods (extra1-6, destroy),
// but get/set/subscribe promoted as own properties on each wrapper level.
//
// The idea: if get/set are the hot path, assign them directly to avoid
// prototype traversal for the most frequent operations.
// ---------------------------------------------------------------------------

function hybridLevel1(base: FakeInstance): WithExtra {
	const obj = Object.create(base) as WithExtra
	// Promote hot methods as own properties to avoid chain traversal
	obj.get = () => base.get()
	obj.set = (v: number) => base.set(v)
	obj.subscribe = (l: (v: number) => void) => base.subscribe(l)
	// Cold methods stay as own properties (enhancer-specific)
	obj.extra1 = () => 1
	obj.extra2 = () => 2
	obj.destroy = () => base.destroy()
	return obj
}

function hybridLevel2(base: WithExtra): WithExtra2 {
	const obj = Object.create(base) as WithExtra2
	obj.get = () => base.get()
	obj.set = (v: number) => base.set(v)
	obj.subscribe = (l: (v: number) => void) => base.subscribe(l)
	obj.extra3 = () => 3
	obj.extra4 = () => 4
	obj.destroy = () => base.destroy()
	return obj
}

function hybridLevel3(base: WithExtra2): WithExtra3 {
	const obj = Object.create(base) as WithExtra3
	obj.get = () => base.get()
	obj.set = (v: number) => base.set(v)
	obj.subscribe = (l: (v: number) => void) => base.subscribe(l)
	obj.extra5 = () => 5
	obj.extra6 = () => 6
	obj.destroy = () => base.destroy()
	return obj
}

// ---------------------------------------------------------------------------
// Section 1: get() latency across chain depths
// ---------------------------------------------------------------------------

async function runGetLatency() {
	const bench = new Bench(benchConfig)

	let sink = 0

	// Depth 0: direct instance, no chain
	{
		const inst = makeBase(42)
		bench.add('get() — depth 0 (direct)', () => {
			sink = inst.get()
		})
	}

	// Depth 1: Object.create chain (1 level)
	{
		const inst = addLevel1(makeBase(42))
		bench.add('get() — depth 1 (Object.create ×1)', () => {
			sink = inst.get()
		})
	}

	// Depth 2: Object.create chain (2 levels)
	{
		const inst = addLevel2(addLevel1(makeBase(42)))
		bench.add('get() — depth 2 (Object.create ×2)', () => {
			sink = inst.get()
		})
	}

	// Depth 3: Object.create chain (3 levels)
	{
		const inst = addLevel3(addLevel2(addLevel1(makeBase(42))))
		bench.add('get() — depth 3 (Object.create ×3)', () => {
			sink = inst.get()
		})
	}

	// Depth 1: flat copy
	{
		const inst = flatLevel1(makeBase(42))
		bench.add('get() — depth 1 (flat copy)', () => {
			sink = inst.get()
		})
	}

	// Depth 2: flat copy
	{
		const inst = flatLevel2(makeBase(42))
		bench.add('get() — depth 2 (flat copy)', () => {
			sink = inst.get()
		})
	}

	// Depth 3: flat copy
	{
		const inst = flatLevel3(makeBase(42))
		bench.add('get() — depth 3 (flat copy)', () => {
			sink = inst.get()
		})
	}

	// Depth 1: mixin (mutate base)
	{
		const inst = applyMixin1(makeBase(42))
		bench.add('get() — depth 1 (mixin/mutate)', () => {
			sink = inst.get()
		})
	}

	// Depth 2: mixin
	{
		const inst = applyMixin2(makeBase(42))
		bench.add('get() — depth 2 (mixin/mutate)', () => {
			sink = inst.get()
		})
	}

	// Depth 3: mixin
	{
		const inst = applyMixin3(makeBase(42))
		bench.add('get() — depth 3 (mixin/mutate)', () => {
			sink = inst.get()
		})
	}

	// Depth 1: hybrid (get promoted as own property)
	{
		const inst = hybridLevel1(makeBase(42))
		bench.add('get() — depth 1 (hybrid/own-prop)', () => {
			sink = inst.get()
		})
	}

	// Depth 2: hybrid
	{
		const inst = hybridLevel2(hybridLevel1(makeBase(42)))
		bench.add('get() — depth 2 (hybrid/own-prop)', () => {
			sink = inst.get()
		})
	}

	// Depth 3: hybrid
	{
		const inst = hybridLevel3(hybridLevel2(hybridLevel1(makeBase(42))))
		bench.add('get() — depth 3 (hybrid/own-prop)', () => {
			sink = inst.get()
		})
	}

	void sink
	await bench.run()

	console.log('\n── Section 1: get() latency across chain depth and alternatives ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 2: set() latency across chain depths
// ---------------------------------------------------------------------------

async function runSetLatency() {
	const bench = new Bench(benchConfig)

	let counter = 0

	// Depth 0
	{
		const inst = makeBase(0)
		bench.add('set() — depth 0 (direct)', () => {
			inst.set(++counter)
		})
	}

	// Depth 1: Object.create
	{
		const inst = addLevel1(makeBase(0))
		bench.add('set() — depth 1 (Object.create ×1)', () => {
			inst.set(++counter)
		})
	}

	// Depth 2: Object.create
	{
		const inst = addLevel2(addLevel1(makeBase(0)))
		bench.add('set() — depth 2 (Object.create ×2)', () => {
			inst.set(++counter)
		})
	}

	// Depth 3: Object.create
	{
		const inst = addLevel3(addLevel2(addLevel1(makeBase(0))))
		bench.add('set() — depth 3 (Object.create ×3)', () => {
			inst.set(++counter)
		})
	}

	// Depth 1: flat copy
	{
		const inst = flatLevel1(makeBase(0))
		bench.add('set() — depth 1 (flat copy)', () => {
			inst.set(++counter)
		})
	}

	// Depth 2: flat copy
	{
		const inst = flatLevel2(makeBase(0))
		bench.add('set() — depth 2 (flat copy)', () => {
			inst.set(++counter)
		})
	}

	// Depth 3: flat copy
	{
		const inst = flatLevel3(makeBase(0))
		bench.add('set() — depth 3 (flat copy)', () => {
			inst.set(++counter)
		})
	}

	// Depth 1: mixin
	{
		const inst = applyMixin1(makeBase(0))
		bench.add('set() — depth 1 (mixin/mutate)', () => {
			inst.set(++counter)
		})
	}

	// Depth 2: mixin
	{
		const inst = applyMixin2(makeBase(0))
		bench.add('set() — depth 2 (mixin/mutate)', () => {
			inst.set(++counter)
		})
	}

	// Depth 3: mixin
	{
		const inst = applyMixin3(makeBase(0))
		bench.add('set() — depth 3 (mixin/mutate)', () => {
			inst.set(++counter)
		})
	}

	// Depth 1: hybrid
	{
		const inst = hybridLevel1(makeBase(0))
		bench.add('set() — depth 1 (hybrid/own-prop)', () => {
			inst.set(++counter)
		})
	}

	// Depth 2: hybrid
	{
		const inst = hybridLevel2(hybridLevel1(makeBase(0)))
		bench.add('set() — depth 2 (hybrid/own-prop)', () => {
			inst.set(++counter)
		})
	}

	// Depth 3: hybrid
	{
		const inst = hybridLevel3(hybridLevel2(hybridLevel1(makeBase(0))))
		bench.add('set() — depth 3 (hybrid/own-prop)', () => {
			inst.set(++counter)
		})
	}

	await bench.run()

	console.log('\n── Section 2: set() latency across chain depth and alternatives ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 3: Hot method (get/set) vs cold method (destroy) at each depth
//
// "Cold" methods are called rarely (on cleanup), so traversal cost matters
// less there. This section checks whether the chain overhead is asymmetric.
// ---------------------------------------------------------------------------

async function runHotVsCold() {
	const bench = new Bench(benchConfig)

	let sink = 0

	// Hot: get() at depth 0
	{
		const inst = makeBase(42)
		bench.add('hot: get() — depth 0', () => {
			sink = inst.get()
		})
	}

	// Hot: get() at depth 3
	{
		const inst = addLevel3(addLevel2(addLevel1(makeBase(42))))
		bench.add('hot: get() — depth 3', () => {
			sink = inst.get()
		})
	}

	// Cold: destroy() at depth 0 — We can't repeatedly destroy, so we simulate
	// by calling a no-op "destroy" on a fresh object each iteration.
	// Instead, benchmark the property lookup cost of destroy itself, by wrapping
	// in a closure that just looks it up (property access, not full destroy call).
	{
		const inst = makeBase(42)
		bench.add('cold lookup: destroy — depth 0', () => {
			sink = typeof inst.destroy
		})
	}

	// Cold: destroy() property lookup at depth 3
	{
		const inst = addLevel3(addLevel2(addLevel1(makeBase(42))))
		bench.add('cold lookup: destroy — depth 3', () => {
			sink = typeof inst.destroy
		})
	}

	// Extra: own property (no chain traversal) at depth 3 — extra1 is own
	{
		const inst = addLevel3(addLevel2(addLevel1(makeBase(42))))
		bench.add('own-prop lookup: extra5 — depth 3', () => {
			sink = typeof inst.extra5
		})
	}

	// Prototype property (found at depth 3 level vs depth 0 level)
	{
		const inst = addLevel3(addLevel2(addLevel1(makeBase(42))))
		bench.add('chain lookup: get — depth 3 (found at base)', () => {
			sink = typeof inst.get
		})
	}

	void sink
	await bench.run()

	console.log('\n── Section 3: Hot (get/set) vs cold (destroy) method latency at depth ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 4: Flat-copy deep-dive — all depths, comparing Object.create vs flat
// Focus: is the flat-copy speedup consistent or does V8 inline-cache the chain?
// ---------------------------------------------------------------------------

async function runFlatCopyDeepDive() {
	const bench = new Bench(benchConfig)

	let sink = 0

	// Object.create at depths 0-3
	for (let depth = 0; depth <= 3; depth++) {
		const base = makeBase(42)
		const inst =
			depth === 0
				? base
				: depth === 1
					? addLevel1(base)
					: depth === 2
						? addLevel2(addLevel1(base))
						: addLevel3(addLevel2(addLevel1(base)))
		const label = `Object.create depth ${depth} — get()`
		bench.add(label, () => {
			sink = inst.get()
		})
	}

	// Flat copy at depths 1-3 (depth 0 is already flat)
	for (let depth = 1; depth <= 3; depth++) {
		const base = makeBase(42)
		const inst =
			depth === 1 ? flatLevel1(base) : depth === 2 ? flatLevel2(base) : flatLevel3(base)
		const label = `flat copy     depth ${depth} — get()`
		bench.add(label, () => {
			sink = inst.get()
		})
	}

	// Mixin at depths 1-3
	for (let depth = 1; depth <= 3; depth++) {
		const base = makeBase(42)
		const inst =
			depth === 1 ? applyMixin1(base) : depth === 2 ? applyMixin2(base) : applyMixin3(base)
		const label = `mixin/mutate  depth ${depth} — get()`
		bench.add(label, () => {
			sink = inst.get()
		})
	}

	void sink
	await bench.run()

	console.log('\n── Section 4: Flat-copy deep-dive — Object.create vs flat vs mixin at each depth ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 5: Creation cost — how expensive is each approach to instantiate?
//
// Object.create is typically fast (just sets [[Prototype]]).
// Object.assign / flatCopy traverses the chain once at creation.
// Mixin mutates the base — cheapest but destructive.
// ---------------------------------------------------------------------------

async function runCreationCost() {
	const bench = new Bench(benchConfig)

	// Plain base creation
	bench.add('create: base only (no enhancer)', () => {
		const inst = makeBase(0)
		void inst
	})

	// 1 level: Object.create
	bench.add('create: depth 1 (Object.create)', () => {
		const inst = addLevel1(makeBase(0))
		void inst
	})

	// 2 levels: Object.create
	bench.add('create: depth 2 (Object.create ×2)', () => {
		const inst = addLevel2(addLevel1(makeBase(0)))
		void inst
	})

	// 3 levels: Object.create
	bench.add('create: depth 3 (Object.create ×3)', () => {
		const inst = addLevel3(addLevel2(addLevel1(makeBase(0))))
		void inst
	})

	// 1 level: flat copy
	bench.add('create: depth 1 (flat copy)', () => {
		const inst = flatLevel1(makeBase(0))
		void inst
	})

	// 2 levels: flat copy
	bench.add('create: depth 2 (flat copy)', () => {
		const inst = flatLevel2(makeBase(0))
		void inst
	})

	// 3 levels: flat copy
	bench.add('create: depth 3 (flat copy)', () => {
		const inst = flatLevel3(makeBase(0))
		void inst
	})

	// 1 level: mixin (mutate)
	bench.add('create: depth 1 (mixin/mutate)', () => {
		const inst = applyMixin1(makeBase(0))
		void inst
	})

	// 2 levels: mixin
	bench.add('create: depth 2 (mixin/mutate)', () => {
		const inst = applyMixin2(makeBase(0))
		void inst
	})

	// 3 levels: mixin
	bench.add('create: depth 3 (mixin/mutate)', () => {
		const inst = applyMixin3(makeBase(0))
		void inst
	})

	// 1 level: hybrid
	bench.add('create: depth 1 (hybrid)', () => {
		const inst = hybridLevel1(makeBase(0))
		void inst
	})

	// 2 levels: hybrid
	bench.add('create: depth 2 (hybrid)', () => {
		const inst = hybridLevel2(hybridLevel1(makeBase(0)))
		void inst
	})

	// 3 levels: hybrid
	bench.add('create: depth 3 (hybrid)', () => {
		const inst = hybridLevel3(hybridLevel2(hybridLevel1(makeBase(0))))
		void inst
	})

	await bench.run()

	console.log('\n── Section 5: Creation cost — Object.create vs flat-copy vs mixin vs hybrid ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 6: Realistic "use" pattern — create + get N times + destroy
//
// In real usage, an instance is created once and get() is called many times.
// This models the amortized cost: creation overhead divided over many reads.
// ---------------------------------------------------------------------------

async function runRealisticUse() {
	const bench = new Bench(benchConfig)

	const GET_REPS = 10 // simulate 10 reads per instance lifetime

	let sink = 0

	// Direct instance (no enhancer)
	bench.add(`realistic: create + get×${GET_REPS} + destroy — depth 0`, () => {
		const inst = makeBase(42)
		for (let i = 0; i < GET_REPS; i++) sink = inst.get()
		inst.destroy()
	})

	// Depth 1: Object.create
	bench.add(`realistic: create + get×${GET_REPS} + destroy — depth 1 (Object.create)`, () => {
		const inst = addLevel1(makeBase(42))
		for (let i = 0; i < GET_REPS; i++) sink = inst.get()
		inst.destroy()
	})

	// Depth 3: Object.create
	bench.add(`realistic: create + get×${GET_REPS} + destroy — depth 3 (Object.create)`, () => {
		const inst = addLevel3(addLevel2(addLevel1(makeBase(42))))
		for (let i = 0; i < GET_REPS; i++) sink = inst.get()
		inst.destroy()
	})

	// Depth 1: flat copy
	bench.add(`realistic: create + get×${GET_REPS} + destroy — depth 1 (flat copy)`, () => {
		const inst = flatLevel1(makeBase(42))
		for (let i = 0; i < GET_REPS; i++) sink = inst.get()
		inst.destroy()
	})

	// Depth 3: flat copy
	bench.add(`realistic: create + get×${GET_REPS} + destroy — depth 3 (flat copy)`, () => {
		const inst = flatLevel3(makeBase(42))
		for (let i = 0; i < GET_REPS; i++) sink = inst.get()
		inst.destroy()
	})

	// Depth 3: mixin
	bench.add(`realistic: create + get×${GET_REPS} + destroy — depth 3 (mixin)`, () => {
		const inst = applyMixin3(makeBase(42))
		for (let i = 0; i < GET_REPS; i++) sink = inst.get()
		inst.destroy()
	})

	// Depth 3: hybrid
	bench.add(`realistic: create + get×${GET_REPS} + destroy — depth 3 (hybrid)`, () => {
		const inst = hybridLevel3(hybridLevel2(hybridLevel1(makeBase(42))))
		for (let i = 0; i < GET_REPS; i++) sink = inst.get()
		inst.destroy()
	})

	void sink
	await bench.run()

	console.log(
		`\n── Section 6: Realistic use — create + get×${GET_REPS} + destroy (amortized cost) ──`,
	)
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Section 7: Mixed hot path — interleaved get() and set() calls
// More representative of reactive state usage than isolated get or set.
// ---------------------------------------------------------------------------

async function runMixedHotPath() {
	const bench = new Bench(benchConfig)

	let counter = 0
	let sink = 0

	// Depth 0: direct
	{
		const inst = makeBase(0)
		bench.add('get+set interleaved — depth 0 (direct)', () => {
			inst.set(++counter)
			sink = inst.get()
		})
	}

	// Depth 3: Object.create
	{
		const inst = addLevel3(addLevel2(addLevel1(makeBase(0))))
		bench.add('get+set interleaved — depth 3 (Object.create)', () => {
			inst.set(++counter)
			sink = inst.get()
		})
	}

	// Depth 3: flat copy
	{
		const inst = flatLevel3(makeBase(0))
		bench.add('get+set interleaved — depth 3 (flat copy)', () => {
			inst.set(++counter)
			sink = inst.get()
		})
	}

	// Depth 3: mixin
	{
		const inst = applyMixin3(makeBase(0))
		bench.add('get+set interleaved — depth 3 (mixin)', () => {
			inst.set(++counter)
			sink = inst.get()
		})
	}

	// Depth 3: hybrid
	{
		const inst = hybridLevel3(hybridLevel2(hybridLevel1(makeBase(0))))
		bench.add('get+set interleaved — depth 3 (hybrid)', () => {
			inst.set(++counter)
			sink = inst.get()
		})
	}

	void sink
	await bench.run()

	console.log('\n── Section 7: Mixed hot path — interleaved get() + set() at depth ──')
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('='.repeat(70))
console.log('  Enhancer Chain Overhead Experiments')
console.log('  (Object.create prototype chain vs flat-copy vs mixin vs hybrid)')
console.log('='.repeat(70))
console.log()
console.log('This benchmark isolates prototype chain traversal cost from')
console.log('MemoryStateImpl internals by using a minimal fake base instance.')
console.log()
console.log('Variants:')
console.log('  Object.create  Standard pattern: each enhancer wraps with Object.create()')
console.log('  flat copy      All methods copied to a plain object (no chain traversal)')
console.log('  mixin/mutate   Methods added directly to original instance (no wrapping)')
console.log('  hybrid         Object.create chain but get/set promoted as own properties')
console.log()
console.log('Depths:')
console.log('  depth 0        Direct instance access (no enhancers)')
console.log('  depth 1        One enhancer level (e.g. withWatch(state))')
console.log('  depth 2        Two enhancer levels (e.g. withHistory(withWatch(state)))')
console.log('  depth 3        Three enhancer levels (e.g. collection + watch + history)')
console.log()

await runGetLatency()
await runSetLatency()
await runHotVsCold()
await runFlatCopyDeepDive()
await runCreationCost()
await runRealisticUse()
await runMixedHotPath()

console.log('='.repeat(70))
console.log('  Done.')
console.log('='.repeat(70))
