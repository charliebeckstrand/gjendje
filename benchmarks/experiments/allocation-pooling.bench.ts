/**
 * allocation-pooling.bench.ts
 *
 * Investigates object allocation and GC pressure for short-lived
 * MemoryStateImpl instances — the dominant pattern in React mount/unmount
 * cycles.
 *
 * Experiments:
 *   1. Object pooling: pre-allocated MemoryStateImpl+MemoryCore pool
 *      vs current new-on-every-create approach.
 *   2. String interning for scopedKey ("memory:<key>"): cache vs fresh concat.
 *   3. Direct fields on MemoryStateImpl (no MemoryCore object) vs current
 *      MemoryCore indirection — measures whether removing the MemoryCore
 *      allocation pays off. (NOTE: does NOT touch StateImpl.)
 *   4. GC stress: create 100K instances, destroy all, measure total time
 *      with and without pooling.
 *
 * Run with:
 *   tsx benchmarks/experiments/allocation-pooling.bench.ts
 */

import { Bench } from 'tinybench'
import { getConfig } from '../../src/config.js'
import { notify } from '../../src/batch.js'
import { safeCall, safeCallChange } from '../../src/listeners.js'
import { addWatcher, notifyWatchers } from '../../src/watchers.js'
import { scopedKey, registerNew, unregisterByKey } from '../../src/registry.js'
import type { Listener, StateInstance, StateOptions, Unsubscribe } from '../../src/types.js'
import { RESOLVED } from '../../src/utils.js'
import { state } from '../../src/index.js'
import { printResults } from '../helpers.js'
import type { GjendjeConfig } from '../../src/config.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let keyCounter = 0

function nextKey(): string {
	return `pool-exp-${keyCounter++}`
}

const DUMMY_OPTIONS: StateOptions<number> = { default: 0 }

// ---------------------------------------------------------------------------
// Shared types (mirrors src/core.ts internals, copied here so we can build
// experimental classes without modifying source)
// ---------------------------------------------------------------------------

interface MemoryExtras<T> {
	interceptors: Set<(next: T, prev: T) => T> | undefined
	changeHandlers: Set<(next: T, prev: T) => void> | undefined
	watchers: Map<PropertyKey, Set<Listener<unknown>>> | undefined
	watchUnsub: Unsubscribe | undefined
	watchPrev: unknown
	resolveDestroyed: (() => void) | undefined
	destroyed: Promise<void> | undefined
}

interface MemoryCore<T> {
	current: T
	isDestroyed: boolean
	listeners: Set<Listener<T>> | undefined
	notifyFn: (() => void) | undefined
	ext: MemoryExtras<T> | undefined
}

function makeExt<T>(): MemoryExtras<T> {
	return {
		interceptors: undefined,
		changeHandlers: undefined,
		watchers: undefined,
		watchUnsub: undefined,
		watchPrev: undefined,
		resolveDestroyed: undefined,
		destroyed: undefined,
	}
}

function getExt<T>(c: MemoryCore<T>): MemoryExtras<T> {
	if (c.ext === undefined) c.ext = makeExt()

	return c.ext
}

// ---------------------------------------------------------------------------
// Experiment A: "Baseline" — create via state() API, destroy
// (This is the actual production path, including registry overhead.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Experiment B: Pooled MemoryStateImpl
//
// A pool of pre-allocated instances. On destroy(), reset fields and push back.
// On create(), pop from pool. This eliminates:
//   - `new` allocation of the class instance
//   - `new` allocation of the MemoryCore object
//   - GC pressure: returned objects avoid heap fragmentation
//
// The pool holds "naked" standalone memory state objects (not StateImpl
// subclasses, since we can't call super() a second time). This is a pure
// experiment — we DON'T modify src/.
// ---------------------------------------------------------------------------

// Pooled standalone state — like StandaloneMemoryState from lifecycle-experiment
// but with pool-reset support built in.

class PoolableMemoryState<T> implements StateInstance<T> {
	readonly scope: 'memory' = 'memory'

	key: string
	private _rKey: string
	private _defaultValue: T
	private _options: StateOptions<T>
	private _config: Readonly<GjendjeConfig>
	private _c: MemoryCore<T>

