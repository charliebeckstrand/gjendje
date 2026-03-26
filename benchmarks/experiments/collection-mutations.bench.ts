/**
 * collection-mutations.bench.ts
 *
 * Investigates breakthrough-level (>20%) optimization opportunities in the
 * collection primitive's mutation and watch-diffing paths.
 *
 * Experiments:
 *   1. add() — current concat vs mutate-in-place + manual notify
 *   2. remove() — current filter/slice vs in-place splice with no copy
 *   3. update({one}) — current slice+replace vs in-place mutate + notify
 *   4. watch diffing — cost of the per-change O(items × watchedKeys) loop
 *      at collection sizes 10 / 100 / 1000
 *
 * Key hypothesis:
 *   For memory-scope collections (MemoryStateImpl under the hood), base.set()
 *   goes through: equality check → c.current = next → notify(notifyFn).
 *   The dominant cost on large arrays is the O(n) array allocation itself
 *   (concat / slice / filter).  If we could mutate in place and call notify
 *   directly, we skip both the allocation and the set() overhead.
 *
 * Run with: tsx benchmarks/experiments/collection-mutations.bench.ts
 */

import { Bench } from 'tinybench'
import { collection } from '../../src/collection.js'
import { configure } from '../../src/config.js'
import { notify } from '../../src/batch.js'
import { safeCall } from '../../src/listeners.js'
import { printResults } from '../helpers.js'

// ---------------------------------------------------------------------------
// Disable registry so each createBase() call does NOT hit the Map
// (mirrors what production code does when registry:false is set)
// ---------------------------------------------------------------------------

configure({ registry: false })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let keyId = 0

function nextKey(): string {
	return `col-bench-${keyId++}`
}

type Item = { id: number; name: string; value: number }

function makeItems(n: number): Item[] {
	return Array.from({ length: n }, (_, i) => ({ id: i, name: `item-${i}`, value: i }))
}

// ---------------------------------------------------------------------------
// Inline mutate-in-place + notify simulation
//
// The collection wraps a MemoryStateImpl. The only way to bypass set() without
// touching src/ is to simulate what an optimised version would do:
//   1. Get a direct reference to the stored array
//   2. Mutate it in place
//   3. Manually invoke the subscriber notification pipeline
//
// We replicate that here as a self-contained implementation so we can measure
// the ceiling of what an in-place approach could achieve.
// ---------------------------------------------------------------------------

interface InPlaceCollection<T> {
	readonly items: T[]
	subscribe(listener: (items: T[]) => void): () => void
	add(...newItems: T[]): void
	removeOne(predicate: (item: T) => boolean): void
	removeAll(predicate: (item: T) => boolean): void
	updateOne(predicate: (item: T) => boolean, patch: Partial<T>): void
}

function makeInPlaceCollection<T>(initial: T[]): InPlaceCollection<T> {
	// Store array by reference; mutations operate on this same reference
	const items = initial.slice()

	// Minimal listener set — mirrors MemoryStateImpl's notifyFn approach
	const listeners = new Set<(items: T[]) => void>()

	function notifyAll(): void {
		for (const l of listeners) {
			safeCall(l, items)
		}
	}

	return {
		get items() {
			return items
		},

		subscribe(listener: (items: T[]) => void): () => void {
			listeners.add(listener)

			return () => {
				listeners.delete(listener)
			}
		},

		add(...newItems: T[]): void {
			for (const item of newItems) {
				items.push(item)
			}

			notify(notifyAll)
		},

		removeOne(predicate: (item: T) => boolean): void {
			const idx = items.findIndex(predicate)

			if (idx === -1) return

			items.splice(idx, 1)

			notify(notifyAll)
		},

		removeAll(predicate: (item: T) => boolean): void {
			let changed = false

			for (let i = items.length - 1; i >= 0; i--) {
				if (predicate(items[i] as T)) {
					items.splice(i, 1)
					changed = true
				}
			}

			if (changed) notify(notifyAll)
		},

		updateOne(predicate: (item: T) => boolean, patch: Partial<T>): void {
			const idx = items.findIndex(predicate)

			if (idx === -1) return

			// Mutate the object in place instead of creating a new array
			const target = items[idx] as Record<string, unknown>

			for (const k of Object.keys(patch)) {
				target[k] = (patch as Record<string, unknown>)[k]
			}

			notify(notifyAll)
		},
	}
}

// ---------------------------------------------------------------------------
// Optimised remove helpers (no slice copy for remove-one)
// ---------------------------------------------------------------------------

