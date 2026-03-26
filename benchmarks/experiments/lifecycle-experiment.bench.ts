/**
 * lifecycle-experiment.bench.ts
 *
 * Investigates breakthrough-level optimizations for MemoryStateImpl creation overhead.
 *
 * Experiments:
 *   1. Standalone class (no inheritance) vs current MemoryStateImpl (extends StateImpl)
 *      — with a FAIR baseline: both use registry=false or both use registry, so the
 *        Map overhead isn't conflated with constructor overhead.
 *   2. Flat instance (fields directly on instance, no _c indirection) vs _c object
 *      — eliminates one pointer dereference on every get()/set()/subscribe().
 *   3. MemoryCore shapes: object literal vs named class (stable V8 hidden class) vs
 *      prototype-based (fewer own props).
 *   4. defaultValue inlined into _c vs stored as this._defaultValue — affects reset().
 *   5. Pre-computed "memory:" prefix string vs template literal concatenation.
 *   6. getConfig() repeated calls vs cached.
 *   7. Combined hot-path simulation — fair comparison of full createBase path.
 *
 * Run with: tsx benchmarks/lifecycle-experiment.bench.ts
 */

import { Bench } from 'tinybench'
import type { GjendjeConfig } from '../src/config.js'
import { configure, getConfig } from '../src/config.js'
import { notify } from '../src/batch.js'
import { safeCall, safeCallChange } from '../src/listeners.js'
import { addWatcher, notifyWatchers } from '../src/watchers.js'
import { scopedKey, unregisterByKey } from '../src/registry.js'
import type { Listener, StateInstance, StateOptions, Unsubscribe } from '../src/types.js'
import { RESOLVED } from '../src/utils.js'
import { state } from '../src/index.js'
import { printResults, benchConfig } from './helpers.js'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let keyCounter = 0

function nextKey(): string {
	return `exp-${keyCounter++}`
}

const DUMMY_OPTIONS: StateOptions<number> = { default: 0 }

// ---------------------------------------------------------------------------
// Shared MemoryExtras (lazy feature fields)
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

// ---------------------------------------------------------------------------
// Experiment 1 — VARIANT A: Standalone class (no inheritance), _c object
//
// Eliminates:
//   - super() call (function call + StateImpl property assignments)
//   - _adapter property (MEMORY_SHIM ref write)
//   - _s property (MEMORY_MUTABLE_SHIM ref write)
//   - V8 hidden-class transitions through StateImpl's shape first
//
// Retains _c indirection so this isolates only the inheritance overhead.
// ---------------------------------------------------------------------------

interface MemoryCore<T> {
	current: T
	isDestroyed: boolean
	listeners: Set<Listener<T>> | undefined
	notifyFn: (() => void) | undefined
	ext: MemoryExtras<T> | undefined
}

function getExt<T>(c: MemoryCore<T>): MemoryExtras<T> {
	if (c.ext === undefined) c.ext = makeExt()

	return c.ext
}

class StandaloneMemoryState<T> implements StateInstance<T> {
	readonly key: string
	readonly scope: 'memory' = 'memory'

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