	constructor(key: string, rKey: string, options: StateOptions<T>, config: Readonly<GjendjeConfig>) {
		this.key = key
		this._rKey = rKey
		this._defaultValue = options.default
		this._options = options
		this._config = config
		this._c = {
			current: options.default,
			isDestroyed: false,
			listeners: undefined,
			notifyFn: undefined,
			ext: undefined,
		}
	}

	/** Reset all state fields to reuse this instance from the pool. */
	_poolReset(key: string, rKey: string, options: StateOptions<T>, config: Readonly<GjendjeConfig>): void {
		this.key = key
		this._rKey = rKey
		this._defaultValue = options.default
		this._options = options
		this._config = config

		const c = this._c

		c.current = options.default
		c.isDestroyed = false
		c.listeners = undefined
		c.notifyFn = undefined
		c.ext = undefined
	}

	get(): T {
		return this._c.current
	}

	peek(): T {
		return this._c.current
	}

	set(valueOrUpdater: T | ((prev: T) => T)): void {
		const c = this._c

		if (c.isDestroyed) return

		const prev = c.current

		let next =
			typeof valueOrUpdater === 'function'
				? (valueOrUpdater as (prev: T) => T)(prev)
				: valueOrUpdater

		const ext = c.ext

		if (ext !== undefined && ext.interceptors !== undefined && ext.interceptors.size > 0) {
			const original = next

			for (const interceptor of ext.interceptors) {
				next = interceptor(next, prev)
			}

			if (!Object.is(original, next)) {
				this._config.onIntercept?.({ key: this.key, scope: this.scope, original, intercepted: next })
			}
		}

		if (this._options.isEqual?.(next, prev)) return

		c.current = next

		if (c.notifyFn !== undefined) {
			notify(c.notifyFn)
		}

		if (ext !== undefined && ext.changeHandlers !== undefined && ext.changeHandlers.size > 0) {
			for (const hook of ext.changeHandlers) {
				safeCallChange(hook, next, prev)
			}
		}

		this._config.onChange?.({ key: this.key, scope: this.scope, value: next, previousValue: prev })
	}

	subscribe(listener: Listener<T>): Unsubscribe {
		const c = this._c

		if (!c.listeners) {
			const listeners = new Set<Listener<T>>()

			c.listeners = listeners
			c.notifyFn = () => {
				for (const l of listeners) {
					safeCall(l, c.current)
				}
			}
		}

		const set = c.listeners

		set.add(listener)

		return () => {
			set.delete(listener)
		}
	}

	reset(): void {
		const c = this._c

		if (c.isDestroyed) return

		const prev = c.current

		let next = this._defaultValue

		const ext = c.ext

		if (ext !== undefined && ext.interceptors !== undefined && ext.interceptors.size > 0) {
			const original = next

			for (const interceptor of ext.interceptors) {
				next = interceptor(next, prev)
			}

			if (!Object.is(original, next)) {
				this._config.onIntercept?.({ key: this.key, scope: this.scope, original, intercepted: next })
			}
		}

		if (this._options.isEqual?.(next, prev)) return

		c.current = next

		if (c.notifyFn !== undefined) {
			notify(c.notifyFn)
		}

		if (ext !== undefined && ext.changeHandlers !== undefined && ext.changeHandlers.size > 0) {
			for (const hook of ext.changeHandlers) {
				safeCallChange(hook, next, prev)
			}
		}

		this._config.onReset?.({ key: this.key, scope: this.scope, previousValue: prev })
		this._config.onChange?.({ key: this.key, scope: this.scope, value: next, previousValue: prev })
	}

	get ready(): Promise<void> { return RESOLVED }

	get settled(): Promise<void> { return RESOLVED }

	get hydrated(): Promise<void> { return RESOLVED }

	get isDestroyed(): boolean {
		return this._c.isDestroyed
	}

	get destroyed(): Promise<void> {
		if (this._c.isDestroyed) return RESOLVED

		const ext = getExt(this._c)

		if (!ext.destroyed) {
			ext.destroyed = new Promise<void>((resolve) => {
				ext.resolveDestroyed = resolve
			})
		}

		return ext.destroyed
	}