// Current approach: prev.slice() then splice — always creates a copy
function removeOneCurrent(arr: Item[], predicate: (item: Item) => boolean): Item[] | null {
	const idx = arr.findIndex(predicate)

	if (idx === -1) return null

	const next = arr.slice()

	next.splice(idx, 1)

	return next
}

// Optimised: build a new array skipping only the matched index (avoids double pass)
function removeOneOptimised(arr: Item[], predicate: (item: Item) => boolean): Item[] | null {
	const idx = arr.findIndex(predicate)

	if (idx === -1) return null

	const next = new Array<Item>(arr.length - 1)

	for (let i = 0; i < idx; i++) {
		next[i] = arr[i] as Item
	}

	for (let i = idx + 1; i < arr.length; i++) {
		next[i - 1] = arr[i] as Item
	}

	return next
}

// ---------------------------------------------------------------------------
// Watch diffing simulation — isolated from actual collection overhead
// ---------------------------------------------------------------------------

// The current watch diff algorithm from collection.ts (same-length path)
function watchDiffCurrent(
	prev: Item[],
	next: Item[],
	watchedKeys: PropertyKey[],
): Set<PropertyKey> | undefined {
	const len = next.length

	const w = new Map<PropertyKey, boolean>()

	for (const k of watchedKeys) w.set(k, false)

	let changedKeys: Set<PropertyKey> | undefined

	for (let i = 0; i < len; i++) {
		const p = prev[i]
		const c = next[i]

		if (p === c) continue

		for (const watchKey of w.keys()) {
			if (changedKeys?.has(watchKey)) continue

			if (!Object.is((p as Record<PropertyKey, unknown>)[watchKey], (c as Record<PropertyKey, unknown>)[watchKey])) {
				if (!changedKeys) changedKeys = new Set()

				changedKeys.add(watchKey)
			}
		}

		if (changedKeys && changedKeys.size === w.size) break
	}

	return changedKeys
}

// Alternative: use a flat array instead of a Map for the watcher key list
// Avoids Map key iteration overhead; uses Array.includes for already-found tracking
function watchDiffFlatArray(
	prev: Item[],
	next: Item[],
	watchedKeys: PropertyKey[],
): PropertyKey[] | undefined {
	const len = next.length
	const numKeys = watchedKeys.length

	let found = 0

	// Bitmask for which keys have been found changed (up to 32 keys)
	let foundMask = 0

	const changedKeys: PropertyKey[] = []

	for (let i = 0; i < len; i++) {
		const p = prev[i]
		const c = next[i]

		if (p === c) continue

		for (let ki = 0; ki < numKeys; ki++) {
			if (foundMask & (1 << ki)) continue

			const key = watchedKeys[ki] as PropertyKey

			if (!Object.is((p as Record<PropertyKey, unknown>)[key], (c as Record<PropertyKey, unknown>)[key])) {
				foundMask |= (1 << ki)
				changedKeys.push(key)
				found++
			}
		}

		if (found === numKeys) break
	}

	return changedKeys.length > 0 ? changedKeys : undefined
}

// ---------------------------------------------------------------------------
// Benchmark 1: add() — concat vs in-place push
// ---------------------------------------------------------------------------