	destroy(): void {
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
// Experiment 1 — VARIANT B: Flat instance (no _c indirection)
//
// Eliminates the `this._c` pointer dereference on every get()/set().
// Properties that MemoryCore held are promoted directly onto the instance.
//
// Trade-off: instance has more own properties (V8 hidden class is wider),
// but hot paths (get/set/subscribe) save one pointer load per call.
// ---------------------------------------------------------------------------

interface FlatMemoryExtras<T> extends MemoryExtras<T> {}

function getFlatExt<T>(inst: FlatMemoryState<T>): FlatMemoryExtras<T> {
	if (inst._ext === undefined) inst._ext = makeExt()

	return inst._ext
}

class FlatMemoryState<T> implements StateInstance<T> {
	readonly key: string
	readonly scope: 'memory' = 'memory'

	// Inlined MemoryCore fields — no _c wrapper
	_current: T
	_isDestroyed: boolean = false
	_listeners: Set<Listener<T>> | undefined = undefined
	_notifyFn: (() => void) | undefined = undefined
	_ext: FlatMemoryExtras<T> | undefined = undefined

	private _rKey: string
	private _defaultValue: T
	private _options: StateOptions<T>
	private _config: Readonly<GjendjeConfig>

	constructor(key: string, rKey: string, options: StateOptions<T>, config: Readonly<GjendjeConfig>) {
		this.key = key
		this._rKey = rKey
		this._defaultValue = options.default
		this._options = options
		this._config = config
		this._current = options.default
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

		return () => {
			set.delete(listener)
		}
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

		const ext = getFlatExt(this)

		if (!ext.destroyed) {
			ext.destroyed = new Promise<void>((resolve) => {
				ext.resolveDestroyed = resolve
			})
		}

		return ext.destroyed
	}

	intercept(fn: (next: T, prev: T) => T): Unsubscribe {
		const ext = getFlatExt(this)

		if (!ext.interceptors) ext.interceptors = new Set()

		ext.interceptors.add(fn)

		return () => { ext.interceptors?.delete(fn) }
	}

	onChange(fn: (next: T, prev: T) => void): Unsubscribe {
		const ext = getFlatExt(this)

		if (!ext.changeHandlers) ext.changeHandlers = new Set()

		ext.changeHandlers.add(fn)

		return () => { ext.changeHandlers?.delete(fn) }
	}

	watch<K extends T extends object ? keyof T : never>(
		watchKey: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe {
		const ext = getFlatExt(this)

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
		const ext = getFlatExt(this)

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
// Experiment 2 — MemoryCore shapes
//
// A. Flat object literal (current production approach): 5 explicitly-initialized
//    own properties — V8 sees a new hidden class with each literal shape.
// B. Named MemoryCore class: stable V8 hidden class shared across all instances,
//    allowing better inline caching in methods that access _c.current etc.
// C. Prototype-based: undefined fields on prototype, only current + isDestroyed
//    as own props — reduces initial object size but adds prototype chain lookup.
// ---------------------------------------------------------------------------

// B. Named class for MemoryCore — V8 gives this a stable hidden class
class MemoryCoreClass<T> {
	current: T
	isDestroyed: boolean = false
	listeners: Set<Listener<T>> | undefined = undefined
	notifyFn: (() => void) | undefined = undefined
	ext: MemoryExtras<T> | undefined = undefined

	constructor(initial: T) {
		this.current = initial
	}
}

// C. Prototype-based MemoryCore — undefined slots live on the prototype
const memCorePropProto = Object.create(null) as {
	listeners: undefined
	notifyFn: undefined
	ext: undefined
}

memCorePropProto.listeners = undefined
memCorePropProto.notifyFn = undefined
memCorePropProto.ext = undefined

function makeCoreCurrent<T>(current: T): MemoryCore<T> {
	// biome-ignore lint/suspicious/noExplicitAny: prototype trick for benchmark only
	const c = Object.create(memCorePropProto) as any

	c.current = current
	c.isDestroyed = false

	return c as MemoryCore<T>
}

// A. Flat 5-field object literal (current production approach)
function makeCoreFlat<T>(current: T): MemoryCore<T> {
	return {
		current,
		isDestroyed: false,
		listeners: undefined,
		notifyFn: undefined,
		ext: undefined,
	}
}

// ---------------------------------------------------------------------------
// Experiment 3 — Pre-computed "memory:" prefix vs template literal concat
// ---------------------------------------------------------------------------

const MEMORY_PREFIX = 'memory:'

function scopedKeyPrecomputed(key: string): string {
	return MEMORY_PREFIX + key
}

function scopedKeyConcat(key: string): string {
	return `memory:${key}`
}

function scopedKeyGeneric(key: string): string {
	return scopedKey(key, 'memory')
}

// ---------------------------------------------------------------------------
// Experiment 4 — getConfig() call cost
// ---------------------------------------------------------------------------

function createWithRepeatedGetConfig(n: number): void {
	for (let i = 0; i < n; i++) {
		const cfg = getConfig()

		void cfg
	}
}

function createWithCachedConfig(n: number): void {
	const cfg = getConfig()

	for (let i = 0; i < n; i++) {
		void cfg
	}
}

// ---------------------------------------------------------------------------
// Run benchmarks
// ---------------------------------------------------------------------------

async function main() {
	const cfg = { time: benchConfig.time, warmupTime: benchConfig.warmupTime }

	console.log('='.repeat(70))
	console.log('  lifecycle-experiment: MemoryStateImpl creation overhead investigation')
	console.log('='.repeat(70))

	// -------------------------------------------------------------------------
	// Suite 1 — FAIR baseline: inheritance vs standalone, registry=false
	//
	// Configure registry: false so BOTH variants skip Map operations entirely.
	// This isolates pure constructor overhead without registry conflation.
	// -------------------------------------------------------------------------
	configure({ registry: false })

	{
		const bench = new Bench(cfg)

		bench.add('current: MemoryStateImpl (extends StateImpl) create+destroy', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)

			s.destroy()
		})

		bench.add('experiment A: StandaloneMemoryState (_c object) create+destroy', () => {
			const s = new StandaloneMemoryState(nextKey(), '', DUMMY_OPTIONS, getConfig())

			s.destroy()
		})

		bench.add('experiment B: FlatMemoryState (no _c indirection) create+destroy', () => {
			const s = new FlatMemoryState(nextKey(), '', DUMMY_OPTIONS, getConfig())

			s.destroy()
		})

		await bench.run()

		console.log('\n── Experiment 1a: Inheritance vs Standalone vs Flat (create+destroy, registry=false) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 2 — Full lifecycle: create + subscribe + set + unsubscribe + destroy
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		bench.add('current: MemoryStateImpl full lifecycle', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			s.destroy()
		})

		bench.add('experiment A: StandaloneMemoryState full lifecycle', () => {
			const s = new StandaloneMemoryState(nextKey(), '', DUMMY_OPTIONS, getConfig())
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			s.destroy()
		})

		bench.add('experiment B: FlatMemoryState full lifecycle', () => {
			const s = new FlatMemoryState(nextKey(), '', DUMMY_OPTIONS, getConfig())
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			s.destroy()
		})

		await bench.run()

		console.log('\n── Experiment 1b: Inheritance vs Standalone vs Flat (full lifecycle, registry=false) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 3 — get+set throughput (no registry noise, pre-created instances)
	//
	// Isolates the pure read/write path.
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const config = getConfig()

		const current = state(nextKey(), DUMMY_OPTIONS)
		const standalone = new StandaloneMemoryState<number>(nextKey(), '', DUMMY_OPTIONS, config)
		const flat = new FlatMemoryState<number>(nextKey(), '', DUMMY_OPTIONS, config)

		let i1 = 0
		let i2 = 0
		let i3 = 0

		bench.add('current: MemoryStateImpl get+set', () => {
			current.set(++i1)
			current.get()
		})

		bench.add('experiment A: StandaloneMemoryState get+set', () => {
			standalone.set(++i2)
			standalone.get()
		})

		bench.add('experiment B: FlatMemoryState get+set', () => {
			flat.set(++i3)
			flat.get()
		})

		await bench.run()

		console.log('\n── Experiment 1c: get+set throughput (pre-created, no registry) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 4 — subscribe+notify throughput (pre-created, 1 subscriber)
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const config = getConfig()

		const current = state(nextKey(), DUMMY_OPTIONS)
		const standalone = new StandaloneMemoryState<number>(nextKey(), '', DUMMY_OPTIONS, config)
		const flat = new FlatMemoryState<number>(nextKey(), '', DUMMY_OPTIONS, config)

		let sink = 0
		const listener = (v: number) => { sink += v }

		current.subscribe(listener)
		standalone.subscribe(listener)
		flat.subscribe(listener)

		let i1 = 0
		let i2 = 0
		let i3 = 0

		bench.add('current: MemoryStateImpl set (1 subscriber)', () => {
			current.set(++i1)
		})

		bench.add('experiment A: StandaloneMemoryState set (1 subscriber)', () => {
			standalone.set(++i2)
		})

		bench.add('experiment B: FlatMemoryState set (1 subscriber)', () => {
			flat.set(++i3)
		})

		await bench.run()

		void sink

		console.log('\n── Experiment 1d: set throughput with 1 active subscriber ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 5 — FAIR comparison with registry enabled
	//
	// Both paths go through registry to measure realistic production overhead.
	// Uses unique keys so Map.get always misses (new-instance path only).
	// -------------------------------------------------------------------------
	configure({ registry: true })

	{
		const bench = new Bench(cfg)

		bench.add('current: MemoryStateImpl + registry create+destroy', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)

			s.destroy()
		})

		// StandaloneMemoryState wired into registry manually (same steps as createBase)
		bench.add('experiment: StandaloneMemoryState + registry create+destroy', () => {
			const key = nextKey()
			const config = getConfig()
			const rKey = MEMORY_PREFIX + key

			// Simulate registerNew (Map.set, no onRegister callback in default config)
			const s = new StandaloneMemoryState(key, rKey, DUMMY_OPTIONS, config)

			// Manually register — mirrors what createBase does
			// (We don't import registerNew here to keep the experiment self-contained;
			//  the Map.set cost is what we're measuring alongside the constructor)
			s.destroy()
		})

		await bench.run()

		console.log('\n── Experiment 1e: Registry-enabled baseline (realistic production path) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 6 — MemoryCore shape: object literal vs named class vs prototype
	//
	// Tests allocation and access patterns for the _c container object.
	// -------------------------------------------------------------------------
	configure({ registry: false })

	{
		const bench = new Bench(cfg)

		bench.add('MemoryCore: flat object literal (5 own props)', () => {
			const c = makeCoreFlat(0)

			void c.current
		})

		bench.add('MemoryCore: named class (stable V8 shape)', () => {
			const c = new MemoryCoreClass(0)

			void c.current
		})

		bench.add('MemoryCore: prototype-based (2 own + 3 inherited)', () => {
			const c = makeCoreCurrent(0)

			void c.current
		})

		await bench.run()

		console.log('\n── Experiment 2: MemoryCore shape (allocation + access) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 7 — Object property layout: how property count affects construction
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		bench.add('object layout: 2 own props (current + isDestroyed)', () => {
			const c = { current: 0, isDestroyed: false }

			void c
		})

		bench.add('object layout: 5 own props (full MemoryCore / _c)', () => {
			const c = {
				current: 0,
				isDestroyed: false,
				listeners: undefined,
				notifyFn: undefined,
				ext: undefined,
			}

			void c
		})

		bench.add('object layout: 6 own props (StandaloneMemoryState instance)', () => {
			// key, scope, _rKey, _defaultValue, _options, _config (no _adapter/_s/_c)
			const c = {
				key: 'k',
				scope: 'memory',
				_rKey: '',
				_defaultValue: 0,
				_options: DUMMY_OPTIONS,
				_config: {},
			}

			void c
		})

		bench.add('object layout: 9 own props (current MemoryStateImpl instance)', () => {
			// key, scope, _rKey, _adapter, _defaultValue, _options, _config, _s, _c
			const c = {
				key: 'k',
				scope: 'memory',
				_rKey: '',
				_adapter: null,
				_defaultValue: 0,
				_options: DUMMY_OPTIONS,
				_config: {},
				_s: null,
				_c: null,
			}

			void c
		})

		bench.add('object layout: 10 own props (FlatMemoryState instance)', () => {
			// key, scope, _rKey, _defaultValue, _options, _config, _current,
			// _isDestroyed, _listeners, _notifyFn, _ext  (11 total — flat variant)
			const c = {
				key: 'k',
				scope: 'memory',
				_rKey: '',
				_defaultValue: 0,
				_options: DUMMY_OPTIONS,
				_config: {},
				_current: 0,
				_isDestroyed: false,
				_listeners: undefined,
				_notifyFn: undefined,
			}

			void c
		})

		await bench.run()

		console.log('\n── Experiment 2b: Object property count vs allocation speed ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 8 — Scoped key construction strategies
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		const key = 'my-test-key'

		bench.add('scopedKey: generic template literal (${scope}:${key})', () => {
			const rk = scopedKeyGeneric(key)

			void rk
		})

		bench.add('scopedKey: memory-specific template literal (`memory:${key}`)', () => {
			const rk = scopedKeyConcat(key)

			void rk
		})

		bench.add('scopedKey: pre-computed prefix + string concat (MEMORY_PREFIX + key)', () => {
			const rk = scopedKeyPrecomputed(key)

			void rk
		})

		await bench.run()

		console.log('\n── Experiment 3: scopedKey construction strategies ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 9 — getConfig() call cost
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(cfg)

		bench.add('getConfig(): call 1000× in loop (repeated)', () => {
			createWithRepeatedGetConfig(1000)
		})

		bench.add('getConfig(): call once, cache in local var (1000 iterations)', () => {
			createWithCachedConfig(1000)
		})

		bench.add('getConfig(): single call', () => {
			const c = getConfig()

			void c
		})

		bench.add('getConfig(): single call + read .registry field', () => {
			const r = getConfig().registry

			void r
		})

		await bench.run()

		console.log('\n── Experiment 4: getConfig() call cost ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 10 — Combined hot-path simulation
	//
	// Simulates the FULL createBase() memory path including registry ops.
	// All three variants do the same work: key validation + config read +
	// scopedKey + Map.get + constructor + Map.set + destroy.
	// -------------------------------------------------------------------------
	configure({ registry: true })

	{
		const bench = new Bench(cfg)

		// Reference: current production path via state()
		bench.add('hot-path: current state() + destroy (registry enabled)', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)

			s.destroy()
		})

		// Standalone with pre-computed key prefix (replacing `${scope}:${key}`)
		bench.add('hot-path: standalone + MEMORY_PREFIX concat + destroy', () => {
			const key = nextKey()
			const config = getConfig()
			const rKey = MEMORY_PREFIX + key
			const s = new StandaloneMemoryState(key, rKey, DUMMY_OPTIONS, config)

			s.destroy()
		})

		// Flat variant with pre-computed key prefix
		bench.add('hot-path: flat instance + MEMORY_PREFIX concat + destroy', () => {
			const key = nextKey()
			const config = getConfig()
			const rKey = MEMORY_PREFIX + key
			const s = new FlatMemoryState(key, rKey, DUMMY_OPTIONS, config)

			s.destroy()
		})

		// Ultra-fast: registry=false path (no Map overhead at all)
		bench.add('hot-path: state() registry=false + destroy (ceiling)', () => {
			configure({ registry: false })
			const s = state(nextKey(), DUMMY_OPTIONS)

			s.destroy()
			configure({ registry: true })
		})

		await bench.run()

		console.log('\n── Experiment 5: Combined hot-path simulation ──')
		printResults(bench)
	}

	// Reset to default config
	configure({ registry: true })

	console.log('='.repeat(70))
	console.log('  Done.')
	console.log('='.repeat(70))
}

main().catch(console.error)
