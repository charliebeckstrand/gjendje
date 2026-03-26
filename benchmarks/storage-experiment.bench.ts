/**
 * Storage Adapter Read Path — Optimization Experiment
 *
 * Investigates three potential breakthrough optimizations:
 *
 * 1. getItem + string-compare vs getItem + JSON.parse
 *    How expensive is the DOM API call itself? How much of the cost is
 *    the parse vs the getItem?
 *
 * 2. Shared storage event listener vs per-instance listeners
 *    With N storage-backed states, N listeners all fire on every cross-tab
 *    storage event and each filters by key. A single shared dispatcher
 *    could dispatch directly to the right handler in O(1) via a Map lookup.
 *
 * 3. Trust-the-cache fully vs current approach (always call getItem)
 *    Current: every get() calls storage.getItem(key) and compares strings.
 *    Aggressive: skip getItem entirely until a storage event invalidates the
 *    cache. This turns hot reads from a DOM API call + string compare into a
 *    pure property access.
 *
 * Run with:
 *   tsx benchmarks/storage-experiment.bench.ts
 */

import { Bench } from 'tinybench'
import { defineSuite, printResults, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// Environment mocks — must be set up before any gjendje imports that branch
// on `typeof window`
// ---------------------------------------------------------------------------

type StorageEventCallback = (event: StorageEvent) => void

/** Minimal EventTarget-like store for the shared-listener experiments. */
const mockWindowListeners: Map<string, Set<StorageEventCallback>> = new Map()

const mockWindow = {
	addEventListener(type: string, cb: StorageEventCallback) {
		let set = mockWindowListeners.get(type)

		if (!set) {
			set = new Set()
			mockWindowListeners.set(type, set)
		}

		set.add(cb)
	},
	removeEventListener(type: string, cb: StorageEventCallback) {
		mockWindowListeners.get(type)?.delete(cb)
	},
	get location() {
		return { search: '', pathname: '/', hash: '' }
	},
}

Object.defineProperty(globalThis, 'window', {
	value: mockWindow,
	configurable: true,
	writable: true,
})

// ---------------------------------------------------------------------------
// Storage mock — Map-backed, measures getItem call count
// ---------------------------------------------------------------------------

function makeStorage(label = 'storage') {
	const store = new Map<string, string>()

	let getItemCalls = 0

	const storage: Storage = {
		getItem(k) {
			getItemCalls++

			return store.get(k) ?? null
		},
		setItem(k, v) {
			store.set(k, v)
		},
		removeItem(k) {
			store.delete(k)
		},
		clear() {
			store.clear()
		},
		get length() {
			return store.size
		},
		key(i) {
			return [...store.keys()][i] ?? null
		},
	}

	return {
		storage,
		getCallCount: () => getItemCalls,
		resetCallCount: () => {
			getItemCalls = 0
		},
		label,
	}
}

const mockStorage = makeStorage('localStorage')

Object.defineProperty(globalThis, 'localStorage', {
	value: mockStorage.storage,
	configurable: true,
})

// ---------------------------------------------------------------------------
// Minimal adapter implementations (no gjendje dependency, so we can compare
// the read strategies in isolation without adapter overhead)
// ---------------------------------------------------------------------------

// --- Strategy A: Current approach — always call getItem, compare raw string ---

function createCurrentAdapter<T>(
	storage: Storage,
	key: string,
	defaultValue: T,
) {
	let cachedRaw: string | null | undefined
	let cachedValue: T | undefined

	function read(): T {
		const raw = storage.getItem(key)

		if (raw === null) {
			cachedRaw = null
			cachedValue = undefined
			return defaultValue
		}

		if (raw === cachedRaw) return cachedValue as T

		const value = JSON.parse(raw) as T

		cachedRaw = raw
		cachedValue = value

		return value
	}

	function write(value: T): void {
		const raw = JSON.stringify(value)

		storage.setItem(key, raw)
		cachedRaw = raw
		cachedValue = value
	}

	return { read, write }
}

// --- Strategy B: Trust-the-cache — skip getItem until a storage event fires ---
// The cache is only invalidated by an explicit invalidate() call (which the
// storage event listener would call). Between events, reads are pure property
// accesses with zero DOM interaction.

function createTrustCacheAdapter<T>(
	storage: Storage,
	key: string,
	defaultValue: T,
	onStorageChange: (invalidate: () => void) => void,
) {
	let cacheValid = false
	let cachedValue: T = defaultValue

	// Register with caller so external storage events can invalidate us
	onStorageChange(() => {
		cacheValid = false
	})

	function read(): T {
		if (cacheValid) return cachedValue

		const raw = storage.getItem(key)

		if (raw === null) {
			cachedValue = defaultValue
			cacheValid = true
			return defaultValue
		}

		cachedValue = JSON.parse(raw) as T
		cacheValid = true

		return cachedValue
	}

	function write(value: T): void {
		const raw = JSON.stringify(value)

		storage.setItem(key, raw)

		// Pre-populate — same as current adapter
		cachedValue = value
		cacheValid = true
	}

	return { read, write }
}

// --- Shared listener registry ---
// Instead of N `window.addEventListener('storage', ...)` calls, one shared
// listener dispatches to the right adapter via a Map<key, handler>.

type StorageHandler = (event: StorageEvent) => void

interface SharedListenerRegistry {
	register(storage: Storage, key: string, handler: StorageHandler): void
	unregister(storage: Storage, key: string): void
	listenerCount(): number
}

function createSharedListenerRegistry(): SharedListenerRegistry {
	// Key: `${storageType}:${key}` — unique per storage area + key combo
	const handlers = new Map<string, StorageHandler>()

	let registered = false

	function dispatch(event: StorageEvent) {
		if (event.key === null) return // storage.clear() — iterate all

		const storageType =
			event.storageArea === globalThis.localStorage ? 'local' : 'session'

		const mapKey = `${storageType}:${event.key}`

		const handler = handlers.get(mapKey)

		if (handler) handler(event)
	}

	function ensureRegistered() {
		if (!registered && typeof window !== 'undefined') {
			window.addEventListener('storage', dispatch as StorageEventCallback)
			registered = true
		}
	}

	return {
		register(storage, key, handler) {
			ensureRegistered()

			const storageType =
				storage === globalThis.localStorage ? 'local' : 'session'

			handlers.set(`${storageType}:${key}`, handler)
		},

		unregister(storage, key) {
			const storageType =
				storage === globalThis.localStorage ? 'local' : 'session'

			handlers.delete(`${storageType}:${key}`)
		},

		listenerCount() {
			return handlers.size
		},
	}
}

// Global shared registry (mimics what a real implementation would expose)
const sharedRegistry = createSharedListenerRegistry()

function createSharedListenerAdapter<T>(
	storage: Storage,
	key: string,
	defaultValue: T,
) {
	let cachedRaw: string | null | undefined
	let cachedValue: T | undefined

	sharedRegistry.register(storage, key, (_event) => {
		// Invalidate on cross-tab write
		cachedRaw = undefined
		cachedValue = undefined
	})

	function read(): T {
		const raw = storage.getItem(key)

		if (raw === null) {
			cachedRaw = null
			cachedValue = undefined
			return defaultValue
		}

		if (raw === cachedRaw) return cachedValue as T

		const value = JSON.parse(raw) as T

		cachedRaw = raw
		cachedValue = value

		return value
	}

	function write(value: T): void {
		const raw = JSON.stringify(value)

		storage.setItem(key, raw)
		cachedRaw = raw
		cachedValue = value
	}

	return { read, write }
}

// ---------------------------------------------------------------------------
// Simulate cross-tab storage event dispatch (for overhead measurement)
// ---------------------------------------------------------------------------

function fireStorageEvent(key: string, newValue: string | null) {
	const event = new (class {
		storageArea = mockStorage.storage
		key = key
		newValue = newValue
		oldValue = null
		url = 'http://localhost'
	})() as unknown as StorageEvent

	const listeners = mockWindowListeners.get('storage')

	if (listeners) {
		for (const cb of listeners) {
			cb(event)
		}
	}
}

// ---------------------------------------------------------------------------
// Suite 1: getItem + string-compare vs getItem + JSON.parse (cache miss cost)
// ---------------------------------------------------------------------------

const getItemCostSuite = defineSuite('getitem-cost', {
	'getItem: string-compare hit vs full parse miss': (bench) => {
		const store = makeStorage('test-getitem')

		Object.defineProperty(globalThis, 'localStorage', {
			value: store.storage,
			configurable: true,
		})

		const key = uniqueKey('gi-cost')
		const value = { count: 42, label: 'hello', active: true }
		const raw = JSON.stringify(value)

		store.storage.setItem(key, raw)

		const adapterCached = createCurrentAdapter(store.storage, key, value)
		const adapterUncached = createCurrentAdapter(store.storage, key, value)

		// Warm the cache on adapterCached so subsequent reads hit the fast path
		adapterCached.read()

		bench
			.add('getItem + string-compare (cache hit)', () => {
				adapterCached.read()
			})
			.add('getItem + JSON.parse (cache miss — raw changed)', () => {
				// Bypass the cache by mutating raw in storage between reads
				adapterUncached.read()
				// Force cache miss next iteration by clearing cached state
				;(adapterUncached as ReturnType<typeof createCurrentAdapter<typeof value>> & {
					_cachedRaw?: string
				})
				// Use write to update both storage AND invalidate via different value
				adapterUncached.write({ ...value, count: Math.random() })
			})
	},
})

// ---------------------------------------------------------------------------
// Suite 2: N per-instance storage listeners vs 1 shared dispatcher
//          Measures the overhead of receiving a storage event with N adapters
// ---------------------------------------------------------------------------

const listenerOverheadSuite = defineSuite('listener-overhead', {
	'Storage event dispatch: N per-instance listeners vs 1 shared': (bench) => {
		const ADAPTER_COUNTS = [1, 10, 50, 100]

		for (const n of ADAPTER_COUNTS) {
			// --- Per-instance approach (current) ---
			// Each adapter registers its own window listener that checks key match
			const perInstanceAdapters: Array<ReturnType<typeof createCurrentAdapter<number>>> = []
			const perInstanceListeners: StorageEventCallback[] = []

			for (let i = 0; i < n; i++) {
				const k = `per-instance-key-${i}`
				const adapter = createCurrentAdapter(mockStorage.storage, k, i)

				perInstanceAdapters.push(adapter)

				// Mimic what createStorageAdapter does: register a listener per adapter
				const onEvent: StorageEventCallback = (event) => {
					if (event.storageArea !== mockStorage.storage || event.key !== k) return
					// Invalidate + re-read (simplified)
					adapter.read()
				}

				perInstanceListeners.push(onEvent)
				window.addEventListener('storage', onEvent as StorageEventCallback)
			}

			// --- Shared dispatcher approach ---
			const sharedAdapters: Array<ReturnType<typeof createSharedListenerAdapter<number>>> = []

			for (let i = 0; i < n; i++) {
				const k = `shared-key-${i}`
				const adapter = createSharedListenerAdapter(mockStorage.storage, k, i)

				sharedAdapters.push(adapter)
			}

			// Fire an event for key 0 (all per-instance listeners must check their key)
			bench
				.add(`${n} adapters: per-instance listeners (event for key-0)`, () => {
					fireStorageEvent('per-instance-key-0', '42')
				})
				.add(`${n} adapters: shared dispatcher (event for key-0)`, () => {
					fireStorageEvent('shared-key-0', '42')
				})

			// Cleanup per-instance listeners
			for (const cb of perInstanceListeners) {
				window.removeEventListener('storage', cb as StorageEventCallback)
			}
		}
	},
})

// ---------------------------------------------------------------------------
// Suite 3: Trust-the-cache (zero getItem on hot reads) vs current approach
// ---------------------------------------------------------------------------

const trustCacheSuite = defineSuite('trust-cache', {
	'Hot read path: trust-cache vs current (getItem every time)': (bench) => {
		const store = makeStorage('trust-cache-test')

		Object.defineProperty(globalThis, 'localStorage', {
			value: store.storage,
			configurable: true,
		})

		const key = uniqueKey('trust')
		const defaultValue = { count: 0, label: 'bench' }
		const value = { count: 42, label: 'hello' }
		const raw = JSON.stringify(value)

		store.storage.setItem(key, raw)

		// Current approach
		const current = createCurrentAdapter(store.storage, key, defaultValue)

		current.read() // warm cache

		// Trust-cache approach
		let trustInvalidate: (() => void) | undefined

		const trusted = createTrustCacheAdapter(
			store.storage,
			key,
			defaultValue,
			(invalidate) => {
				trustInvalidate = invalidate
			},
		)

		trusted.read() // warm cache

		bench
			.add('current: getItem + string-compare every read', () => {
				current.read()
			})
			.add('trust-cache: pure property access (no getItem)', () => {
				trusted.read()
			})

		// Suppress unused variable lint warning
		void trustInvalidate
	},

	'Hot read path: 100 reads after 1 write': (bench) => {
		const store = makeStorage('trust-cache-write-test')

		Object.defineProperty(globalThis, 'localStorage', {
			value: store.storage,
			configurable: true,
		})

		const key = uniqueKey('trust-w')
		const defaultValue = { count: 0, label: 'bench' }

		let counter = 0

		const current = createCurrentAdapter(store.storage, key, defaultValue)

		let trustInvalidate: (() => void) | undefined

		const trusted = createTrustCacheAdapter(
			store.storage,
			key,
			defaultValue,
			(invalidate) => {
				trustInvalidate = invalidate
			},
		)

		bench
			.add('current: write + 100 reads', () => {
				current.write({ count: counter++, label: 'hello' })

				for (let i = 0; i < 100; i++) {
					current.read()
				}
			})
			.add('trust-cache: write + 100 reads', () => {
				trusted.write({ count: counter++, label: 'hello' })

				for (let i = 0; i < 100; i++) {
					trusted.read()
				}
			})

		// Suppress unused variable lint warning
		void trustInvalidate
	},
})

// ---------------------------------------------------------------------------
// Suite 4: Raw getItem call cost (isolate DOM API overhead)
// ---------------------------------------------------------------------------

const rawGetItemSuite = defineSuite('raw-getitem', {
	'Isolated getItem cost: Map-backed vs plain object vs direct property': (bench) => {
		// Map-backed (same as current benchmark storage mock)
		const mapStore = new Map<string, string>()
		const mapKey = 'bench-key'
		const mapValue = '{"count":42}'

		mapStore.set(mapKey, mapValue)

		const mapStorage: Pick<Storage, 'getItem'> = {
			getItem: (k) => mapStore.get(k) ?? null,
		}

		// Plain object storage
		const objStore: Record<string, string> = { [mapKey]: mapValue }

		const objStorage: Pick<Storage, 'getItem'> = {
			getItem: (k) => objStore[k] ?? null,
		}

		// Cached value — pure property access baseline
		let cachedVal = mapValue

		bench
			.add('getItem (Map-backed)', () => {
				mapStorage.getItem(mapKey)
			})
			.add('getItem (plain object)', () => {
				objStorage.getItem(mapKey)
			})
			.add('property access (no getItem)', () => {
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				cachedVal
			})
			.add('getItem + string-compare', () => {
				const raw = mapStorage.getItem(mapKey)

				if (raw === cachedVal) return cachedVal
				cachedVal = raw ?? ''
				return raw
			})
			.add('getItem + JSON.parse', () => {
				const raw = mapStorage.getItem(mapKey)

				if (raw === null) return null
				return JSON.parse(raw)
			})
	},
})

// ---------------------------------------------------------------------------
// Suite 5: Listener count scaling — how does per-instance overhead grow with N?
// ---------------------------------------------------------------------------

const listenerScalingSuite = defineSuite('listener-scaling', {
	'Listener scaling: event dispatch cost vs N registered adapters': (bench) => {
		// Clean slate
		mockWindowListeners.clear()

		const SCALES = [10, 50, 100, 500]

		for (const n of SCALES) {
			// Register N per-instance listeners
			const listeners: StorageEventCallback[] = []

			for (let i = 0; i < n; i++) {
				const k = `scale-key-${i}`
				const onEvent: StorageEventCallback = (event) => {
					// Each listener does what the real adapter does: check storageArea + key
					if (event.storageArea !== mockStorage.storage || event.key !== k) return
				}

				listeners.push(onEvent)
				window.addEventListener('storage', onEvent as StorageEventCallback)
			}

			bench.add(`per-instance: dispatch to ${n} listeners`, () => {
				// Fire for a key that matches none (worst case — all listeners run their check)
				fireStorageEvent('__nomatch__', 'x')
			})

			// Cleanup
			for (const cb of listeners) {
				window.removeEventListener('storage', cb as StorageEventCallback)
			}
		}

		// Shared dispatcher at the same scales
		const sharedBigRegistry = createSharedListenerRegistry()

		for (const n of SCALES) {
			for (let i = 0; i < n; i++) {
				sharedBigRegistry.register(mockStorage.storage, `shared-scale-key-${i}`, (_e) => {})
			}

			bench.add(`shared-dispatcher: dispatch to ${n} handlers`, () => {
				fireStorageEvent('__nomatch__', 'x')
			})
		}
	},
})

// ---------------------------------------------------------------------------
// Run all suites
// ---------------------------------------------------------------------------

runSuites(
	'Storage Adapter Read Path — Optimization Experiments',
	[
		rawGetItemSuite,
		getItemCostSuite,
		trustCacheSuite,
		listenerOverheadSuite,
		listenerScalingSuite,
	],
	'storage-experiment',
).catch(console.error)
