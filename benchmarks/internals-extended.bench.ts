import { Bench } from 'tinybench'
import { computed, readonly, select, snapshot, state } from '../src/index.js'
import { readAndMigrate, wrapForStorage } from '../src/persist.js'
import { getRegistry, scopedKey } from '../src/registry.js'
import { printResults, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// 1. select() vs computed() — single-dependency projection
//    select() is documented as a lighter alternative to computed() when
//    only one dependency is needed. This validates that claim.
// ---------------------------------------------------------------------------

async function benchSelectVsComputed() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// --- creation cost ---
	bench.add('select: create + destroy', () => {
		const src = state(uniqueKey('sel-c'), { default: { name: 'Jane', age: 30 } })
		const sel = select(src, (u) => u.name)
		sel.destroy()
		src.destroy()
	})

	bench.add('computed: create + destroy (1 dep)', () => {
		const src = state(uniqueKey('comp-c'), { default: { name: 'Jane', age: 30 } })
		const comp = computed([src], ([u]) => u.name)
		comp.destroy()
		src.destroy()
	})

	await bench.run()
	printResults(bench)

	// --- read throughput ---
	const bench2 = new Bench({ time: 1000, warmupTime: 200 })

	const readSrc = state(uniqueKey('sel-read'), { default: { name: 'Jane', age: 30 } })
	const sel = select(readSrc, (u) => u.name)
	const comp = computed([readSrc], ([u]) => u.name)

	bench2.add('select.get() (cached)', () => {
		sel.get()
	})

	bench2.add('computed.get() (cached, 1 dep)', () => {
		comp.get()
	})

	await bench2.run()
	printResults(bench2)

	// --- write-then-read (recomputation) ---
	const bench3 = new Bench({ time: 1000, warmupTime: 200 })

	const writeSrc = state(uniqueKey('sel-wr'), { default: { name: 'Jane', age: 0 } })
	const selW = select(writeSrc, (u) => u.age)
	const compW = computed([writeSrc], ([u]) => u.age)

	let i1 = 0
	bench3.add('select: set source + get', () => {
		writeSrc.set({ name: 'Jane', age: ++i1 })
		selW.get()
	})

	let i2 = 0
	bench3.add('computed: set source + get (1 dep)', () => {
		writeSrc.set({ name: 'Jane', age: ++i2 })
		compW.get()
	})

	await bench3.run()
	printResults(bench3)

	// --- with subscriber (notification path) ---
	const bench4 = new Bench({ time: 1000, warmupTime: 200 })

	const subSrc = state(uniqueKey('sel-sub'), { default: 0 })
	const selS = select(subSrc, (v) => v * 2)
	const compS = computed([subSrc], ([v]) => v * 2)

	selS.subscribe(() => {})
	compS.subscribe(() => {})

	let i3 = 0
	bench4.add('select: write + notify', () => {
		subSrc.set(++i3)
	})

	let i4 = 0
	bench4.add('computed: write + notify (1 dep)', () => {
		subSrc.set(++i4)
	})

	await bench4.run()
	printResults(bench4)

	// cleanup
	for (const inst of [sel, comp, selW, compW, selS, compS, readSrc, writeSrc, subSrc]) {
		inst.destroy()
	}
}

// ---------------------------------------------------------------------------
// 2. readonly() overhead — read through a readonly wrapper vs direct access
// ---------------------------------------------------------------------------

async function benchReadonlyOverhead() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const src = state(uniqueKey('ro'), { default: { x: 1, y: 2 } })
	const ro = readonly(src)

	bench.add('direct state.get()', () => {
		src.get()
	})

	bench.add('readonly(state).get()', () => {
		ro.get()
	})

	bench.add('direct state.peek()', () => {
		src.peek()
	})

	bench.add('readonly(state).peek()', () => {
		ro.peek()
	})

	await bench.run()
	printResults(bench)

	// --- subscribe through readonly ---
	const bench2 = new Bench({ time: 1000, warmupTime: 200 })

	bench2.add('subscribe via direct state', () => {
		const unsub = src.subscribe(() => {})
		unsub()
	})

	bench2.add('subscribe via readonly(state)', () => {
		const unsub = ro.subscribe(() => {})
		unsub()
	})

	await bench2.run()
	printResults(bench2)

	// --- readonly wrapping cost ---
	const bench3 = new Bench({ time: 1000, warmupTime: 200 })

	bench3.add('readonly() wrapper creation', () => {
		readonly(src)
	})

	await bench3.run()
	printResults(bench3)

	src.destroy()
}

// ---------------------------------------------------------------------------
// 3. Registry lookup at scale
//    Stress-test the internal registry Map with hundreds/thousands of entries
//    to validate lookup remains O(1).
// ---------------------------------------------------------------------------

