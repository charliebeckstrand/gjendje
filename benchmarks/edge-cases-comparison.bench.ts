import { proxy, snapshot as valtioSnapshot, subscribe as valtioSubscribe } from 'valtio/vanilla'
import { subscribeKey as valtioSubscribeKey } from 'valtio/vanilla/utils'
import { createStore as createZustandStore } from 'zustand/vanilla'
import { shallow as zustandShallow } from 'zustand/vanilla/shallow'
import {
	batch,
	computed,
	effect,
	shallowEqual,
	state,
	withWatch,
} from '../src/index.js'
import { defineSuite, runSuites, uniqueKey } from './helpers.js'

// ---------------------------------------------------------------------------
// 1. Computed / derived diamond dependency
//    src → [mid1, mid2] → final
// ---------------------------------------------------------------------------

const diamond = defineSuite('diamond', {
	'Computed Diamond Dependency': (bench) => {
		// --- gjendje ---
		const gjSrc = state(uniqueKey('diamond'), { default: 0 })
		
		const gjMid1 = computed([gjSrc], ([v]) => v * 2)
		const gjMid2 = computed([gjSrc], ([v]) => v + 10)
		const gjFinal = computed([gjMid1, gjMid2], ([a, b]) => a + b)

		gjFinal.subscribe(() => {})

		let igj = 0

		bench.add('gjendje (diamond)', () => {
			gjSrc.set(++igj)
			gjFinal.get()
		})

		// --- zustand --- (manual derived state)
		const zSrc = createZustandStore<{ value: number }>(() => ({ value: 0 }))
		const zMid1 = createZustandStore<{ value: number }>(() => ({ value: 0 }))
		const zMid2 = createZustandStore<{ value: number }>(() => ({ value: 0 }))

		let zFinalValue = 0

		zSrc.subscribe((s) => {
			zMid1.setState({ value: s.value * 2 })
			zMid2.setState({ value: s.value + 10 })
		})

		zMid1.subscribe(() => {
			zFinalValue = zMid1.getState().value + zMid2.getState().value
		})

		zMid2.subscribe(() => {
			zFinalValue = zMid1.getState().value + zMid2.getState().value
		})

		let iz = 0

		bench.add('zustand (diamond, manual)', () => {
			zSrc.setState({ value: ++iz })
			
			void zFinalValue
		})

		// --- valtio --- (proxy-based derived)
		const vpSrc = proxy({ value: 0 })
		const vpDerived = proxy({ mid1: 0, mid2: 0, final: 0 })

		valtioSubscribe(vpSrc, () => {
			const snap = valtioSnapshot(vpSrc)

			vpDerived.mid1 = snap.value * 2
			vpDerived.mid2 = snap.value + 10
			vpDerived.final = vpDerived.mid1 + vpDerived.mid2
		})

		valtioSubscribe(vpDerived, () => {})

		let iv = 0

		bench.add('valtio (diamond, proxy)', () => {
			vpSrc.value = ++iv
			valtioSnapshot(vpDerived).final
		})
	},
})

// ---------------------------------------------------------------------------
// 2. peek() vs get() — read cost comparison
// ---------------------------------------------------------------------------

const readCost = defineSuite('read-cost', {
	'Read Cost': (bench) => {
		// --- gjendje ---
		const gjS = state(uniqueKey('read'), { default: 42 })

		bench.add('gjendje state.get()', () => {
			gjS.get()
		})

		bench.add('gjendje state.peek()', () => {
			gjS.peek()
		})

		// --- zustand ---
		const zS = createZustandStore(() => ({ value: 42 }))

		bench.add('zustand getState()', () => {
			zS.getState()
		})

		// --- valtio ---
		const vpS = proxy({ value: 42 })

		bench.add('valtio snapshot read', () => {
			valtioSnapshot(vpS).value
		})
	},
})

// ---------------------------------------------------------------------------
// 3. Per-key watch — watching a single property for changes
// ---------------------------------------------------------------------------