async function benchAdd(size: number): Promise<void> {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const ITEM: Item = { id: 9999, name: 'new', value: 99 }

	// --- Current: collection.add via base.set(base.get().concat(...)) ---
	bench.add(`add() current [size=${size}]`, () => {
		const col = collection<Item>(nextKey(), { default: makeItems(size) })

		col.add(ITEM)

		col.destroy()
	})

	// --- Optimised: mutate in-place + notify (no array allocation) ---
	bench.add(`add() in-place [size=${size}]`, () => {
		const col = makeInPlaceCollection<Item>(makeItems(size))

		col.add(ITEM)
	})

	// --- Baseline: just array push (theoretical ceiling) ---
	bench.add(`add() push-only baseline [size=${size}]`, () => {
		const arr = makeItems(size)

		arr.push(ITEM)
	})

	await bench.run()

	console.log(`\n── add() — collection size ${size} ──`)
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark 2: remove({one:true}) — slice+splice vs direct index copy
// ---------------------------------------------------------------------------

async function benchRemoveOne(size: number): Promise<void> {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const targetId = Math.floor(size / 2)

	const predicate = (item: Item) => item.id === targetId

	// --- Current: collection.remove with { one: true } (slice then splice) ---
	bench.add(`remove({one}) current [size=${size}]`, () => {
		const col = collection<Item>(nextKey(), { default: makeItems(size) })

		col.remove(predicate, { one: true })

		col.destroy()
	})

	// --- Optimised: in-place splice (no copy at all) ---
	bench.add(`remove({one}) in-place [size=${size}]`, () => {
		const col = makeInPlaceCollection<Item>(makeItems(size))

		col.removeOne(predicate)
	})

	// --- Optimised array-only: build new array skipping index (no double allocation) ---
	bench.add(`remove({one}) new-array-skip-idx [size=${size}]`, () => {
		const arr = makeItems(size)

		removeOneOptimised(arr, predicate)
	})

	// --- Current array-only: slice+splice ---
	bench.add(`remove({one}) slice+splice [size=${size}]`, () => {
		const arr = makeItems(size)

		removeOneCurrent(arr, predicate)
	})

	await bench.run()

	console.log(`\n── remove({one:true}) — collection size ${size} ──`)
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark 3: remove(all) — filter vs reverse splice
// ---------------------------------------------------------------------------

async function benchRemoveAll(size: number): Promise<void> {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	// Remove ~10% of items (realistic selective delete)
	const predicate = (item: Item) => item.id % 10 === 0

	// --- Current: collection.remove (filter) ---
	bench.add(`remove(all) current filter [size=${size}]`, () => {
		const col = collection<Item>(nextKey(), { default: makeItems(size) })

		col.remove(predicate)

		col.destroy()
	})

	// --- Optimised: in-place reverse splice (no allocation) ---
	bench.add(`remove(all) in-place [size=${size}]`, () => {
		const col = makeInPlaceCollection<Item>(makeItems(size))

		col.removeAll(predicate)
	})

	// --- Array-only current: filter ---
	bench.add(`remove(all) filter-only [size=${size}]`, () => {
		const arr = makeItems(size)

		arr.filter((item) => !predicate(item))
	})

	// --- Array-only optimised: reverse splice ---
	bench.add(`remove(all) reverse-splice [size=${size}]`, () => {
		const arr = makeItems(size)

		for (let i = arr.length - 1; i >= 0; i--) {
			if (predicate(arr[i] as Item)) arr.splice(i, 1)
		}
	})

	await bench.run()

	console.log(`\n── remove(all ~10%) — collection size ${size} ──`)
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark 4: update({one:true}) — slice+replace vs in-place Object.assign
// ---------------------------------------------------------------------------

async function benchUpdateOne(size: number): Promise<void> {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const targetId = Math.floor(size / 2)

	const predicate = (item: Item) => item.id === targetId

	const patch = { value: 9999 }

	// --- Current: collection.update with { one: true } (slice + new object spread) ---
	bench.add(`update({one}) current [size=${size}]`, () => {
		const col = collection<Item>(nextKey(), { default: makeItems(size) })

		col.update(predicate, patch, { one: true })

		col.destroy()
	})

	// --- Optimised: in-place Object.assign (no array or object allocation) ---
	bench.add(`update({one}) in-place [size=${size}]`, () => {
		const col = makeInPlaceCollection<Item>(makeItems(size))

		col.updateOne(predicate, patch)
	})

	// --- Array-only: current slice + spread ---
	bench.add(`update({one}) slice+spread [size=${size}]`, () => {
		const arr = makeItems(size)
		const idx = arr.findIndex(predicate)

		if (idx !== -1) {
			const next = arr.slice()

			next[idx] = { ...arr[idx] as Item, ...patch }
		}
	})

	// --- Array-only: in-place mutate ---
	bench.add(`update({one}) in-place-only [size=${size}]`, () => {
		const arr = makeItems(size)
		const idx = arr.findIndex(predicate)

		if (idx !== -1) {
			Object.assign(arr[idx] as Item, patch)
		}
	})

	await bench.run()

	console.log(`\n── update({one:true}) — collection size ${size} ──`)
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark 5: watch diffing algorithm — current vs flat-array bitmask
// ---------------------------------------------------------------------------

async function benchWatchDiff(size: number): Promise<void> {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const WATCHED_KEYS_1: (keyof Item)[] = ['value']
	const WATCHED_KEYS_3: (keyof Item)[] = ['id', 'name', 'value']

	// prev and next arrays where the LAST item changed (worst case — must scan all)
	const prev = makeItems(size)

	const next = prev.slice()

	// Mutate the last item to trigger the diff
	next[size - 1] = { ...prev[size - 1] as Item, value: 9999 }

	// --- Current: Map-based watcher key iteration, 1 key ---
	bench.add(`watch diff current (1 key) [size=${size}]`, () => {
		watchDiffCurrent(prev, next, WATCHED_KEYS_1)
	})

	// --- Optimised: flat array + bitmask, 1 key ---
	bench.add(`watch diff flat+bitmask (1 key) [size=${size}]`, () => {
		watchDiffFlatArray(prev, next, WATCHED_KEYS_1)
	})

	// --- Current: 3 watched keys ---
	bench.add(`watch diff current (3 keys) [size=${size}]`, () => {
		watchDiffCurrent(prev, next, WATCHED_KEYS_3)
	})

	// --- Optimised: 3 watched keys ---
	bench.add(`watch diff flat+bitmask (3 keys) [size=${size}]`, () => {
		watchDiffFlatArray(prev, next, WATCHED_KEYS_3)
	})

	await bench.run()

	console.log(`\n── watch diffing — collection size ${size} ──`)
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Benchmark 6: watch diffing via real collection.watch() API
// Measures the end-to-end cost of a watched mutation through the full pipeline
// ---------------------------------------------------------------------------

async function benchWatchRealAPI(size: number): Promise<void> {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const targetId = Math.floor(size / 2)

	// Pre-built: collection with watch active, mutate one item
	const col = collection<Item>(nextKey(), { default: makeItems(size) })

	let sink = 0

	col.watch('value', (items) => {
		sink += items.length
	})

	bench.add(`watch(value) update-one trigger [size=${size}]`, () => {
		col.update((item) => item.id === targetId, { value: sink }, { one: true })
	})

	// In-place collection with a manual watch equivalent
	const inPlace = makeInPlaceCollection<Item>(makeItems(size))

	let prevItems = inPlace.items.slice()

	inPlace.subscribe((items) => {
		// Simulate same diffing logic as collection.watch
		const p = prevItems

		for (let i = 0; i < items.length; i++) {
			if ((p[i] as Item | undefined)?.value !== (items[i] as Item | undefined)?.value) {
				sink++
			}
		}

		prevItems = items.slice()
	})

	bench.add(`watch(value) in-place update-one [size=${size}]`, () => {
		inPlace.updateOne((item) => item.id === targetId, { value: sink })
	})

	await bench.run()

	col.destroy()

	console.log(`\n── watch() end-to-end update trigger — collection size ${size} ──`)
	printResults(bench)

	void sink
}

// ---------------------------------------------------------------------------
// Benchmark 7: Batch multiple adds
// Compare: N individual add() calls vs a single set(concat of all)
// ---------------------------------------------------------------------------

async function benchBatchedAdds(size: number, batchSize: number): Promise<void> {
	const bench = new Bench({ time: 1500, warmupTime: 300 })

	const newItems = Array.from({ length: batchSize }, (_, i) => ({
		id: size + i,
		name: `new-${i}`,
		value: i,
	}))

	// --- Current: N individual add() calls ---
	bench.add(`add() x${batchSize} individual [size=${size}]`, () => {
		const col = collection<Item>(nextKey(), { default: makeItems(size) })

		for (const item of newItems) {
			col.add(item)
		}

		col.destroy()
	})

	// --- Optimised: single add(...items) spread call ---
	bench.add(`add() x${batchSize} single spread [size=${size}]`, () => {
		const col = collection<Item>(nextKey(), { default: makeItems(size) })

		col.add(...newItems)

		col.destroy()
	})

	// --- Optimised: in-place push all ---
	bench.add(`add() x${batchSize} in-place push [size=${size}]`, () => {
		const col = makeInPlaceCollection<Item>(makeItems(size))

		col.add(...newItems)
	})

	await bench.run()

	console.log(`\n── batched adds (${batchSize} items into size=${size} collection) ──`)
	printResults(bench)
}

// ---------------------------------------------------------------------------
// Run all benchmarks
// ---------------------------------------------------------------------------

const SIZES = [10, 100, 1000] as const

console.log('='.repeat(70))
console.log('  Collection Mutation Performance — Optimization Experiments')
console.log('  Investigating: in-place mutate, remove copy, watch diff')
console.log('='.repeat(70))

// Section 1: add()
for (const size of SIZES) {
	await benchAdd(size)
}

// Section 2: remove({one:true})
for (const size of SIZES) {
	await benchRemoveOne(size)
}

// Section 3: remove(all, ~10%)
for (const size of SIZES) {
	await benchRemoveAll(size)
}

// Section 4: update({one:true})
for (const size of SIZES) {
	await benchUpdateOne(size)
}

// Section 5: watch diffing algorithm isolation
for (const size of SIZES) {
	await benchWatchDiff(size)
}

// Section 6: watch end-to-end trigger cost
for (const size of SIZES) {
	await benchWatchRealAPI(size)
}

// Section 7: batched adds (10 items into collection)
for (const size of [10, 100]) {
	await benchBatchedAdds(size, 10)
}

console.log('='.repeat(70))
console.log('  Done.')
console.log('='.repeat(70))
