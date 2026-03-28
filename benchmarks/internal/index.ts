import {
	batch,
	collection,
	computed,
	effect,
	readonly,
	select,
	state,
	withHistory,
} from '../../src/index.js'
import { defineSuite, runSuites, uniqueKey } from '../helpers.js'

// ==========================================================================
// Internal Benchmark Suite — Granular
//
// This file aggregates all internal benchmarks into a single runner.
// Each benchmark can also be run independently:
//   pnpm tsx benchmarks/internal/lifecycle.bench.ts
//   pnpm tsx benchmarks/internal/computed.bench.ts
//   ... etc.
//
// Run all:
//   pnpm bench:internal:all
//
// Filter by suite name:
//   pnpm bench:internal:all batch
//   pnpm bench:internal:all computed diamond
// ==========================================================================

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const lifecycleBasicSuite = defineSuite('lifecycle-basic', {
	'Create + Destroy': (bench) => {
		bench.add('state: create + destroy', () => {
			const s = state(uniqueKey('lc-s'), { default: 0 })
			s.destroy()
		})

		bench.add('collection: create + destroy', () => {
			const col = collection(uniqueKey('lc-col'), { default: [] as number[] })
			col.destroy()
		})

		bench.add('computed: create + destroy (1 dep)', () => {
			const src = state(uniqueKey('lc-c1'), { default: 0 })

			const c = computed([src], ([v]) => v)

			c.destroy()
			src.destroy()
		})

		bench.add('select: create + destroy', () => {
			const src = state(uniqueKey('lc-sel'), { default: { x: 1 } })

			const s = select(src, (v) => v.x)

			s.destroy()
			src.destroy()
		})

		bench.add('effect: create + stop', () => {
			const src = state(uniqueKey('lc-eff'), { default: 0 })

			const handle = effect([src], () => {})

			handle.stop()
			src.destroy()
		})

		bench.add('readonly: create (zero-cost wrapper)', () => {
			const src = state(uniqueKey('lc-ro'), { default: 0 })

			readonly(src)

			src.destroy()
		})

		bench.add('withHistory: create + destroy', () => {
			const src = state(uniqueKey('lc-hist'), { default: 0 })

			const h = withHistory(src)

			h.destroy()
		})
	},
})

const lifecycleFullSuite = defineSuite('lifecycle-full', {
	'Full Lifecycle (create → subscribe → write → unsub → destroy)': (bench) => {
		bench.add('state: full lifecycle', () => {
			const s = state(uniqueKey('lc-full'), { default: 0 })
			const unsub = s.subscribe(() => {})
			s.set(42)
			unsub()
			s.destroy()
		})

		bench.add('collection: full lifecycle', () => {
			const col = collection(uniqueKey('lc-cfull'), { default: [] as number[] })
			const unsub = col.subscribe(() => {})
			col.add(1)
			unsub()
			col.destroy()
		})
	},
})

// ---------------------------------------------------------------------------
// State Write
// ---------------------------------------------------------------------------

const updaterStyleSuite = defineSuite('updater-style', {
	'Updater Style (Direct vs Functional)': (bench) => {
		const sDirect = state(uniqueKey('upd-dir'), { default: 0 })

		sDirect.subscribe(() => {})

		let id = 0

		bench.add('set(value)', () => {
			sDirect.set(++id)
		})

		const sFn = state(uniqueKey('upd-fn'), { default: 0 })

		sFn.subscribe(() => {})

		bench.add('set(prev => prev + 1)', () => {
			sFn.set((prev) => prev + 1)
		})
	},
})

const largeObjectSuite = defineSuite('large-object', {
	'Large Object State': (bench) => {
		for (const size of [5, 50, 500]) {
			const obj: Record<string, number> = {}

			for (let i = 0; i < size; i++) obj[`k${i}`] = i

			const s = state(uniqueKey(`obj-${size}`), { default: obj })

			s.subscribe(() => {})

			let iter = 0

			bench.add(`write object (${size} keys)`, () => {
				const next = { ...obj, k0: ++iter }
				s.set(next)
			})
		}
	},
})

