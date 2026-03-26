/**
 * lifecycle-experiment.bench.ts
 *
 * Investigates breakthrough-level optimizations for MemoryStateImpl creation overhead.
 *
 * Experiments:
 *   1. Standalone class (no inheritance) vs current MemoryStateImpl (extends StateImpl)
 *   2. MemoryCore shapes: current 5-field object vs lazy prototype-based approach
 *   3. Pre-computed "memory:" prefix string vs `${scope}:${key}` concatenation
 *   4. getConfig() module-level read — cached local vs repeated call
 *
 * Run with: tsx benchmarks/lifecycle-experiment.bench.ts
 */

import { Bench } from 'tinybench'
import type { GjendjeConfig } from '../src/config.js'
import { getConfig } from '../src/config.js'
import { notify } from '../src/batch.js'
import { safeCall, safeCallChange } from '../src/listeners.js'
import { addWatcher, notifyWatchers } from '../src/watchers.js'
import { scopedKey, unregisterByKey } from '../src/registry.js'
import type { Listener, StateInstance, StateOptions, Unsubscribe } from '../src/types.js'
import { RESOLVED } from '../src/utils.js'
import { printResults, benchConfig } from './helpers.js'

// ---------------------------------------------------------------------------
// Shared plumbing (mirrors what createBase/MemoryStateImpl use internally)
// ---------------------------------------------------------------------------

let keyCounter = 0

function nextKey(): string {
	return `exp-${keyCounter++}`
}

const DUMMY_OPTIONS: StateOptions<number> = { default: 0 }
const DUMMY_OPTIONS_OBJ: StateOptions<{ x: number }> = { default: { x: 0 } }

// ---------------------------------------------------------------------------
// Experiment 1: Standalone class vs inheritance
//
// The current MemoryStateImpl extends StateImpl and calls super() which sets
// 7 properties (key, scope, _rKey, _adapter, _defaultValue, _options, _config,
// _s) even though _adapter and _s are never used by MemoryStateImpl methods.
//
// A standalone class that directly implements StateInstance avoids:
//   - The super() call itself (function call overhead)
//   - Setting _adapter (MEMORY_SHIM ref write)
//   - Setting _s (MEMORY_MUTABLE_SHIM ref write)
//   - V8's hidden-class transition for StateImpl properties before MemoryStateImpl
//     can add its own _c field
// ---------------------------------------------------------------------------

interface MemoryCore<T> {
	current: T
	isDestroyed: boolean
	listeners: Set<Listener<T>> | undefined
	notifyFn: (() => void) | undefined
	ext: MemoryExtras<T> | undefined
}

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

function getExt<T>(c: MemoryCore<T>): MemoryExtras<T> {
	if (c.ext === undefined) c.ext = makeExt()

	return c.ext
}

