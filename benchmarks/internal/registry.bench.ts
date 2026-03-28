import { snapshot, state } from '../../src/index.js'
import { getRegistry, scopedKey } from '../../src/registry.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ---------------------------------------------------------------------------
// 1. Registry lookup at scale
// ---------------------------------------------------------------------------

const registryLookupSuite = defineSuite('registry-lookup', {
	'Registry get() at Scale': (bench) => {
		const sizes = [100, 500, 1000] as const

		const pools: Record<number, ReturnType<typeof state<number>>[]> = {}

		for (const n of sizes) {
			pools[n] = Array.from({ length: n }, (_, i) => state(uniqueKey(`reg-${n}`), { default: i }))
		}

		const registry = getRegistry()

		for (const n of sizes) {
			const keys = pools[n].map((s) => scopedKey(s.key, s.scope))

			let idx = 0

			bench.add(`registry.get() with ${n} entries`, () => {
				registry.get(keys[idx++ % n])
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 2. Cache hit vs fresh creation
// ---------------------------------------------------------------------------

const cacheHitSuite = defineSuite('cache-hit', {
	'Instance Cache Hit vs Fresh Creation': (bench) => {
		const cachedKey = uniqueKey('cache-hit')

		state(cachedKey, { default: 0 })

		bench.add('state() cache hit (existing key)', () => {
			state(cachedKey, { default: 0 })
		})

		bench.add('state() fresh creation (new key)', () => {
			const s = state(uniqueKey('cache-miss'), { default: 0 })
			s.destroy()
		})
	},
	'Cache-Hit at Scale': (bench) => {
		const sizes = [100, 500, 1000] as const

		const pools: Record<number, ReturnType<typeof state<number>>[]> = {}

		for (const n of sizes) {
			pools[n] = Array.from({ length: n }, (_, i) => state(uniqueKey(`reg2-${n}`), { default: i }))
		}

		for (const n of sizes) {
			const keyList = pools[n].map((s) => s.key)

			let idx = 0

			bench.add(`state() cache-hit with ${n} entries`, () => {
				state(keyList[idx++ % n], { default: 0 })
			})
		}
	},
})

// ---------------------------------------------------------------------------
// 3. Snapshot (devtools) at scale
// ---------------------------------------------------------------------------

const snapshotSuite = defineSuite('snapshot', {
	'Snapshot (DevTools) at Scale': (bench) => {
		Array.from({ length: 10 }, (_, i) => state(uniqueKey('snap10'), { default: i }))

		bench.add('snapshot (10 instances)', () => {
			snapshot()
		})

		Array.from({ length: 100 }, (_, i) => state(uniqueKey('snap100'), { default: i }))

		bench.add('snapshot (110 instances)', () => {
			snapshot()
		})

		Array.from({ length: 500 }, (_, i) => state(uniqueKey('snap500'), { default: i }))

		bench.add('snapshot (610 instances)', () => {
			snapshot()
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: Registry & Snapshot',
	[registryLookupSuite, cacheHitSuite, snapshotSuite],
	'internal/registry',
).catch(console.error)