const isEqualSuite = defineSuite('is-equal', {
	'Custom Equality (isEqual) Overhead': (bench) => {
		type Obj = { a: number; b: number; c: number }

		const sNoEq = state(uniqueKey('eq-none'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
		})

		sNoEq.subscribe(() => {})

		let ine = 0

		bench.add('write (no isEqual)', () => {
			sNoEq.set({ a: ++ine, b: 0, c: 0 })
		})

		const sEqFalse = state(uniqueKey('eq-false'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
			isEqual: () => false,
		})

		sEqFalse.subscribe(() => {})

		let ief = 0

		bench.add('write (isEqual: always false)', () => {
			sEqFalse.set({ a: ++ief, b: 0, c: 0 })
		})

		const sEqSkip = state(uniqueKey('eq-skip'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
			isEqual: (a, b) => a.a === b.a && a.b === b.b && a.c === b.c,
		})

		sEqSkip.subscribe(() => {})

		bench.add('write (isEqual: skips update)', () => {
			sEqSkip.set({ a: 0, b: 0, c: 0 })
		})

		const sJson = state(uniqueKey('eq-json'), {
			default: { a: 0, b: 0, c: 0 } as Obj,
			isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
		})

		sJson.subscribe(() => {})

		let ij = 0

		bench.add('write (isEqual: JSON.stringify)', () => {
			sJson.set({ a: ++ij, b: 0, c: 0 })
		})
	},
})

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const computedChainSuite = defineSuite('computed-chain', {
	'Computed Chain Depth': (bench) => {
		for (const depth of [5, 10, 25]) {
			const src = state(uniqueKey(`chain${depth}`), { default: 0 })

			let prev = computed([src], ([v]) => v + 1)

			for (let i = 1; i < depth; i++) {
				prev = computed([prev], ([v]) => v + 1)
			}

			const end = prev

			let iter = 0

			bench.add(`computed chain (depth ${depth})`, () => {
				src.set(++iter)
				end.get()
			})
		}
	},
})

const computedFanInSuite = defineSuite('computed-fan-in', {
	'Computed Fan-In (Many Dependencies)': (bench) => {
		for (const count of [5, 20, 50]) {
			const deps = Array.from({ length: count }, (_, i) =>
				state(uniqueKey(`fan${count}-${i}`), { default: i }),
			)

			const comp = computed(deps, (vals) => vals.reduce((a: number, b: number) => a + b, 0))

			let iter = 0

			bench.add(`computed fan-in (${count} deps)`, () => {
				deps[0].set(++iter)
				comp.get()
			})
		}
	},
})

const computedDiamondSuite = defineSuite('computed-diamond', {
	'Diamond Dependency Graph': (bench) => {
		const a = state(uniqueKey('dia-a'), { default: 0 })

		const b = computed([a], ([v]) => v * 2)

		const c = computed([a], ([v]) => v + 10)

		const d = computed([b, c], ([bv, cv]) => bv + cv)

		d.subscribe(() => {})

		let iter = 0

		bench.add('diamond (A→B,C→D)', () => {
			a.set(++iter)
			d.get()
		})

		const wSrc = state(uniqueKey('dia-w'), { default: 0 })

		const intermediaries = Array.from({ length: 10 }, (_, i) => computed([wSrc], ([v]) => v + i))

		const wFinal = computed(intermediaries, (vals) =>
			vals.reduce((a: number, b: number) => a + b, 0),
		)

		wFinal.subscribe(() => {})

		let wIter = 0

		bench.add('wide diamond (A → 10 → final)', () => {
			wSrc.set(++wIter)
			wFinal.get()
		})
	},
})

// ---------------------------------------------------------------------------
// Effect
// ---------------------------------------------------------------------------

