import { computed, readonly, select, snapshot, state } from '../src/index.js'
import { readAndMigrate, wrapForStorage } from '../src/persist.js'
import { getRegistry, scopedKey } from '../src/registry.js'
import { defineSuite, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// 1. select() vs computed() — single-dependency projection
// ---------------------------------------------------------------------------

const selectVsComputedSuite = defineSuite('select-vs-computed', {
	'select vs computed: Creation Cost': (bench) => {
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
	},
	'select vs computed: Read Throughput': (bench) => {
		const readSrc = state(uniqueKey('sel-read'), { default: { name: 'Jane', age: 30 } })

		const sel = select(readSrc, (u) => u.name)

		const comp = computed([readSrc], ([u]) => u.name)

		bench.add('select.get() (cached)', () => {
			sel.get()
		})

		bench.add('computed.get() (cached, 1 dep)', () => {
			comp.get()
		})
	},
	'select vs computed: Write-then-Read': (bench) => {
		const writeSrc = state(uniqueKey('sel-wr'), { default: { name: 'Jane', age: 0 } })

		const selW = select(writeSrc, (u) => u.age)

		const compW = computed([writeSrc], ([u]) => u.age)

		let i1 = 0

		bench.add('select: set source + get', () => {
			writeSrc.set({ name: 'Jane', age: ++i1 })
			selW.get()
		})

		let i2 = 0

		bench.add('computed: set source + get (1 dep)', () => {
			writeSrc.set({ name: 'Jane', age: ++i2 })
			compW.get()
		})
	},
	'select vs computed: Notification Path': (bench) => {
		const subSrc = state(uniqueKey('sel-sub'), { default: 0 })

		const selS = select(subSrc, (v) => v * 2)

		const compS = computed([subSrc], ([v]) => v * 2)

		selS.subscribe(() => {})
		compS.subscribe(() => {})

		let i3 = 0

		bench.add('select: write + notify', () => {
			subSrc.set(++i3)
		})

		let i4 = 0

		bench.add('computed: write + notify (1 dep)', () => {
			subSrc.set(++i4)
		})
	},
})

// ---------------------------------------------------------------------------
// 2. readonly() overhead — read through a readonly wrapper vs direct access
// ---------------------------------------------------------------------------

const readonlyOverheadSuite = defineSuite('readonly-overhead', {
	'readonly: Read Overhead': (bench) => {
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
	},
	'readonly: Subscribe Overhead': (bench) => {
		const src = state(uniqueKey('ro-sub'), { default: { x: 1, y: 2 } })

		const ro = readonly(src)

		bench.add('subscribe via direct state', () => {
			const unsub = src.subscribe(() => {})

			unsub()
		})

		bench.add('subscribe via readonly(state)', () => {
			const unsub = ro.subscribe(() => {})

			unsub()
		})
	},
	'readonly: Wrapper Creation': (bench) => {
		const src = state(uniqueKey('ro-wrap'), { default: { x: 1, y: 2 } })

		bench.add('readonly() wrapper creation', () => {
			readonly(src)
		})
	},
})

// ---------------------------------------------------------------------------
// 3. Registry lookup at scale
// ---------------------------------------------------------------------------

const registryLookupSuite = defineSuite('registry-lookup', {
	'Registry: get() at Scale': (bench) => {
		const sizes = [100, 500, 1000] as const

		const pools: Record<number, ReturnType<typeof state<number>>[]> = {}

		for (const n of sizes) {
			pools[n] = Array.from({ length: n }, (_, i) =>
				state(uniqueKey(`reg-${n}`), { default: i }),
			)
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
	'Registry: Cache-Hit at Scale': (bench) => {
		const sizes = [100, 500, 1000] as const

		const pools: Record<number, ReturnType<typeof state<number>>[]> = {}

		for (const n of sizes) {
			pools[n] = Array.from({ length: n }, (_, i) =>
				state(uniqueKey(`reg2-${n}`), { default: i }),
			)
		}

		for (const n of sizes) {
			const keyList = pools[n].map((s) => s.key)

			let idx = 0

			bench.add(`state() cache-hit with ${n} entries`, () => {
				state(keyList[idx++ % n], { default: 0 })
			})
		}
	},
	'Registry: Snapshot at Scale': (bench) => {
		// Registry already has entries from previous sections
		bench.add('snapshot() at current registry size', () => {
			snapshot()
		})
	},
})

// ---------------------------------------------------------------------------
// 4. Persistence round-trip
// ---------------------------------------------------------------------------

const persistRoundTripSuite = defineSuite('persist-round-trip', {
	'Persist: wrapForStorage': (bench) => {
		const small = { theme: 'dark' }

		const medium = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, i]))

		const large = Object.fromEntries(
			Array.from({ length: 200 }, (_, i) => [`key${i}`, `value-${i}`]),
		)

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
	},
	'Persist: readAndMigrate (no migration)': (bench) => {
		const small = { theme: 'dark' }

		const medium = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, i]))

		const large = Object.fromEntries(
			Array.from({ length: 200 }, (_, i) => [`key${i}`, `value-${i}`]),
		)

		const rawSmall = JSON.stringify(small)

		const rawMedium = JSON.stringify(medium)

		const rawLarge = JSON.stringify(large)

		bench.add('readAndMigrate: small (no migration)', () => {
			readAndMigrate(rawSmall, { default: small })
		})

		bench.add('readAndMigrate: medium (no migration)', () => {
			readAndMigrate(rawMedium, { default: medium })
		})

		bench.add('readAndMigrate: large (no migration)', () => {
			readAndMigrate(rawLarge, { default: large })
		})
	},
	'Persist: readAndMigrate (with migration)': (bench) => {
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

		bench.add('readAndMigrate: 3-step migration', () => {
			readAndMigrate(v1Envelope, {
				default: { name: '', age: 0, email: '' },
				version: 4,
				migrate: migrations,
			})
		})

		const v2Envelope = JSON.stringify({ v: 2, data: { name: 'alice', age: 25 } })

		bench.add('readAndMigrate: 2-step migration', () => {
			readAndMigrate(v2Envelope, {
				default: { name: '', age: 0, email: '' },
				version: 4,
				migrate: migrations,
			})
		})

		const v3Envelope = JSON.stringify({
			v: 3,
			data: { name: 'alice', age: 25, email: 'a@b.c' },
		})

		bench.add('readAndMigrate: 1-step migration', () => {
			readAndMigrate(v3Envelope, {
				default: { name: '', age: 0, email: '' },
				version: 4,
				migrate: migrations,
			})
		})
	},
	'Persist: readAndMigrate (with validation)': (bench) => {
		const validRaw = JSON.stringify({ theme: 'dark', fontSize: 14 })

		bench.add('readAndMigrate: no validate', () => {
			readAndMigrate(validRaw, { default: { theme: 'light', fontSize: 12 } })
		})

		const isThemeConfig = (v: unknown): v is { theme: string; fontSize: number } =>
			typeof v === 'object' && v !== null && 'theme' in v

		bench.add('readAndMigrate: with validate (pass)', () => {
			readAndMigrate(validRaw, {
				default: { theme: 'light', fontSize: 12 },
				validate: isThemeConfig,
			})
		})

		bench.add('readAndMigrate: with validate (fail → default)', () => {
			readAndMigrate(JSON.stringify('invalid'), {
				default: { theme: 'light', fontSize: 12 },
				validate: isThemeConfig,
			})
		})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Internal Extended Benchmarks',
	[selectVsComputedSuite, readonlyOverheadSuite, registryLookupSuite, persistRoundTripSuite],
	'internals-extended',
)