const perKeyWatch = defineSuite('per-key-watch', {
	'Per-Key Watch': (bench) => {
		type Obj = { a: number; b: number; c: number; d: number; e: number }

		const defaultObj: Obj = { a: 0, b: 0, c: 0, d: 0, e: 0 }

		// --- gjendje (native watch) ---
		const gjW = state(uniqueKey('watch'), { default: { ...defaultObj } })

		gjW.watch('a', () => {})

		let igw = 0

		bench.add('gjendje state.watch("a")', () => {
			gjW.set({ ...defaultObj, a: ++igw })
		})

		// --- gjendje (withWatch enhancer) ---
		const gjWE = withWatch(state(uniqueKey('watch-e'), { default: { ...defaultObj } }))

		gjWE.watch('a', () => {})

		let igwe = 0

		bench.add('gjendje withWatch("a")', () => {
			gjWE.set({ ...defaultObj, a: ++igwe })
		})

		// --- valtio (subscribeKey) ---
		const vpW = proxy({ ...defaultObj })

		valtioSubscribeKey(vpW, 'a', () => {})

		let ivw = 0

		bench.add('valtio subscribeKey("a")', () => {
			vpW.a = ++ivw
		})

		// --- zustand (subscribe with selector) ---
		const zW = createZustandStore<Obj>(() => ({ ...defaultObj }))

		// Zustand vanilla doesn't have subscribeKey, use subscribe + manual filter
		let lastZA = 0

		zW.subscribe((s) => {
			if (s.a !== lastZA) {
				lastZA = s.a
				// listener fires
			}
		})

		let izw = 0

		bench.add('zustand subscribe + manual filter', () => {
			zW.setState({ a: ++izw })
		})
	},
})

// ---------------------------------------------------------------------------
// 4. Per-key watch on 5 keys simultaneously
// ---------------------------------------------------------------------------

const multiKeyWatch = defineSuite('multi-key-watch', {
	'Multi-Key Watch (5 keys)': (bench) => {
		type Obj = { a: number; b: number; c: number; d: number; e: number }

		const defaultObj: Obj = { a: 0, b: 0, c: 0, d: 0, e: 0 }

		// --- gjendje ---
		const gj5 = state(uniqueKey('watch5'), { default: { ...defaultObj } })

		gj5.watch('a', () => {})
		gj5.watch('b', () => {})
		gj5.watch('c', () => {})
		gj5.watch('d', () => {})
		gj5.watch('e', () => {})

		let igj5 = 0

		bench.add('gjendje watch (5 keys)', () => {
			gj5.set({ a: ++igj5, b: igj5, c: igj5, d: igj5, e: igj5 })
		})

		// --- valtio ---
		const vp5 = proxy({ ...defaultObj })

		valtioSubscribeKey(vp5, 'a', () => {})
		valtioSubscribeKey(vp5, 'b', () => {})
		valtioSubscribeKey(vp5, 'c', () => {})
		valtioSubscribeKey(vp5, 'd', () => {})
		valtioSubscribeKey(vp5, 'e', () => {})

		let iv5 = 0

		bench.add('valtio subscribeKey (5 keys)', () => {
			iv5++
			vp5.a = iv5
			vp5.b = iv5
			vp5.c = iv5
			vp5.d = iv5
			vp5.e = iv5
		})

		// --- zustand ---
		const z5 = createZustandStore<Obj>(() => ({ ...defaultObj }))

		const lastZ: Obj = { ...defaultObj }

		// 5 separate subscriptions, each filtering a key
		for (const key of ['a', 'b', 'c', 'd', 'e'] as const) {
			z5.subscribe((s) => {
				if (s[key] !== lastZ[key]) {
					lastZ[key] = s[key]
				}
			})
		}

		let iz5 = 0

		bench.add('zustand 5 subs + manual filter', () => {
			iz5++
			z5.setState({ a: iz5, b: iz5, c: iz5, d: iz5, e: iz5 })
		})
	},
})

// ---------------------------------------------------------------------------
// 5. Effect lifecycle — create + stop (mount/unmount)
// ---------------------------------------------------------------------------

const effectLifecycle = defineSuite('effect-lifecycle', {
	'Effect / Subscribe Lifecycle (Create + Teardown)': (bench) => {
		// --- gjendje ---
		const gjSrc = state(uniqueKey('eff-lc'), { default: 0 })

		bench.add('gjendje effect create + stop', () => {
			const handle = effect([gjSrc], () => undefined)

			handle.stop()
		})

		// --- zustand --- (subscribe/unsubscribe cycle)
		const zSrc = createZustandStore(() => ({ value: 0 }))

		bench.add('zustand subscribe + unsubscribe', () => {
			const unsub = zSrc.subscribe(() => {})

			unsub()
		})

		// --- valtio ---
		const vpSrc = proxy({ value: 0 })

		bench.add('valtio subscribe + unsubscribe', () => {
			const unsub = valtioSubscribe(vpSrc, () => {})

			unsub()
		})
	},
})