const effectSuite = defineSuite('effect', {
	'Effect Overhead': (bench) => {
		const effSrc1 = state(uniqueKey('eff1'), { default: 0 })
		let effSink1 = 0

		effect([effSrc1], ([v]) => {
			effSink1 = v
		})

		let ie1 = 0

		bench.add('effect trigger (no cleanup)', () => {
			effSrc1.set(++ie1)
		})

		const effSrc2 = state(uniqueKey('eff2'), { default: 0 })
		let effSink2 = 0

		effect([effSrc2], ([v]) => {
			effSink2 = v

			return () => {
				effSink2 = 0
			}
		})

		let ie2 = 0

		bench.add('effect trigger (with cleanup)', () => {
			effSrc2.set(++ie2)
		})

		const effDeps5 = Array.from({ length: 5 }, (_, i) =>
			state(uniqueKey(`eff5-${i}`), { default: i }),
		)
		let effSum = 0

		effect(effDeps5, (vals) => {
			effSum = vals.reduce((a: number, b: number) => a + b, 0)
		})

		let ie5 = 0

		bench.add('effect trigger (5 deps, change 1)', () => {
			effDeps5[0].set(++ie5)
		})

		void effSink1
		void effSink2
		void effSum
	},
})

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

const batchScalingSuite = defineSuite('batch-scaling', {
	'Batch Scaling': (bench) => {
		for (const count of [10, 50, 200]) {
			const items = Array.from({ length: count }, (_, i) =>
				state(uniqueKey(`bscale-${count}`), { default: i }),
			)

			for (const item of items) {
				item.subscribe(() => {})
			}

			let iter = 0

			bench.add(`batch (${count} states)`, () => {
				iter++

				batch(() => {
					for (let i = 0; i < count; i++) {
						items[i].set(iter + i)
					}
				})
			})
		}
	},
})

const nestedBatchSuite = defineSuite('nested-batch', {
	'Nested Batch Depth': (bench) => {
		const nbSrc = state(uniqueKey('nb'), { default: 0 })

		nbSrc.subscribe(() => {})

		let inb1 = 0

		bench.add('flat batch (1 level)', () => {
			batch(() => {
				nbSrc.set(++inb1)
			})
		})

		let inb3 = 0

		bench.add('nested batch (3 levels)', () => {
			batch(() => {
				batch(() => {
					batch(() => {
						nbSrc.set(++inb3)
					})
				})
			})
		})

		let inb10 = 0

		bench.add('nested batch (10 levels)', () => {
			function nest(depth: number): void {
				if (depth === 0) {
					nbSrc.set(++inb10)

					return
				}

				batch(() => nest(depth - 1))
			}

			nest(10)
		})
	},
})

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

const collectionSuite = defineSuite('collection', {
	'Collection Operations': (bench) => {
		type Item = { id: number; name: string; done: boolean }

		const items: Item[] = Array.from({ length: 1000 }, (_, i) => ({
			id: i,
			name: `item-${i}`,
			done: i % 2 === 0,
		}))

		bench.add('collection.add (append 1 item)', () => {
			const col = collection(uniqueKey('col-add'), { default: [] as Item[] })
			col.add({ id: 0, name: 'new', done: false })
			col.destroy()
		})

		const colLarge = collection(uniqueKey('col-add-lg'), { default: [...items] })

		bench.add('collection.add (to 1000 items)', () => {
			colLarge.add({ id: 9999, name: 'new', done: false })
			colLarge.set([...items])
		})

		const colRemove = collection(uniqueKey('col-rm'), { default: [...items] })
		let rmId = 0

		bench.add('collection.remove (from 1000 items)', () => {
			colRemove.set([...items])
			colRemove.remove((item) => item.id === rmId++ % 1000)
		})

		const colUpdate = collection(uniqueKey('col-up'), { default: [...items] })
		let upId = 0

		bench.add('collection.update (in 1000 items)', () => {
			colUpdate.update((item) => item.id === upId++ % 1000, { done: true })
		})

		const colFind = collection(uniqueKey('col-find'), { default: [...items] })
		let findId = 0

		bench.add('collection.find (in 1000 items)', () => {
			colFind.find((item) => item.id === findId++ % 1000)
		})
	},
})

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const middlewareSuite = defineSuite('middleware', {
	'Interceptor / Hook Middleware Overhead': (bench) => {
		const mPlain = state(uniqueKey('mw-plain'), { default: 0 })

		let imp = 0

		bench.add('write (no middleware)', () => {
			mPlain.set(++imp)
		})

		const m1i = state(uniqueKey('mw-1i'), { default: 0 })

		m1i.intercept((next) => next)

		let i1i = 0

		bench.add('write (1 interceptor)', () => {
			m1i.set(++i1i)
		})

		const mAll = state(uniqueKey('mw-all'), { default: 0 })

		for (let j = 0; j < 5; j++) {
			mAll.intercept((next) => next)
			mAll.onChange(() => {})
		}

		let iAll = 0

		bench.add('write (5 interceptors + 5 hooks)', () => {
			mAll.set(++iAll)
		})
	},
})