async function benchRegistryLookup() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	// Pre-populate registry with N instances
	const sizes = [100, 500, 1000] as const

	const pools: Record<number, ReturnType<typeof state<number>>[]> = {}

	for (const n of sizes) {
		pools[n] = Array.from({ length: n }, (_, i) => state(uniqueKey(`reg-${n}`), { default: i }))
	}

	const registry = getRegistry()

	// Benchmark lookup by key at different registry sizes
	for (const n of sizes) {
		const keys = pools[n].map((s) => scopedKey(s.key, s.scope))
		let idx = 0

		bench.add(`registry.get() with ${n} entries`, () => {
			registry.get(keys[idx++ % n])
		})
	}

	// Benchmark cache-hit (state() returns cached) at different sizes
	const bench2 = new Bench({ time: 1000, warmupTime: 200 })

	for (const n of sizes) {
		const keyList = pools[n].map((s) => s.key)
		let idx = 0

		bench2.add(`state() cache-hit with ${n} entries`, () => {
			state(keyList[idx++ % n], { default: 0 })
		})
	}

	await bench.run()
	printResults(bench)

	await bench2.run()
	printResults(bench2)

	// --- snapshot at scale ---
	const bench3 = new Bench({ time: 1000, warmupTime: 200 })

	for (const n of sizes) {
		bench3.add(`snapshot() with ${n} instances`, () => {
			snapshot()
		})

		// Only keep the right pool alive for each sub-bench
		// We run all sizes at once since the registry accumulates
	}

	await bench3.run()
	printResults(bench3)

	// cleanup
	for (const pool of Object.values(pools)) {
		for (const s of pool) s.destroy()
	}
}

// ---------------------------------------------------------------------------
// 4. Persistence round-trip
//    Measures serialization (wrapForStorage) and deserialization+migration
//    (readAndMigrate) cost for various data sizes and migration depths.
// ---------------------------------------------------------------------------

async function benchPersistRoundTrip() {
	// --- wrapForStorage ---
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const small = { theme: 'dark' }
	const medium = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, i]))
	const large = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`key${i}`, `value-${i}`]))

	bench.add('wrapForStorage: primitive', () => {
		wrapForStorage(42)
	})

	bench.add('wrapForStorage: small object (1 key)', () => {
		wrapForStorage(small)
	})

	bench.add('wrapForStorage: medium object (20 keys)', () => {
		wrapForStorage(medium)
	})

	bench.add('wrapForStorage: large object (200 keys)', () => {
		wrapForStorage(large)
	})

	bench.add('wrapForStorage: medium + version envelope', () => {
		wrapForStorage(medium, 3)
	})

	await bench.run()
	printResults(bench)

	// --- readAndMigrate: no migration ---
	const bench2 = new Bench({ time: 1000, warmupTime: 200 })

	const rawSmall = JSON.stringify(small)
	const rawMedium = JSON.stringify(medium)
	const rawLarge = JSON.stringify(large)

	bench2.add('readAndMigrate: small (no migration)', () => {
		readAndMigrate(rawSmall, { default: small })
	})

	bench2.add('readAndMigrate: medium (no migration)', () => {
		readAndMigrate(rawMedium, { default: medium })
	})

	bench2.add('readAndMigrate: large (no migration)', () => {
		readAndMigrate(rawLarge, { default: large })
	})

	await bench2.run()
	printResults(bench2)

	// --- readAndMigrate: with migration chain ---
	const bench3 = new Bench({ time: 1000, warmupTime: 200 })

	type Versioned = { name: string; age?: number; email?: string }

	const migrations: Record<number, (old: unknown) => unknown> = {
		1: (d) => ({ ...(d as object), age: 0 }),
		2: (d) => ({ ...(d as object), email: '' }),
		3: (d) => {
			const obj = d as Versioned
			return { ...obj, name: obj.name.toUpperCase() }
		},
	}

	const v1Envelope = JSON.stringify({ v: 1, data: { name: 'alice' } })

	bench3.add('readAndMigrate: 3-step migration', () => {
		readAndMigrate(v1Envelope, {
			default: { name: '', age: 0, email: '' },
			version: 4,
			migrate: migrations,
		})
	})

	const v2Envelope = JSON.stringify({ v: 2, data: { name: 'alice', age: 25 } })

	bench3.add('readAndMigrate: 2-step migration', () => {
		readAndMigrate(v2Envelope, {
			default: { name: '', age: 0, email: '' },
			version: 4,
			migrate: migrations,
		})
	})

	const v3Envelope = JSON.stringify({ v: 3, data: { name: 'alice', age: 25, email: 'a@b.c' } })

	bench3.add('readAndMigrate: 1-step migration', () => {
		readAndMigrate(v3Envelope, {
			default: { name: '', age: 0, email: '' },
			version: 4,
			migrate: migrations,
		})
	})

	await bench3.run()
	printResults(bench3)

	// --- readAndMigrate: with validation ---
	const bench4 = new Bench({ time: 1000, warmupTime: 200 })

	const validRaw = JSON.stringify({ theme: 'dark', fontSize: 14 })

	bench4.add('readAndMigrate: no validate', () => {
		readAndMigrate(validRaw, { default: { theme: 'light', fontSize: 12 } })
	})

	const isThemeConfig = (v: unknown): v is { theme: string; fontSize: number } =>
		typeof v === 'object' && v !== null && 'theme' in v

	bench4.add('readAndMigrate: with validate (pass)', () => {
		readAndMigrate(validRaw, {
			default: { theme: 'light', fontSize: 12 },
			validate: isThemeConfig,
		})
	})

	bench4.add('readAndMigrate: with validate (fail → default)', () => {
		readAndMigrate(JSON.stringify('invalid'), {
			default: { theme: 'light', fontSize: 12 },
			validate: isThemeConfig,
		})
	})

	await bench4.run()
	printResults(bench4)
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites('Internal Extended Benchmarks', [
	{ name: 'select-vs-computed', fn: benchSelectVsComputed },
	{ name: 'readonly-overhead', fn: benchReadonlyOverhead },
	{ name: 'registry-lookup', fn: benchRegistryLookup },
	{ name: 'persist-round-trip', fn: benchPersistRoundTrip },
])