// ---------------------------------------------------------------------------
// 6. Batch writes — N state changes, 1 notification
// ---------------------------------------------------------------------------

const batchWrites = defineSuite('batch-writes', {
	'Batch / Multi-Key Writes (20 values)': (bench) => {
		const UPDATE_COUNT = 20

		// --- gjendje ---
		const gjItems = Array.from({ length: UPDATE_COUNT }, (_, i) =>
			state(uniqueKey(`batch-${i}`), { default: i }),
		)

		for (const item of gjItems) {
			item.subscribe(() => {})
		}

		let igj = 0

		bench.add('gjendje batch(20)', () => {
			igj++

			batch(() => {
				for (let i = 0; i < UPDATE_COUNT; i++) {
					gjItems[i]?.set(igj + i)
				}
			})
		})

		// gjendje unbatched (for comparison)
		const gjItems2 = Array.from({ length: UPDATE_COUNT }, (_, i) =>
			state(uniqueKey(`unbatch-${i}`), { default: i }),
		)

		for (const item of gjItems2) {
			item.subscribe(() => {})
		}

		let igj2 = 0

		bench.add('gjendje unbatched(20)', () => {
			igj2++

			for (let i = 0; i < UPDATE_COUNT; i++) {
				gjItems2[i]?.set(igj2 + i)
			}
		})

		// --- zustand --- (single store with 20 keys)
		const zInit: Record<string, number> = {}

		for (let i = 0; i < UPDATE_COUNT; i++) {
			zInit[`k${i}`] = i
		}

		const zStore = createZustandStore<Record<string, number>>(() => zInit)

		zStore.subscribe(() => {})

		let iz = 0

		bench.add('zustand setState(20 keys)', () => {
			iz++
			const partial: Record<string, number> = {}

			for (let i = 0; i < UPDATE_COUNT; i++) {
				partial[`k${i}`] = iz + i
			}

			zStore.setState(partial)
		})

		// --- valtio --- (single proxy with 20 keys)
		const vpState: Record<string, number> = {}

		for (let i = 0; i < UPDATE_COUNT; i++) {
			vpState[`k${i}`] = i
		}

		const vp = proxy(vpState)

		valtioSubscribe(vp, () => {}, true)

		let iv = 0

		bench.add('valtio direct mutation(20 keys)', () => {
			iv++

			for (let i = 0; i < UPDATE_COUNT; i++) {
				vp[`k${i}`] = iv + i
			}
		})
	},
})

// ---------------------------------------------------------------------------
// 7. Batch with derived/computed consumer
// ---------------------------------------------------------------------------

const batchDerived = defineSuite('batch-derived', {
	'Batch with Derived State (5 sources → 1 derived)': (bench) => {
		const SRC_COUNT = 5

		// --- gjendje ---
		const gjSrcs = Array.from({ length: SRC_COUNT }, (_, i) =>
			state(uniqueKey(`bcomp-${i}`), { default: i }),
		)
		const gjComp = computed(gjSrcs, (vals: number[]) => vals.reduce((a, b) => a + b, 0))

		gjComp.subscribe(() => {})

		let igj = 0

		bench.add('gjendje batch 5 srcs → computed', () => {
			igj++

			batch(() => {
				for (const s of gjSrcs) s.set(igj)
			})
		})

		// --- zustand ---
		const zSrcs = Array.from({ length: SRC_COUNT }, (_, i) =>
			createZustandStore<{ value: number }>(() => ({ value: i })),
		)

		let zDerived = 0

		for (const src of zSrcs) {
			src.subscribe(() => {
				zDerived = zSrcs.reduce((sum, s) => sum + s.getState().value, 0)
			})
		}

		let iz = 0

		bench.add('zustand 5 stores → manual derived', () => {
			iz++

			for (const s of zSrcs) {
				s.setState({ value: iz })
			}
		})

		// --- valtio ---
		const vpSrcs = proxy({ values: Array.from({ length: SRC_COUNT }, (_, i) => i) })
		
		let vpDerived = 0

		valtioSubscribe(vpSrcs, () => {
			const snap = valtioSnapshot(vpSrcs)

			vpDerived = snap.values.reduce((a, b) => a + b, 0)
		})

		let iv = 0

		bench.add('valtio proxy array → manual derived', () => {
			iv++

			for (let i = 0; i < SRC_COUNT; i++) {
				vpSrcs.values[i] = iv
			}
		})
	},
})

// ---------------------------------------------------------------------------
// 8. Read/write interleaving
// ---------------------------------------------------------------------------

