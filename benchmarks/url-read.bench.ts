import { computed, select, state } from '../src/index.js'
import { defineSuite, runSuites, uniqueKey } from './helpers.js'

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

const repeatedReadsSuite = defineSuite('repeated-reads', {
	'URL Read: Repeated Reads (no writes)': (bench) => {
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
	},
})

// ---------------------------------------------------------------------------
// 2. Read after write
// ---------------------------------------------------------------------------

const readAfterWriteSuite = defineSuite('read-after-write', {
	'URL Read: Read After Write': (bench) => {
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
	},
})

// ---------------------------------------------------------------------------
// 3. Many reads per write (subscriber chain simulation)
// ---------------------------------------------------------------------------

const manyReadsPerWriteSuite = defineSuite('many-reads', {
	'URL Read: 100 Reads per 1 Write': (bench) => {
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
	},
})

// ---------------------------------------------------------------------------
// 4. Computed chain reading URL state
// ---------------------------------------------------------------------------

const computedChainSuite = defineSuite('computed-chain', {
	'URL Read: Computed Chain': (bench) => {
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
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'URL Adapter Read Benchmark',
	[repeatedReadsSuite, readAfterWriteSuite, manyReadsPerWriteSuite, computedChainSuite],
	'url-read',
).catch(console.error)
