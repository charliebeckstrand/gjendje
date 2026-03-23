import { Bench } from 'tinybench'
import { computed, select, state } from '../src/index.js'
import { formatOps, printResults, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// Mock window + location + history for Node
// ---------------------------------------------------------------------------

const location = { pathname: '/app', search: '', hash: '' }

Object.defineProperty(globalThis, 'window', {
	value: {
		location,
		history: {
			pushState(_: unknown, __: string, url: string) {
				const parsed = new URL(url, 'http://localhost')

				location.pathname = parsed.pathname
				location.search = parsed.search
				location.hash = parsed.hash
			},
		},
		addEventListener: () => {},
		removeEventListener: () => {},
	},
	configurable: true,
	writable: true,
})

// ---------------------------------------------------------------------------
// 1. Repeated reads (no writes between — pure cache test)
// ---------------------------------------------------------------------------

async function benchRepeatedReads() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const page = state(uniqueKey('url-read-prim'), { default: 1, scope: 'url' })

	page.set(42)

	bench.add('url get() — repeated reads (primitive)', () => {
		page.get()
	})

	const obj = state(uniqueKey('url-read-obj'), {
		default: { q: '', page: 1, sort: 'asc' },
		scope: 'url',
	})

	obj.set({ q: 'hello', page: 3, sort: 'desc' })

	bench.add('url get() — repeated reads (object, 3 keys)', () => {
		obj.get()
	})

	await bench.run()

	console.log('── URL Read: Repeated Reads (no writes) ──')

	printResults(bench)

	page.destroy()
	obj.destroy()
}

// ---------------------------------------------------------------------------
// 2. Read after write
// ---------------------------------------------------------------------------

async function benchReadAfterWrite() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const page = state(uniqueKey('url-rw-prim'), { default: 1, scope: 'url' })

	let i = 0

	bench.add('url set() + get() — primitive', () => {
		page.set(++i)
		page.get()
	})

	const obj = state(uniqueKey('url-rw-obj'), {
		default: { q: '', page: 1, sort: 'asc' },
		scope: 'url',
	})

	let j = 0

	bench.add('url set() + get() — object (3 keys)', () => {
		obj.set({ q: `term-${++j}`, page: j, sort: 'desc' })
		obj.get()
	})

	await bench.run()

	console.log('── URL Read: Read After Write ──')

	printResults(bench)

	page.destroy()
	obj.destroy()
}

// ---------------------------------------------------------------------------
// 3. Many reads per write (subscriber chain simulation)
// ---------------------------------------------------------------------------

async function benchManyReadsPerWrite() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const READS_PER_WRITE = 100

	const obj = state(uniqueKey('url-ratio'), {
		default: { q: '', page: 1, sort: 'asc' },
		scope: 'url',
	})

	let i = 0

	bench.add(`url ${READS_PER_WRITE} reads per write (object, 3 keys)`, () => {
		obj.set({ q: `term-${++i}`, page: i, sort: 'desc' })

		for (let r = 0; r < READS_PER_WRITE; r++) {
			obj.get()
		}
	})

	await bench.run()

	console.log(`── URL Read: ${READS_PER_WRITE} Reads per 1 Write ──`)

	printResults(bench)

	obj.destroy()
}

// ---------------------------------------------------------------------------
// 4. Computed chain reading URL state
// ---------------------------------------------------------------------------

async function benchComputedChain() {
	const bench = new Bench({ time: 1000, warmupTime: 200 })

	const src = state(uniqueKey('url-comp'), {
		default: { q: '', page: 1 },
		scope: 'url',
	})

	const derived1 = select(src, (v) => v.q)
	const derived2 = select(src, (v) => v.page)
	const combined = computed([derived1, derived2], ([q, p]) => `${q}:${p}`)

	let i = 0

	bench.add('url set() + computed chain get()', () => {
		src.set({ q: `q-${++i}`, page: i })
		combined.get()
	})

	await bench.run()

	console.log('── URL Read: Computed Chain ──')

	printResults(bench)

	combined.destroy()
	derived1.destroy()
	derived2.destroy()
	src.destroy()
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites('URL Adapter Read Benchmark', [
	{ name: 'repeated-reads', fn: benchRepeatedReads },
	{ name: 'read-after-write', fn: benchReadAfterWrite },
	{ name: 'many-reads', fn: benchManyReadsPerWrite },
	{ name: 'computed-chain', fn: benchComputedChain },
]).catch(console.error)
