import { proxy, snapshot as valtioSnapshot } from 'valtio/vanilla'
import { createStore as createZustandStore } from 'zustand/vanilla'
import { persist } from 'zustand/middleware'
import { state } from '../src/index.js'
import { defineSuite, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// Storage mock — shared Map so all libraries hit the same backend
// ---------------------------------------------------------------------------

function makeStorage(): Storage {
	const store = new Map<string, string>()

	return {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => {
			store.set(k, v)
		},
		removeItem: (k) => {
			store.delete(k)
		},
		clear: () => {
			store.clear()
		},
		get length() {
			return store.size
		},
		key: (i) => [...store.keys()][i] ?? null,
	}
}

// Install mock globally so gjendje's storage adapter picks it up
const mockStorage = makeStorage()

Object.defineProperty(globalThis, 'localStorage', {
	value: mockStorage,
	configurable: true,
})

Object.defineProperty(globalThis, 'window', {
	value: { addEventListener: () => {}, removeEventListener: () => {} },
	configurable: true,
	writable: true,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ObjectShape = Record<string, unknown>

function makeObject(keyCount: number): ObjectShape {
	const obj: ObjectShape = {}

	for (let i = 0; i < keyCount; i++) {
		obj[`field${i}`] = `value-${i}`
	}

	return obj
}

function makeZustandPersistStorage() {
	return {
		getItem: (name: string) => {
			const raw = mockStorage.getItem(name)

			return raw ? JSON.parse(raw) : null
		},
		setItem: (name: string, value: unknown) => {
			mockStorage.setItem(name, JSON.stringify(value))
		},
		removeItem: (name: string) => {
			mockStorage.removeItem(name)
		},
	}
}

// ---------------------------------------------------------------------------
// Benchmark: Cached read — primitive (repeated get, no writes between)
// ---------------------------------------------------------------------------

const primitiveSuite = defineSuite('primitive', {
	'Storage Read: Primitive': (bench) => {
		const gj = state(uniqueKey('stor-prim'), { default: 42, scope: 'local' })

		const zStore = createZustandStore(
			persist(() => ({ value: 42 }), {
				name: uniqueKey('z-stor-prim'),
				storage: makeZustandPersistStorage(),
			}),
		)

		const vp = proxy({ value: 42 })

		gj.get()
		zStore.getState()
		valtioSnapshot(vp)

		bench
			.add('gjendje (scope: local)', () => {
				gj.get()
			})
			.add('zustand (persist)', () => {
				zStore.getState()
			})
			.add('valtio (hydrated)', () => {
				valtioSnapshot(vp).value
			})
	},
})

// ---------------------------------------------------------------------------
// Benchmark: Cached read — small object (5 keys)
// ---------------------------------------------------------------------------

const smallSuite = defineSuite('small', {
	'Storage Read: Small Object (5 keys)': (bench) => {
		const small = makeObject(5)

		const gj = state(uniqueKey('stor-small'), { default: small, scope: 'local' })

		const zStore = createZustandStore(
			persist(() => ({ ...small }), {
				name: uniqueKey('z-stor-small'),
				storage: makeZustandPersistStorage(),
			}),
		)

		const vp = proxy({ ...small })

		gj.get()
		zStore.getState()
		valtioSnapshot(vp)

		bench
			.add('gjendje (scope: local)', () => {
				gj.get()
			})
			.add('zustand (persist)', () => {
				zStore.getState()
			})
			.add('valtio (hydrated)', () => {
				valtioSnapshot(vp)
			})
	},
})

// ---------------------------------------------------------------------------
// Benchmark: Cached read — large object (200 keys)
// ---------------------------------------------------------------------------

const largeSuite = defineSuite('large', {
	'Storage Read: Large Object (200 keys)': (bench) => {
		const large = makeObject(200)

		const gj = state(uniqueKey('stor-large'), { default: large, scope: 'local' })

		const zStore = createZustandStore(
			persist(() => ({ ...large }), {
				name: uniqueKey('z-stor-large'),
				storage: makeZustandPersistStorage(),
			}),
		)

		const vp = proxy({ ...large })

		gj.get()
		zStore.getState()
		valtioSnapshot(vp)

		bench
			.add('gjendje (scope: local)', () => {
				gj.get()
			})
			.add('zustand (persist)', () => {
				zStore.getState()
			})
			.add('valtio (hydrated)', () => {
				valtioSnapshot(vp)
			})
	},
})

// ---------------------------------------------------------------------------
// Benchmark: Read after write (cache invalidation + re-cache)
// ---------------------------------------------------------------------------

const readAfterWriteSuite = defineSuite('read-after-write', {
	'Storage Read After Write: Medium Object (20 keys)': (bench) => {
		const medium = makeObject(20)

		const gj = state(uniqueKey('stor-rw'), { default: medium, scope: 'local' })

		const zStore = createZustandStore(
			persist<ObjectShape>(() => ({ ...medium }), {
				name: uniqueKey('z-stor-rw'),
				storage: makeZustandPersistStorage(),
			}),
		)

		const vp = proxy<ObjectShape>({ ...medium })

		let i = 0

		bench
			.add('gjendje (scope: local)', () => {
				gj.set({ ...medium, field0: `updated-${++i}` })
				gj.get()
			})
			.add('zustand (persist)', () => {
				zStore.setState({ field0: `updated-${++i}` })
				zStore.getState()
			})
			.add('valtio (hydrated)', () => {
				vp.field0 = `updated-${++i}`
				valtioSnapshot(vp)
			})
	},
})

// ---------------------------------------------------------------------------
// Benchmark: Rapid reads between occasional writes
// ---------------------------------------------------------------------------

const manyReadsSuite = defineSuite('many-reads', {
	'100 Reads per 1 Write: Medium Object (20 keys)': (bench) => {
		const READS_PER_WRITE = 100

		const medium = makeObject(20)

		const gj = state(uniqueKey('stor-ratio'), { default: medium, scope: 'local' })

		const zStore = createZustandStore(
			persist<ObjectShape>(() => ({ ...medium }), {
				name: uniqueKey('z-stor-ratio'),
				storage: makeZustandPersistStorage(),
			}),
		)

		const vp = proxy<ObjectShape>({ ...medium })

		let i = 0

		bench
			.add(`gjendje (scope: local) — ${READS_PER_WRITE} reads per write`, () => {
				gj.set({ ...medium, field0: `v-${++i}` })

				for (let r = 0; r < READS_PER_WRITE; r++) {
					gj.get()
				}
			})
			.add(`zustand (persist) — ${READS_PER_WRITE} reads per write`, () => {
				zStore.setState({ field0: `v-${++i}` })

				for (let r = 0; r < READS_PER_WRITE; r++) {
					zStore.getState()
				}
			})
			.add(`valtio (hydrated) — ${READS_PER_WRITE} reads per write`, () => {
				vp.field0 = `v-${++i}`

				for (let r = 0; r < READS_PER_WRITE; r++) {
					valtioSnapshot(vp)
				}
			})
	},
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSuites(
	'Storage-Backed Read Benchmark: gjendje (local) vs Zustand (persist) vs Valtio',
	[primitiveSuite, smallSuite, largeSuite, readAfterWriteSuite, manyReadsSuite],
	'storage-read',
).catch(console.error)
