import { computed, state } from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. peek() vs get() read cost
// ---------------------------------------------------------------------------

const peekVsGetSuite = defineSuite('peek-vs-get', {
	'peek() vs get() Read Cost': (bench) => {
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
	},
})

// ---------------------------------------------------------------------------
// 2. Read/write interleaving
// ---------------------------------------------------------------------------

const readWriteSuite = defineSuite('read-write', {
	'Read/Write Interleaving': (bench) => {
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
	},
})

// ---------------------------------------------------------------------------
// 3. Computed staleness / recomputation
// ---------------------------------------------------------------------------

const stalenessSuite = defineSuite('computed-staleness', {
	'Computed Staleness / Recomputation': (bench) => {
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

		// Expensive compute function (object creation)
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

		// Multiple reads of same stale computed
		const sMulti = state(uniqueKey('stale-multi'), { default: 0 })

		const cMulti = computed([sMulti], ([v]) => v + 1)

		let imr = 0

		bench.add('set + 3x computed.get() (recompute once?)', () => {
			sMulti.set(++imr)
			cMulti.get()
			cMulti.get()
			cMulti.get()
		})
	},
})

// ---------------------------------------------------------------------------
// 4. Promise property access
// ---------------------------------------------------------------------------

const promiseIdentitySuite = defineSuite('promise-identity', {
	'Promise Property Access': (bench) => {
		const src = state(uniqueKey('pi'), { default: 0 })

		const c = computed([src], ([v]) => v + 1)

		bench.add('computed.ready access (memory dep)', () => {
			c.ready
		})

		bench.add('computed.settled access (memory dep)', () => {
			c.settled
		})

		bench.add('computed.hydrated access (memory dep)', () => {
			c.hydrated
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Read Cost',
	[peekVsGetSuite, readWriteSuite, stalenessSuite, promiseIdentitySuite],
	'internal/read-cost',
).catch(console.error)