const readWrite = defineSuite('read-write', {
	'Read/Write Interleaving': (bench) => {
		// --- gjendje ---
		const gjS = state(uniqueKey('rw'), { default: 0 })

		gjS.subscribe(() => {})

		let igj = 0

		bench.add('gjendje set + get', () => {
			gjS.set(++igj)
			gjS.get()
		})

		// --- zustand ---
		const zS = createZustandStore<{ value: number }>(() => ({ value: 0 }))

		zS.subscribe(() => {})

		let iz = 0

		bench.add('zustand setState + getState', () => {
			zS.setState({ value: ++iz })
			zS.getState()
		})

		// --- valtio ---
		const vpS = proxy({ value: 0 })

		valtioSubscribe(vpS, () => {}, true)

		let iv = 0

		bench.add('valtio mutate + snapshot', () => {
			vpS.value = ++iv

			valtioSnapshot(vpS).value
		})
	},
})

// ---------------------------------------------------------------------------
// 9. Large object state — write + notify with many keys
// ---------------------------------------------------------------------------

const largeObject = defineSuite('large-object', {
	'Large Object Write (50 keys)': (bench) => {
		// 50-key objects
		const obj50: Record<string, number> = {}

		for (let i = 0; i < 50; i++) obj50[`k${i}`] = i

		// --- gjendje ---
		const gjLg = state(uniqueKey('lg'), { default: obj50 })

		gjLg.subscribe(() => {})

		let igj = 0

		bench.add('gjendje (50-key object write)', () => {
			gjLg.set({ ...obj50, k0: ++igj })
		})

		// --- zustand ---
		const zLg = createZustandStore<Record<string, number>>(() => ({ ...obj50 }))

		zLg.subscribe(() => {})

		let iz = 0

		bench.add('zustand (50-key object write)', () => {
			zLg.setState({ ...obj50, k0: ++iz })
		})

		// --- valtio ---
		const vpLg = proxy({ ...obj50 })

		valtioSubscribe(vpLg, () => {}, true)

		let iv = 0

		bench.add('valtio (50-key, mutate 1 key)', () => {
			vpLg.k0 = ++iv
		})
	},
})

// ---------------------------------------------------------------------------
// 10. Shallow equality comparison
// ---------------------------------------------------------------------------

const shallowEqual_ = defineSuite('shallow-equal', {
	'Shallow Equality Comparison': (bench) => {
		// 3-key objects (equal)
		const smallA = { a: 1, b: 2, c: 3 }
		const smallB = { a: 1, b: 2, c: 3 }

		bench.add('gjendje shallowEqual (3 keys)', () => {
			shallowEqual(smallA, smallB)
		})

		bench.add('zustand shallow (3 keys)', () => {
			zustandShallow(smallA, smallB)
		})

		// 50-key objects (equal)
		const medA: Record<string, number> = {}
		const medB: Record<string, number> = {}

		for (let i = 0; i < 50; i++) {
			medA[`k${i}`] = i
			medB[`k${i}`] = i
		}

		bench.add('gjendje shallowEqual (50 keys)', () => {
			shallowEqual(medA, medB)
		})

		bench.add('zustand shallow (50 keys)', () => {
			zustandShallow(medA, medB)
		})
	},
})

// ---------------------------------------------------------------------------
// 11. Subscribe/unsubscribe churn
// ---------------------------------------------------------------------------

const subscribeChurn = defineSuite('subscribe-churn', {
	'Subscribe/Unsubscribe Churn': (bench) => {
		// --- gjendje ---
		const gjS = state(uniqueKey('churn'), { default: 0 })

		bench.add('gjendje sub + unsub', () => {
			const unsub = gjS.subscribe(() => {})

			unsub()
		})

		// --- zustand ---
		const zS = createZustandStore(() => ({ value: 0 }))

		bench.add('zustand sub + unsub', () => {
			const unsub = zS.subscribe(() => {})

			unsub()
		})

		// --- valtio ---
		const vpS = proxy({ value: 0 })

		bench.add('valtio sub + unsub', () => {
			const unsub = valtioSubscribe(vpS, () => {})

			unsub()
		})

		// Rapid accumulation: 100 listeners then teardown
		bench.add('gjendje 100 subs + teardown', () => {
			const unsubs: (() => void)[] = []

			for (let i = 0; i < 100; i++) {
				unsubs.push(gjS.subscribe(() => {}))
			}

			for (const unsub of unsubs) {
				unsub()
			}
		})

		bench.add('zustand 100 subs + teardown', () => {
			const unsubs: (() => void)[] = []

			for (let i = 0; i < 100; i++) {
				unsubs.push(zS.subscribe(() => {}))
			}

			for (const unsub of unsubs) {
				unsub()
			}
		})

		bench.add('valtio 100 subs + teardown', () => {
			const unsubs: (() => void)[] = []

			for (let i = 0; i < 100; i++) {
				unsubs.push(valtioSubscribe(vpS, () => {}))
			}

			for (const unsub of unsubs) {
				unsub()
			}
		})
	},
})