// ---------------------------------------------------------------------------
// Subscription & Watch
// ---------------------------------------------------------------------------

const subscribeChurnSuite = defineSuite('subscribe-churn', {
	'Subscribe/Unsubscribe Churn': (bench) => {
		const sSrc = state(uniqueKey('churn'), { default: 0 })

		bench.add('subscribe + immediate unsubscribe', () => {
			const unsub = sSrc.subscribe(() => {})
			unsub()
		})

		bench.add('subscribe + write + unsubscribe', () => {
			const unsub = sSrc.subscribe(() => {})
			sSrc.set((v) => v + 1)
			unsub()
		})

		bench.add('accumulate 100 subs + teardown', () => {
			const unsubs: (() => void)[] = []

			for (let i = 0; i < 100; i++) {
				unsubs.push(sSrc.subscribe(() => {}))
			}

			for (const unsub of unsubs) {
				unsub()
			}
		})
	},
})

const watchSuite = defineSuite('watch', {
	'Watch (Per-Key) Overhead': (bench) => {
		type Obj = { a: number; b: number; c: number; d: number; e: number }

		const wSub = state(uniqueKey('watch-sub'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		wSub.subscribe(() => {})

		let isub = 0

		bench.add('write + subscribe (whole object)', () => {
			wSub.set({ a: ++isub, b: 0, c: 0, d: 0, e: 0 })
		})

		const w1 = state(uniqueKey('watch-1'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		w1.watch('a', () => {})

		let iw1 = 0

		bench.add('write + watch (1 key)', () => {
			w1.set({ a: ++iw1, b: 0, c: 0, d: 0, e: 0 })
		})

		const w5 = state(uniqueKey('watch-5'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		w5.watch('a', () => {})
		w5.watch('b', () => {})
		w5.watch('c', () => {})
		w5.watch('d', () => {})
		w5.watch('e', () => {})

		let iw5 = 0

		bench.add('write + watch (5 keys)', () => {
			w5.set({ a: ++iw5, b: 0, c: 0, d: 0, e: 0 })
		})

		const wNoop = state(uniqueKey('watch-noop'), {
			default: { a: 0, b: 0, c: 0, d: 0, e: 0 } as Obj,
		})

		wNoop.watch('b', () => {})

		let iwn = 0

		bench.add('write + watch (key unchanged)', () => {
			wNoop.set({ a: ++iwn, b: 0, c: 0, d: 0, e: 0 })
		})
	},
})

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const historySuite = defineSuite('history', {
	'History (undo/redo) Overhead': (bench) => {
		const hPlain = state(uniqueKey('hist-plain'), { default: 0 })
		let ipw = 0

		bench.add('write (no history)', () => {
			hPlain.set(++ipw)
		})

		const hTracked = withHistory(state(uniqueKey('hist-tracked'), { default: 0 }))
		let iht = 0

		bench.add('write (with history)', () => {
			hTracked.set(++iht)
		})

		const hCycle = withHistory(state(uniqueKey('hist-cycle'), { default: 0 }), { maxSize: 100 })

		for (let i = 0; i < 50; i++) hCycle.set(i)

		bench.add('undo + redo cycle', () => {
			hCycle.undo()
			hCycle.redo()
		})

		const hEvict = withHistory(state(uniqueKey('hist-evict'), { default: 0 }), { maxSize: 50 })

		for (let i = 0; i < 50; i++) hEvict.set(i)

		let iev = 50

		bench.add('write (history at capacity, evicting)', () => {
			hEvict.set(++iev)
		})
	},
})

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

const selectSuite = defineSuite('select', {
	'Select vs Computed (Single Dependency)': (bench) => {
		type User = { name: string; age: number }

		const userDefault: User = { name: 'Jane', age: 30 }

		const sSrc = state(uniqueKey('sel-src'), { default: userDefault })

		const sName = select(sSrc, (u) => u.name)

		sName.subscribe(() => {})

		let is = 0

		bench.add('select (field projection)', () => {
			sSrc.set({ ...userDefault, age: ++is })
			sName.get()
		})

		const cSrc = state(uniqueKey('comp-src'), { default: userDefault })

		const cName = computed([cSrc], ([u]) => u.name)

		cName.subscribe(() => {})

		let ic = 0

		bench.add('computed (single dep, same projection)', () => {
			cSrc.set({ ...userDefault, age: ++ic })
			cName.get()
		})
	},
})

// ---------------------------------------------------------------------------
// Readonly
// ---------------------------------------------------------------------------

const readonlySuite = defineSuite('readonly', {
	'Readonly Wrapper Overhead': (bench) => {
		const src = state(uniqueKey('ro-src'), { default: 42 })

		bench.add('state.get() — direct', () => {
			src.get()
		})

		const ro = readonly(src)

		bench.add('readonly.get() — via wrapper', () => {
			ro.get()
		})

		const srcSub = state(uniqueKey('ro-sub'), { default: 0 })

		const roSub = readonly(srcSub)

		roSub.subscribe(() => {})

		let iter = 0

		bench.add('write source → readonly subscriber notified', () => {
			srcSub.set(++iter)
		})
	},
})

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

const patchSuite = defineSuite('patch', {
	'patch() vs set() for Partial Updates': (bench) => {
		type Obj = { a: number; b: number; c: number; d: number; e: number }

		const defaultObj: Obj = { a: 0, b: 0, c: 0, d: 0, e: 0 }

		const sSet = state(uniqueKey('pset'), { default: defaultObj })

		sSet.subscribe(() => {})

		let iSet = 0

		bench.add('set({ ...prev, a: n }) — spread', () => {
			iSet++
			sSet.set((prev) => ({ ...prev, a: iSet }))
		})

		const sPatch = state(uniqueKey('ppatch'), { default: defaultObj })

		sPatch.subscribe(() => {})

		let iPatch = 0

		bench.add('patch({ a: n }) — single key', () => {
			sPatch.patch({ a: ++iPatch })
		})

		const sMulti = state(uniqueKey('pmulti'), { default: defaultObj })

		sMulti.subscribe(() => {})

		let iMulti = 0

		bench.add('patch({ a, b, c }) — 3 keys', () => {
			iMulti++
			sMulti.patch({ a: iMulti, b: iMulti, c: iMulti })
		})
	},
})

// ---------------------------------------------------------------------------
// Run all suites
// ---------------------------------------------------------------------------

runSuites(
	'Internal Benchmark: All Suites',
	[
		lifecycleBasicSuite,
		lifecycleFullSuite,
		updaterStyleSuite,
		largeObjectSuite,
		isEqualSuite,
		computedChainSuite,
		computedFanInSuite,
		computedDiamondSuite,
		effectSuite,
		batchScalingSuite,
		nestedBatchSuite,
		collectionSuite,
		middlewareSuite,
		subscribeChurnSuite,
		watchSuite,
		historySuite,
		selectSuite,
		readonlySuite,
		patchSuite,
	],
	'internal/all',
).catch(console.error)