	intercept(fn: (next: T, prev: T) => T): Unsubscribe {
		const ext = getExt(this._c)

		if (!ext.interceptors) ext.interceptors = new Set()

		ext.interceptors.add(fn)

		return () => { ext.interceptors?.delete(fn) }
	}

	onChange(fn: (next: T, prev: T) => void): Unsubscribe {
		const ext = getExt(this._c)

		if (!ext.changeHandlers) ext.changeHandlers = new Set()

		ext.changeHandlers.add(fn)

		return () => { ext.changeHandlers?.delete(fn) }
	}

	watch<K extends T extends object ? keyof T : never>(
		watchKey: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe {
		const ext = getExt(this._c)

		if (!ext.watchers) ext.watchers = new Map()

		this._ensureWatchSubscription()

		return addWatcher(ext.watchers, watchKey, listener)
	}

	patch(partial: T extends object ? Partial<T> : never): void {
		this.set((prev) => ({ ...prev, ...partial }) as T)
	}

	destroy(pool?: PoolableMemoryState<T>[]): void {
		const c = this._c

		if (c.isDestroyed) return

		c.isDestroyed = true

		const ext = c.ext

		if (ext !== undefined) {
			ext.interceptors?.clear()
			ext.changeHandlers?.clear()
			ext.watchers?.clear()
			ext.watchUnsub?.()
		}

		c.listeners?.clear()
		c.notifyFn = undefined

		if (this._rKey) unregisterByKey(this._rKey)

		this._config.onDestroy?.({ key: this.key, scope: this.scope })

		if (ext?.resolveDestroyed) {
			ext.resolveDestroyed()
		} else if (ext !== undefined) {
			ext.destroyed = RESOLVED
		}

		// Return to pool if provided
		if (pool !== undefined) {
			pool.push(this)
		}
	}

	private _ensureWatchSubscription(): void {
		const ext = getExt(this._c)

		if (ext.watchUnsub) return

		ext.watchPrev = this._c.current

		ext.watchUnsub = this.subscribe((next) => {
			try {
				if (ext.watchers && ext.watchers.size > 0) {
					notifyWatchers(ext.watchers, ext.watchPrev, next)
				}
			} finally {
				ext.watchPrev = next
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Pool implementation
// ---------------------------------------------------------------------------

class MemoryStatePool {
	private _pool: PoolableMemoryState<number>[] = []
	private _config: Readonly<GjendjeConfig>
	private _hits = 0
	private _misses = 0

	constructor() {
		this._config = getConfig()
	}

	acquire(key: string, options: StateOptions<number>): PoolableMemoryState<number> {
		const pooled = this._pool.pop()

		if (pooled !== undefined) {
			this._hits++
			pooled._poolReset(key, '', options, this._config)

			return pooled
		}

		this._misses++

		return new PoolableMemoryState(key, '', options, this._config)
	}

	release(instance: PoolableMemoryState<number>): void {
		instance.destroy(this._pool)
	}

	get stats() {
		return { hits: this._hits, misses: this._misses, poolSize: this._pool.length }
	}

	/** Pre-warm the pool with N instances */
	prewarm(n: number): void {
		for (let i = 0; i < n; i++) {
			const inst = new PoolableMemoryState<number>('warmup', '', DUMMY_OPTIONS, this._config)

			this._pool.push(inst)
		}
	}
}

// ---------------------------------------------------------------------------
// Experiment C: Direct fields on MemoryStateImpl (no MemoryCore object)
//
// Instead of: this._c = { current, isDestroyed, listeners, notifyFn, ext }
// Store:      this._current, this._isDestroyed, this._listeners, etc.
//
// This eliminates one object allocation per instance creation (MemoryCore),
// and removes one level of property indirection on every get/set/subscribe.
//
// The hypothesis: saving one object allocation + eliminating one pointer
// dereference on every hot-path access gives measurable gain.
// ---------------------------------------------------------------------------

class DirectFieldsState<T> implements StateInstance<T> {
	readonly scope: 'memory' = 'memory'

	key: string
	private _rKey: string
	private _defaultValue: T
	private _options: StateOptions<T>
	private _config: Readonly<GjendjeConfig>

	// Fields formerly in MemoryCore, now directly on instance:
	private _current: T
	private _isDestroyed: boolean
	private _listeners: Set<Listener<T>> | undefined
	private _notifyFn: (() => void) | undefined
	private _ext: MemoryExtras<T> | undefined

	constructor(key: string, rKey: string, options: StateOptions<T>, config: Readonly<GjendjeConfig>) {
		this.key = key
		this._rKey = rKey
		this._defaultValue = options.default
		this._options = options
		this._config = config
		this._current = options.default
		this._isDestroyed = false
		this._listeners = undefined
		this._notifyFn = undefined
		this._ext = undefined
	}

	private _getExt(): MemoryExtras<T> {
		if (this._ext === undefined) this._ext = makeExt()

		return this._ext
	}

	get(): T {
		return this._current
	}

	peek(): T {
		return this._current
	}

	set(valueOrUpdater: T | ((prev: T) => T)): void {
		if (this._isDestroyed) return

		const prev = this._current

		let next =
			typeof valueOrUpdater === 'function'
				? (valueOrUpdater as (prev: T) => T)(prev)
				: valueOrUpdater

		const ext = this._ext

		if (ext !== undefined && ext.interceptors !== undefined && ext.interceptors.size > 0) {
			const original = next

			for (const interceptor of ext.interceptors) {
				next = interceptor(next, prev)
			}

			if (!Object.is(original, next)) {
				this._config.onIntercept?.({ key: this.key, scope: this.scope, original, intercepted: next })
			}
		}

		if (this._options.isEqual?.(next, prev)) return

		this._current = next

		if (this._notifyFn !== undefined) {
			notify(this._notifyFn)
		}

		if (ext !== undefined && ext.changeHandlers !== undefined && ext.changeHandlers.size > 0) {
			for (const hook of ext.changeHandlers) {
				safeCallChange(hook, next, prev)
			}
		}

		this._config.onChange?.({ key: this.key, scope: this.scope, value: next, previousValue: prev })
	}

	subscribe(listener: Listener<T>): Unsubscribe {
		if (!this._listeners) {
			const listeners = new Set<Listener<T>>()

			this._listeners = listeners
			this._notifyFn = () => {
				for (const l of listeners) {
					safeCall(l, this._current)
				}
			}
		}

		const set = this._listeners

		set.add(listener)

		return () => { set.delete(listener) }
	}

	reset(): void {
		if (this._isDestroyed) return

		const prev = this._current

		let next = this._defaultValue

		const ext = this._ext

		if (ext !== undefined && ext.interceptors !== undefined && ext.interceptors.size > 0) {
			const original = next

			for (const interceptor of ext.interceptors) {
				next = interceptor(next, prev)
			}

			if (!Object.is(original, next)) {
				this._config.onIntercept?.({ key: this.key, scope: this.scope, original, intercepted: next })
			}
		}

		if (this._options.isEqual?.(next, prev)) return

		this._current = next

		if (this._notifyFn !== undefined) {
			notify(this._notifyFn)
		}

		if (ext !== undefined && ext.changeHandlers !== undefined && ext.changeHandlers.size > 0) {
			for (const hook of ext.changeHandlers) {
				safeCallChange(hook, next, prev)
			}
		}

		this._config.onReset?.({ key: this.key, scope: this.scope, previousValue: prev })
		this._config.onChange?.({ key: this.key, scope: this.scope, value: next, previousValue: prev })
	}

	get ready(): Promise<void> { return RESOLVED }

	get settled(): Promise<void> { return RESOLVED }

	get hydrated(): Promise<void> { return RESOLVED }

	get isDestroyed(): boolean {
		return this._isDestroyed
	}

	get destroyed(): Promise<void> {
		if (this._isDestroyed) return RESOLVED

		const ext = this._getExt()

		if (!ext.destroyed) {
			ext.destroyed = new Promise<void>((resolve) => {
				ext.resolveDestroyed = resolve
			})
		}

		return ext.destroyed
	}

	intercept(fn: (next: T, prev: T) => T): Unsubscribe {
		const ext = this._getExt()

		if (!ext.interceptors) ext.interceptors = new Set()

		ext.interceptors.add(fn)

		return () => { ext.interceptors?.delete(fn) }
	}

	onChange(fn: (next: T, prev: T) => void): Unsubscribe {
		const ext = this._getExt()

		if (!ext.changeHandlers) ext.changeHandlers = new Set()

		ext.changeHandlers.add(fn)

		return () => { ext.changeHandlers?.delete(fn) }
	}

	watch<K extends T extends object ? keyof T : never>(
		watchKey: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe {
		const ext = this._getExt()

		if (!ext.watchers) ext.watchers = new Map()

		this._ensureWatchSubscription()

		return addWatcher(ext.watchers, watchKey, listener)
	}

	patch(partial: T extends object ? Partial<T> : never): void {
		this.set((prev) => ({ ...prev, ...partial }) as T)
	}

	destroy(): void {
		if (this._isDestroyed) return

		this._isDestroyed = true

		const ext = this._ext

		if (ext !== undefined) {
			ext.interceptors?.clear()
			ext.changeHandlers?.clear()
			ext.watchers?.clear()
			ext.watchUnsub?.()
		}

		this._listeners?.clear()
		this._notifyFn = undefined

		if (this._rKey) unregisterByKey(this._rKey)

		this._config.onDestroy?.({ key: this.key, scope: this.scope })

		if (ext?.resolveDestroyed) {
			ext.resolveDestroyed()
		} else if (ext !== undefined) {
			ext.destroyed = RESOLVED
		}
	}

	private _ensureWatchSubscription(): void {
		const ext = this._getExt()

		if (ext.watchUnsub) return

		ext.watchPrev = this._current

		ext.watchUnsub = this.subscribe((next) => {
			try {
				if (ext.watchers && ext.watchers.size > 0) {
					notifyWatchers(ext.watchers, ext.watchPrev, next)
				}
			} finally {
				ext.watchPrev = next
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Experiment D: String interning for scopedKey
//
// The registry key "memory:<key>" is computed each time with a fresh template
// literal. For repeated create/destroy with the same logical key, an intern
// cache avoids re-allocating the same string.
//
// In practice, React components often use the same key string across mounts.
// ---------------------------------------------------------------------------

const scopedKeyCache = new Map<string, string>()

function internedScopedKey(key: string): string {
	let cached = scopedKeyCache.get(key)

	if (cached === undefined) {
		cached = `memory:${key}`
		scopedKeyCache.set(key, cached)
	}

	return cached
}

function freshScopedKey(key: string): string {
	return `memory:${key}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const cfg = { time: 1000, warmupTime: 200 }

	console.log('='.repeat(72))
	console.log('  allocation-pooling: GC pressure & object allocation investigation')
	console.log('='.repeat(72))

	// -------------------------------------------------------------------------
	// Suite 1: Basic create+destroy — current API vs pooled vs direct-fields
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const pool = new MemoryStatePool()

		pool.prewarm(64) // pre-warm to steady state

		const config = getConfig()

		bench.add('current: state(key, opts).destroy()  [registry=true]', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)

			s.destroy()
		})

		bench.add('pooled: acquire + destroy→pool  [no-registry]', () => {
			const key = nextKey()
			const s = pool.acquire(key, DUMMY_OPTIONS)

			pool.release(s)
		})

		bench.add('direct-fields: new + destroy  [no-registry]', () => {
			const key = nextKey()
			const s = new DirectFieldsState(key, '', DUMMY_OPTIONS, config)

			s.destroy()
		})

		bench.add('poolable: new + destroy  [no-registry, MemoryCore obj]', () => {
			const key = nextKey()
			const s = new PoolableMemoryState(key, '', DUMMY_OPTIONS, config)

			s.destroy()
		})

		await bench.run()

		console.log('\n── Suite 1: create + destroy (no subscribers) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 2: Full lifecycle — subscribe + set + destroy
	// (More realistic React component pattern)
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const pool = new MemoryStatePool()

		pool.prewarm(64)

		const config = getConfig()

		bench.add('current: full lifecycle  [state() API]', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			s.destroy()
		})

		bench.add('pooled: full lifecycle  [pool + subscribe + set + release]', () => {
			const key = nextKey()
			const s = pool.acquire(key, DUMMY_OPTIONS)
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			pool.release(s)
		})

		bench.add('direct-fields: full lifecycle  [new + subscribe + set + destroy]', () => {
			const key = nextKey()
			const s = new DirectFieldsState(key, '', DUMMY_OPTIONS, config)
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			s.destroy()
		})

		await bench.run()

		console.log('\n── Suite 2: full lifecycle (subscribe + set + destroy) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 3: hot-path get/set throughput
	// (Measures whether direct-fields eliminates ._c indirection on get/set)
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const config = getConfig()

		const poolableInst = new PoolableMemoryState<number>('get-set-poolable', '', DUMMY_OPTIONS, config)
		const directInst = new DirectFieldsState<number>('get-set-direct', '', DUMMY_OPTIONS, config)
		const currentInst = state('get-set-current', DUMMY_OPTIONS)

		let i1 = 0
		let i2 = 0
		let i3 = 0

		bench.add('current MemoryStateImpl: get+set throughput', () => {
			currentInst.set(++i1)
			currentInst.get()
		})

		bench.add('poolable (MemoryCore obj): get+set throughput', () => {
			poolableInst.set(++i2)
			poolableInst.get()
		})

		bench.add('direct-fields (no MemoryCore): get+set throughput', () => {
			directInst.set(++i3)
			directInst.get()
		})

		await bench.run()

		console.log('\n── Suite 3: get+set throughput (no listeners) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 4: get/set throughput WITH subscriber
	// (notify path exercises _notifyFn / _c.notifyFn)
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const config = getConfig()

		const poolableInst = new PoolableMemoryState<number>('notif-poolable', '', DUMMY_OPTIONS, config)
		const directInst = new DirectFieldsState<number>('notif-direct', '', DUMMY_OPTIONS, config)
		const currentInst = state('notif-current', DUMMY_OPTIONS)

		poolableInst.subscribe(() => {})
		directInst.subscribe(() => {})
		currentInst.subscribe(() => {})

		let i1 = 0
		let i2 = 0
		let i3 = 0

		bench.add('current MemoryStateImpl: set+notify throughput', () => {
			currentInst.set(++i1)
		})

		bench.add('poolable (MemoryCore obj): set+notify throughput', () => {
			poolableInst.set(++i2)
		})

		bench.add('direct-fields (no MemoryCore): set+notify throughput', () => {
			directInst.set(++i3)
		})

		await bench.run()

		console.log('\n── Suite 4: set+notify throughput (1 subscriber) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 5: GC stress — 100K create+destroy cycles, measured as bulk time
	//
	// This exercises how GC pauses accumulate. We run each variant in a tight
	// loop and measure total elapsed wall time (not tinybench ops/s, which
	// excludes GC). tinybench still runs it for consistent comparison; the
	// "avg ms" column captures GC-inclusive time per iteration.
	// -------------------------------------------------------------------------
	{
		const BULK = 100_000

		const bench = new Bench({ time: 2000, warmupTime: 300 })

		const pool = new MemoryStatePool()
		const config = getConfig()

		let bulkKey1 = 0
		let bulkKey2 = 0
		let bulkKey3 = 0

		bench.add(`current: create+destroy ×${BULK}`, () => {
			for (let i = 0; i < BULK; i++) {
				const s = state(`bulk-curr-${bulkKey1++}`, DUMMY_OPTIONS)

				s.destroy()
			}
		})

		bench.add(`pooled: acquire+release ×${BULK}  [steady-state pool]`, () => {
			for (let i = 0; i < BULK; i++) {
				const s = pool.acquire(`bulk-pool-${bulkKey2++}`, DUMMY_OPTIONS)

				pool.release(s)
			}
		})

		bench.add(`direct-fields: new+destroy ×${BULK}  [no registry]`, () => {
			for (let i = 0; i < BULK; i++) {
				const s = new DirectFieldsState(`bulk-dir-${bulkKey3++}`, '', DUMMY_OPTIONS, config)

				s.destroy()
			}
		})

		await bench.run()

		console.log(`\n── Suite 5: GC stress — ${BULK.toLocaleString()} create+destroy iterations ──`)
		console.log('  (lower avg ms = less GC pause impact)')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 6: String interning for scopedKey
	//
	// Simulates repeated mount/unmount of the SAME React component key.
	// The intern cache reuses the already-allocated "memory:<key>" string.
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		// Fixed key — simulates same component re-mounting
		const fixedKey = 'user-count'

		// Unique key — simulates different keys every time (no cache benefit)
		let uniqueIdx = 0

		bench.add('scopedKey: fresh template literal  [generic]', () => {
			const rk = scopedKey(fixedKey, 'memory')

			void rk
		})

		bench.add('scopedKey: fresh memory: prefix  [memory-specific]', () => {
			const rk = freshScopedKey(fixedKey)

			void rk
		})

		bench.add('scopedKey: interned cache hit  [same key repeated]', () => {
			const rk = internedScopedKey(fixedKey)

			void rk
		})

		bench.add('scopedKey: interned cache miss  [unique key each time]', () => {
			const rk = internedScopedKey(`key-${uniqueIdx++}`)

			void rk
		})

		await bench.run()

		console.log('\n── Suite 6: scopedKey string allocation strategies ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 7: Pool warm-up vs cold-start
	// (Measures how quickly the pool reaches steady state & how it performs
	// when pool is empty = cold vs full = warm)
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const config = getConfig()

		bench.add('pool COLD: no pre-warm (all misses)', () => {
			// Fresh empty pool every iteration
			const coldPool = new MemoryStatePool()
			const key = nextKey()
			const s = coldPool.acquire(key, DUMMY_OPTIONS)

			coldPool.release(s)
		})

		const warmPool = new MemoryStatePool()

		warmPool.prewarm(128)

		bench.add('pool WARM: pre-warmed 128  (all hits)', () => {
			const key = nextKey()
			const s = warmPool.acquire(key, DUMMY_OPTIONS)

			warmPool.release(s)
		})

		bench.add('pool WARM: prewarm(1) steady-state  (size 1)', () => {
			// Pool toggles between 0 and 1 — every other op is a miss/hit
			// biome-ignore lint/suspicious/noExplicitAny: pool is for benchmark
			const tinyPool: PoolableMemoryState<any>[] = []
			const key = nextKey()
			const s = new PoolableMemoryState<number>(key, '', DUMMY_OPTIONS, config)

			s.destroy(tinyPool)

			const s2 = tinyPool.pop()

			if (s2) {
				s2._poolReset(nextKey(), '', DUMMY_OPTIONS, config)
				s2.destroy(tinyPool)
			}
		})

		await bench.run()

		console.log('\n── Suite 7: pool cold vs warm start ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 8: MemoryCore allocation micro-benchmark
	// (Isolates the cost of allocating the MemoryCore object itself)
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		bench.add('MemoryCore: allocate 5-field object literal', () => {
			const c: MemoryCore<number> = {
				current: 0,
				isDestroyed: false,
				listeners: undefined,
				notifyFn: undefined,
				ext: undefined,
			}

			void c.current
		})

		bench.add('MemoryCore: allocate + immediate property access (._c.current pattern)', () => {
			const wrapper = { _c: {
				current: 0,
				isDestroyed: false,
				listeners: undefined,
				notifyFn: undefined,
				ext: undefined,
			} as MemoryCore<number> }

			void wrapper._c.current
		})

		bench.add('direct: no MemoryCore, direct field on instance', () => {
			const wrapper = {
				_current: 0,
				_isDestroyed: false,
				_listeners: undefined as Set<Listener<number>> | undefined,
				_notifyFn: undefined as (() => void) | undefined,
				_ext: undefined as MemoryExtras<number> | undefined,
			}

			void wrapper._current
		})

		await bench.run()

		console.log('\n── Suite 8: MemoryCore allocation micro-benchmark ──')
		printResults(bench)
	}

	// Print pool stats for reference
	console.log('='.repeat(72))
	console.log('  Done.')
	console.log('='.repeat(72))
}

main().catch(console.error)