/**
 * STANDALONE: Implements StateInstance directly with no class inheritance.
 * All properties are laid out in one shot — no super() call, no transition
 * through StateImpl's hidden class.
 */
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

		return () => {
			ext.interceptors?.delete(fn)
		}
	}

	onChange(fn: (next: T, prev: T) => void): Unsubscribe {
		const ext = getExt(this._c)

		if (!ext.changeHandlers) ext.changeHandlers = new Set()

		ext.changeHandlers.add(fn)

		return () => {
			ext.changeHandlers?.delete(fn)
		}
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
// Experiment 2: MemoryCore shapes
//
// Current: plain object literal with 5 explicitly-initialized own properties.
// Prototype approach: create object from a prototype that holds undefined
// field stubs — new own properties are written only when values differ from
// undefined. Reduces initial object allocation by skipping 3 undefined slots.
// ---------------------------------------------------------------------------

// Prototype-based MemoryCore — undefined fields live on the prototype,
// so newly created objects have only `current` and `isDestroyed` as own props.
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

// Flat 5-field inline object (current production approach)
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
// Experiment 3: Pre-computed "memory:" prefix vs template literal concat
//
// scopedKey() in registry.ts does: `${scope}:${key}`
// For memory scope, scope is always "memory", so we can pre-concatenate.
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
// Experiment 4: getConfig() call cost
//
// getConfig() is a trivial module-level variable read. Can caching it in a
// local const before the loop matter?
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
// Import current MemoryStateImpl via createBase pathway
// (we proxy through state() to get MemoryStateImpl instances for comparison)
// ---------------------------------------------------------------------------

import { state } from '../src/index.js'

// ---------------------------------------------------------------------------
// Run benchmarks
// ---------------------------------------------------------------------------

async function main() {
	const config = { time: benchConfig.time, warmupTime: benchConfig.warmupTime }

	console.log('='.repeat(70))
	console.log('  lifecycle-experiment: MemoryStateImpl creation overhead investigation')
	console.log('='.repeat(70))

	// -------------------------------------------------------------------------
	// Suite 1: Inheritance vs Standalone — create + destroy cycle
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		bench.add('current: MemoryStateImpl (extends StateImpl) create+destroy', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)

			s.destroy()
		})

		bench.add('experiment: StandaloneMemoryState (no inheritance) create+destroy', () => {
			const key = nextKey()
			const cfg = getConfig()
			const s = new StandaloneMemoryState(key, '', DUMMY_OPTIONS, cfg)

			s.destroy()
		})

		await bench.run()

		console.log('\n── Experiment 1: Inheritance vs Standalone (create + destroy) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 2: Inheritance vs Standalone — full lifecycle
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		bench.add('current: MemoryStateImpl full lifecycle', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			s.destroy()
		})

		bench.add('experiment: StandaloneMemoryState full lifecycle', () => {
			const key = nextKey()
			const cfg = getConfig()
			const s = new StandaloneMemoryState(key, '', DUMMY_OPTIONS, cfg)
			const unsub = s.subscribe(() => {})

			s.set(42)
			unsub()
			s.destroy()
		})

		await bench.run()

		console.log('\n── Experiment 1b: Inheritance vs Standalone (full lifecycle) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 3: Standalone — with get+set read throughput
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		const cfg = getConfig()

		const current = state(nextKey(), DUMMY_OPTIONS)
		const standalone = new StandaloneMemoryState<number>(nextKey(), '', DUMMY_OPTIONS, cfg)

		let i1 = 0
		let i2 = 0

		bench.add('current: MemoryStateImpl get+set (no registry)', () => {
			current.set(++i1)
			current.get()
		})

		bench.add('experiment: StandaloneMemoryState get+set', () => {
			standalone.set(++i2)
			standalone.get()
		})

		await bench.run()

		console.log('\n── Experiment 1c: Inheritance vs Standalone (get+set throughput) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 4: MemoryCore shape — flat literal vs prototype-based
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		bench.add('MemoryCore: flat object literal (5 own props)', () => {
			const c = makeCoreFlat(0)

			void c.current
		})

		bench.add('MemoryCore: prototype-based (2 own + 3 inherited)', () => {
			const c = makeCoreCurrent(0)

			void c.current
		})

		await bench.run()

		console.log('\n── Experiment 2: MemoryCore shape (allocation) ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 5: Scoped key construction strategies
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		const key = 'my-test-key'

		bench.add('scopedKey: generic template literal (${scope}:${key})', () => {
			const rk = scopedKeyGeneric(key)

			void rk
		})

		bench.add('scopedKey: memory-specific template literal (memory:${key})', () => {
			const rk = scopedKeyConcat(key)

			void rk
		})

		bench.add('scopedKey: pre-computed prefix + string concat (MEMORY_PREFIX + key)', () => {
			const rk = scopedKeyPrecomputed(key)

			void rk
		})

		await bench.run()

		console.log('\n── Experiment 3: scopedKey strategies ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 6: getConfig() repeated call vs cached
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		bench.add('getConfig(): call 1000× in loop (repeated)', () => {
			createWithRepeatedGetConfig(1000)
		})

		bench.add('getConfig(): call once, cache in local var (1000 iterations)', () => {
			createWithCachedConfig(1000)
		})

		// Single-call comparison
		bench.add('getConfig(): single call', () => {
			const cfg = getConfig()

			void cfg
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
	// Suite 7: Combined hot-path simulation — what createBase actually does
	// for a new memory-scoped instance (registry=false path for isolation)
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		// Simulate the full memory creation hot-path steps
		bench.add('hot-path: current (state() + destroy)', () => {
			const s = state(nextKey(), DUMMY_OPTIONS)

			s.destroy()
		})

		bench.add('hot-path: standalone + pre-computed key + cached config', () => {
			const cfg = getConfig()
			const key = nextKey()
			const rKey = MEMORY_PREFIX + key
			const s = new StandaloneMemoryState(key, rKey, DUMMY_OPTIONS, cfg)

			s.destroy()
		})

		bench.add('hot-path: standalone + no registry (empty rKey)', () => {
			const cfg = getConfig()
			const key = nextKey()
			const s = new StandaloneMemoryState(key, '', DUMMY_OPTIONS, cfg)

			s.destroy()
		})

		await bench.run()

		console.log('\n── Experiment 7: Combined hot-path simulation ──')
		printResults(bench)
	}

	// -------------------------------------------------------------------------
	// Suite 8: Property layout — how many own props affect construction speed
	// -------------------------------------------------------------------------
	{
		const bench = new Bench(config)

		// Baseline: minimal object (just value)
		bench.add('object layout: 1 own prop (current only)', () => {
			const c = { current: 0 }

			void c
		})

		bench.add('object layout: 2 own props (current + isDestroyed)', () => {
			const c = { current: 0, isDestroyed: false }

			void c
		})

		bench.add('object layout: 5 own props (full MemoryCore)', () => {
			const c = { current: 0, isDestroyed: false, listeners: undefined, notifyFn: undefined, ext: undefined }

			void c
		})

		bench.add('object layout: 7 own props (StateImpl fields)', () => {
			const c = {
				key: 'k',
				scope: 'memory',
				_rKey: 'memory:k',
				_adapter: null,
				_defaultValue: 0,
				_options: DUMMY_OPTIONS,
				_config: {},
			}

			void c
		})

		bench.add('object layout: 8 own props (StateImpl + _s shim)', () => {
			const c = {
				key: 'k',
				scope: 'memory',
				_rKey: 'memory:k',
				_adapter: null,
				_defaultValue: 0,
				_options: DUMMY_OPTIONS,
				_config: {},
				_s: null,
			}

			void c
		})

		bench.add('object layout: 9 own props (MemoryStateImpl: 8 + _c)', () => {
			const c = {
				key: 'k',
				scope: 'memory',
				_rKey: 'memory:k',
				_adapter: null,
				_defaultValue: 0,
				_options: DUMMY_OPTIONS,
				_config: {},
				_s: null,
				_c: null,
			}

			void c
		})

		bench.add('object layout: 6 own props (StandaloneMemoryState: no _adapter/_s)', () => {
			const c = {
				key: 'k',
				scope: 'memory',
				_rKey: 'memory:k',
				_defaultValue: 0,
				_options: DUMMY_OPTIONS,
				_config: {},
			}

			void c
		})

		await bench.run()

		console.log('\n── Experiment 8: Object property layout allocation cost ──')
		printResults(bench)
	}

	console.log('='.repeat(70))
	console.log('  Done.')
	console.log('='.repeat(70))
}

main().catch(console.error)