// ---------------------------------------------------------------------------
// 12. Instance/store creation cost
// ---------------------------------------------------------------------------

const creation = defineSuite('creation', {
	'Store / Instance Creation': (bench) => {
		bench.add('gjendje state() + destroy()', () => {
			const s = state(uniqueKey('create'), { default: 0 })
			s.destroy()
		})

		bench.add('zustand createStore()', () => {
			createZustandStore(() => ({ value: 0 }))
		})

		bench.add('valtio proxy()', () => {
			proxy({ value: 0 })
		})
	},
})

// ---------------------------------------------------------------------------
// 13. Many listeners — write throughput with 100 listeners
// ---------------------------------------------------------------------------

const manyListeners = defineSuite('many-listeners', {
	'Write Throughput (100 listeners)': (bench) => {
		const LISTENER_COUNT = 100

		// --- gjendje ---
		const gjS = state(uniqueKey('many'), { default: 0 })

		for (let i = 0; i < LISTENER_COUNT; i++) {
			gjS.subscribe(() => {})
		}

		let igj = 0

		bench.add(`gjendje write (${LISTENER_COUNT} listeners)`, () => {
			gjS.set(++igj)
		})

		// --- zustand ---
		const zS = createZustandStore<{ value: number }>(() => ({ value: 0 }))

		for (let i = 0; i < LISTENER_COUNT; i++) {
			zS.subscribe(() => {})
		}

		let iz = 0

		bench.add(`zustand write (${LISTENER_COUNT} listeners)`, () => {
			zS.setState({ value: ++iz })
		})

		// --- valtio ---
		const vpS = proxy({ value: 0 })

		for (let i = 0; i < LISTENER_COUNT; i++) {
			valtioSubscribe(vpS, () => {}, true)
		}

		let iv = 0

		bench.add(`valtio write (${LISTENER_COUNT} listeners)`, () => {
			vpS.value = ++iv
		})
	},
})

// ---------------------------------------------------------------------------
// 14. Interceptor / middleware — transform on write
// ---------------------------------------------------------------------------

const middleware = defineSuite('middleware', {
	'Middleware / Interceptor Overhead': (bench) => {
		// --- gjendje (intercept) ---
		const gjI = state(uniqueKey('intercept'), { default: 0 })

		gjI.intercept((next) => Math.max(0, next))

		gjI.subscribe(() => {})

		let igj = 0

		bench.add('gjendje write + interceptor', () => {
			gjI.set(++igj)
		})

		// --- zustand (middleware via setState wrapper) ---
		const zI = createZustandStore<{ value: number }>(() => ({ value: 0 }))

		const origSetState = zI.setState.bind(zI)

		const wrappedSetState = (partial: { value: number }) => {
			origSetState({ value: Math.max(0, partial.value) })
		}

		zI.subscribe(() => {})

		let iz = 0

		bench.add('zustand write + wrapper middleware', () => {
			wrappedSetState({ value: ++iz })
		})

		// --- valtio (no built-in intercept, use subscribe + revert) ---
		// Valtio doesn't have interceptors, so we just measure plain write for comparison
		const vpI = proxy({ value: 0 })

		valtioSubscribe(vpI, () => {}, true)

		let iv = 0

		bench.add('valtio write (no middleware)', () => {
			vpI.value = ++iv
		})
	},
})

// ---------------------------------------------------------------------------
// Run suites — supports CLI filter: `pnpm tsx edge-cases-comparison.bench.ts diamond`
// ---------------------------------------------------------------------------

runSuites(
	'Edge-Case Comparison: gjendje vs Zustand vs Valtio',
	[
		diamond,
		readCost,
		perKeyWatch,
		multiKeyWatch,
		effectLifecycle,
		batchWrites,
		batchDerived,
		readWrite,
		largeObject,
		shallowEqual_,
		subscribeChurn,
		creation,
		manyListeners,
		middleware,
	],
	'edge-cases-comparison',
).catch(console.error)
