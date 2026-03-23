import { createBucketAdapter } from './adapters/bucket.js'
import { createMemoryAdapter } from './adapters/memory.js'
import { createStorageAdapter } from './adapters/storage.js'
import { withSync } from './adapters/sync.js'
import { createUrlAdapter } from './adapters/url.js'
import { notify } from './batch.js'
import type { GjendjeConfig } from './config.js'
import { getConfig, log, reportError } from './config.js'
import { safeCall } from './listeners.js'
import { getRegistered, registerNew, scopedKey, unregisterByKey } from './registry.js'
import { afterHydration, BROWSER_SCOPES, isServer } from './ssr.js'
import type { Adapter, Listener, Scope, StateInstance, StateOptions, Unsubscribe } from './types.js'
import { RESOLVED, shallowEqual } from './utils.js'
import { addWatcher, notifyWatchers } from './watchers.js'

// ---------------------------------------------------------------------------
// Lazy server adapter registration — avoids pulling node:async_hooks into
// client bundles. The server adapter module self-registers on import.
// ---------------------------------------------------------------------------

type ServerAdapterFactory = <T>(key: string, defaultValue: T) => Adapter<T>

let _serverAdapterFactory: ServerAdapterFactory | undefined

/** @internal — called by adapters/server.ts on import */
export function registerServerAdapter(factory: ServerAdapterFactory): void {
	_serverAdapterFactory = factory
}

// ---------------------------------------------------------------------------
// Scope sets (module-level to avoid per-instance allocation)
// ---------------------------------------------------------------------------

const PERSISTENT_SCOPES = new Set<Scope>(['local', 'session', 'bucket'])
const SYNCABLE_SCOPES = new Set<Scope>(['local', 'bucket'])

// Shared no-op adapter shim for MemoryStateImpl — allocated once, never per-instance
const MEMORY_SHIM: Adapter<unknown> = {
	ready: RESOLVED,
	get: () => undefined,
	set: () => {},
	subscribe: () => () => {},
}

// ---------------------------------------------------------------------------
// Key prefixing
// ---------------------------------------------------------------------------

function resolveStorageKey<T>(
	key: string,
	options: StateOptions<T>,
	configPrefix?: string,
): string {
	if (options.prefix === false) return key

	const prefix = options.prefix ?? configPrefix

	return prefix ? `${prefix}:${key}` : key
}

// ---------------------------------------------------------------------------
// Adapter resolution
// ---------------------------------------------------------------------------

function resolveAdapter<T>(storageKey: string, scope: Scope, options: StateOptions<T>): Adapter<T> {
	switch (scope) {
		case 'memory':
		case 'render':
			return createMemoryAdapter(options.default)

		case 'session':
			if (typeof sessionStorage === 'undefined') {
				throw new Error(
					'[gjendje] sessionStorage is not available. Use ssr: true or scope: "memory" for server environments.',
				)
			}

			return createStorageAdapter(sessionStorage, storageKey, options)

		case 'local':
			if (typeof localStorage === 'undefined') {
				throw new Error(
					'[gjendje] localStorage is not available. Use ssr: true or scope: "server" for server environments.',
				)
			}

			return createStorageAdapter(localStorage, storageKey, options)

		case 'url':
			return createUrlAdapter(
				storageKey,
				options.default,
				options.serialize ?? {
					stringify: (v) => JSON.stringify(v),
					parse: (s) => JSON.parse(s),
				},
				options.persist,
			)

		case 'server':
			if (!_serverAdapterFactory) {
				throw new Error(
					'[gjendje] scope: "server" requires the server adapter. ' +
						'Import { withServerSession } from "gjendje" or "gjendje/server" to enable it.',
				)
			}

			return _serverAdapterFactory(storageKey, options.default)

		case 'bucket': {
			if (!options.bucket) {
				throw new Error(
					'[gjendje] scope: "bucket" requires a bucket option. ' +
						'Example: { scope: "bucket", bucket: { name: "my-bucket" } }',
				)
			}

			return createBucketAdapter(storageKey, options.bucket, options)
		}

		default: {
			const _exhaustive: never = scope

			throw new Error(`[gjendje] Unknown scope: ${_exhaustive}`)
		}
	}
}

// ---------------------------------------------------------------------------
// Mutable state container — shared by reference through Object.create chains.
//
// Enhancers like withHistory and collection use Object.create(instance) to
// delegate methods via prototype. With a class, writing this.prop creates an
// own property on the wrapper, shadowing the prototype's value. By storing
// all mutable state in a single container object (_s), reads and writes
// always go through the same shared reference.
// ---------------------------------------------------------------------------

interface MutableState<T> {
	lastValue: T
	isDestroyed: boolean
	interceptors: Set<(next: T, prev: T) => T> | undefined
	changeHandlers: Set<(next: T, prev: T) => void> | undefined
	settled: Promise<void>
	resolveDestroyed: (() => void) | undefined
	destroyed: Promise<void> | undefined
	hydrated: Promise<void> | undefined
	watchers: Map<PropertyKey, Set<Listener<unknown>>> | undefined
	watchUnsub: Unsubscribe | undefined
	watchPrev: unknown
}

// ---------------------------------------------------------------------------
// Class-based StateInstance — methods on prototype, not per-instance closures
// ---------------------------------------------------------------------------

class StateImpl<T> implements StateInstance<T> {
	readonly key: string
	readonly scope: Scope

	_adapter: Adapter<T>
	_defaultValue: T
	_options: StateOptions<T>
	_rKey: string
	_config: Readonly<GjendjeConfig>
	_s: MutableState<T>

	constructor(
		key: string,
		scope: Scope,
		rKey: string,
		adapter: Adapter<T>,
		options: StateOptions<T>,
		config: Readonly<GjendjeConfig>,
		preallocatedState?: MutableState<T>,
	) {
		this.key = key
		this.scope = scope
		this._rKey = rKey
		this._adapter = adapter
		this._defaultValue = options.default
		this._options = options
		this._config = config

		this._s = preallocatedState ?? {
			lastValue: adapter.get(),
			isDestroyed: false,
			interceptors: undefined,
			changeHandlers: undefined,
			settled: RESOLVED,
			resolveDestroyed: undefined,
			destroyed: undefined,
			hydrated: undefined,
			watchers: undefined,
			watchUnsub: undefined,
			watchPrev: undefined,
		}
	}

	get(): T {
		return this._s.isDestroyed ? this._s.lastValue : this._adapter.get()
	}

	peek(): T {
		return this._s.isDestroyed ? this._s.lastValue : this._adapter.get()
	}

	protected _applyInterceptors(next: T, prev: T): T {
		const s = this._s

		if (s.interceptors === undefined || s.interceptors.size === 0) return next

		const original = next

		for (const interceptor of s.interceptors) {
			next = interceptor(next, prev)
		}

		if (!Object.is(original, next)) {
			this._config.onIntercept?.({
				key: this.key,
				scope: this.scope,
				original,
				intercepted: next,
			})
		}

		return next
	}

	protected _notifyChange(next: T, prev: T): void {
		const s = this._s

		if (s.changeHandlers !== undefined && s.changeHandlers.size > 0) {
			for (const hook of s.changeHandlers) {
				hook(next, prev)
			}
		}

		this._config.onChange?.({ key: this.key, scope: this.scope, value: next, previousValue: prev })
	}

	set(valueOrUpdater: T | ((prev: T) => T)): void {
		const s = this._s

		if (s.isDestroyed) return

		const prev = this._adapter.get()

		let next =
			typeof valueOrUpdater === 'function'
				? (valueOrUpdater as (prev: T) => T)(prev)
				: valueOrUpdater

		next = this._applyInterceptors(next, prev)

		if (this._options.isEqual?.(next, prev)) return

		s.lastValue = next

		this._adapter.set(next)

		s.settled = this._adapter.ready

		this._notifyChange(next, prev)
	}

	subscribe(listener: Listener<T>): Unsubscribe {
		return this._adapter.subscribe(listener)
	}

	reset(): void {
		const s = this._s

		if (s.isDestroyed) return

		const prev = this._adapter.get()

		const next = this._applyInterceptors(this._defaultValue, prev)

		if (this._options.isEqual?.(next, prev)) return

		s.lastValue = next

		this._adapter.set(next)

		s.settled = this._adapter.ready

		this._config.onReset?.({ key: this.key, scope: this.scope, previousValue: prev })

		this._notifyChange(next, prev)
	}

	get ready(): Promise<void> {
		return this._adapter.ready
	}

	get settled(): Promise<void> {
		return this._s.settled
	}

	get hydrated(): Promise<void> {
		return this._s.hydrated ?? RESOLVED
	}

	get destroyed(): Promise<void> {
		const s = this._s

		if (!s.destroyed) {
			s.destroyed = new Promise<void>((resolve) => {
				s.resolveDestroyed = resolve
			})
		}

		return s.destroyed
	}

	get isDestroyed(): boolean {
		return this._s.isDestroyed
	}

	intercept(fn: (next: T, prev: T) => T): Unsubscribe {
		const s = this._s

		if (!s.interceptors) s.interceptors = new Set()

		s.interceptors.add(fn)

		return () => {
			s.interceptors?.delete(fn)
		}
	}

	onChange(fn: (next: T, prev: T) => void): Unsubscribe {
		const s = this._s

		if (!s.changeHandlers) s.changeHandlers = new Set()

		s.changeHandlers.add(fn)

		return () => {
			s.changeHandlers?.delete(fn)
		}
	}

	watch<K extends T extends object ? keyof T : never>(
		watchKey: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe {
		const s = this._s

		if (!s.watchers) s.watchers = new Map()

		this._ensureWatchSubscription()

		return addWatcher(s.watchers, watchKey, listener)
	}

	patch(partial: T extends object ? Partial<T> : never, options?: { strict?: boolean }): void {
		this.set((prev) => {
			if (options?.strict) {
				const prevRec = prev as Record<string, unknown>

				const partialRec = partial as Record<string, unknown>

				const prevKeys = new Set(Object.keys(prevRec))

				const filtered: Record<string, unknown> = {}

				for (const key of Object.keys(partialRec)) {
					if (prevKeys.has(key)) {
						filtered[key] = partialRec[key]
					} else {
						log('warn', `patch("${this.key}") ignored unknown key "${key}" (strict mode).`)
					}
				}

				return { ...prev, ...filtered } as T
			}

			return { ...prev, ...partial } as T
		})
	}

	destroy(): void {
		const s = this._s

		if (s.isDestroyed) return

		s.lastValue = this.get()

		s.isDestroyed = true

		s.interceptors?.clear()
		s.changeHandlers?.clear()
		s.watchers?.clear()

		s.watchUnsub?.()

		this._adapter.destroy?.()

		unregisterByKey(this._rKey)

		this._config.onDestroy?.({ key: this.key, scope: this.scope })

		if (s.resolveDestroyed) {
			s.resolveDestroyed()
		} else {
			s.destroyed = RESOLVED
		}
	}

	protected _ensureWatchSubscription(): void {
		const s = this._s

		if (s.watchUnsub) return

		s.watchPrev = this.get()

		s.watchUnsub = this.subscribe((next) => {
			if (s.watchers && s.watchers.size > 0) {
				notifyWatchers(s.watchers, s.watchPrev, next)
			}

			s.watchPrev = next
		})
	}
}

// ---------------------------------------------------------------------------
// MemoryStateImpl — PERFORMANCE-CRITICAL subclass for memory scope.
//
// DO NOT REMOVE OR FLATTEN INTO StateImpl.
//
// This subclass bypasses the adapter pipeline entirely for memory-scoped
// state, which is the default and most common scope. Benchmarks show that
// removing it causes a ~60% regression in create+destroy lifecycle and
// ~30% regression in batch/effect throughput.
//
// How it works:
//   - Stores state in a lean MemoryCore (5 fields) instead of the full
//     MutableState (11 fields). Feature-gated fields (interceptors,
//     watchers, change handlers, destroyed promise) live in MemoryExtras
//     and are allocated lazily on first use via getExt().
//   - Creates the notification function lazily on first subscribe, then
//     reuses it — avoids per-notification closure allocation.
//   - Skips adapter.destroy() since there's no real adapter to tear down.
//   - Returns RESOLVED for `ready`/`settled`/`hydrated` since memory
//     state is always synchronous.
//   - Overrides all StateImpl methods to use MemoryCore directly —
//     the shared MEMORY_MUTABLE_SHIM passed to super() is never read.
//
// Key benchmarks (MemoryStateImpl vs adapter pipeline):
//   create + destroy:  4.25M ops/s  vs  1.50M ops/s  (2.8× faster)
//   batch (10 states): 1.87M ops/s  vs  1.45M ops/s  (1.3× faster)
//   effect trigger:   12.87M ops/s  vs  8.31M ops/s  (1.5× faster)
// ---------------------------------------------------------------------------

// Lean core — only the fields touched on every get()/set()/subscribe() call.
// Feature-gated fields (interceptors, watchers, change handlers, destroyed
// promise, etc.) live in MemoryExtras and are allocated lazily on first use.
// This cuts per-instance allocation from 14 property slots to 5, closing the
// gap with closure-based libraries like Zustand.

interface MemoryCore<T> {
	current: T
	isDestroyed: boolean
	listeners: Set<Listener<T>> | undefined
	notifyFn: (() => void) | undefined
	ext: MemoryExtras<T> | undefined
}

interface MemoryExtras<T> {
	lastValue: T
	interceptors: Set<(next: T, prev: T) => T> | undefined
	changeHandlers: Set<(next: T, prev: T) => void> | undefined
	watchers: Map<PropertyKey, Set<Listener<unknown>>> | undefined
	watchUnsub: Unsubscribe | undefined
	watchPrev: unknown
	resolveDestroyed: (() => void) | undefined
	destroyed: Promise<void> | undefined
}

function getExt<T>(c: MemoryCore<T>): MemoryExtras<T> {
	if (c.ext === undefined) {
		c.ext = {
			lastValue: undefined as T,
			interceptors: undefined,
			changeHandlers: undefined,
			watchers: undefined,
			watchUnsub: undefined,
			watchPrev: undefined,
			resolveDestroyed: undefined,
			destroyed: undefined,
		}
	}

	return c.ext
}

// Minimal MutableState shim passed to super() — MemoryStateImpl overrides
// every method that touches _s, so these fields are never actually read.
// Allocated once, shared across all instances.
const MEMORY_MUTABLE_SHIM: MutableState<unknown> = {
	lastValue: undefined,
	isDestroyed: false,
	interceptors: undefined,
	changeHandlers: undefined,
	settled: RESOLVED,
	resolveDestroyed: undefined,
	destroyed: undefined,
	hydrated: undefined,
	watchers: undefined,
	watchUnsub: undefined,
	watchPrev: undefined,
}

class MemoryStateImpl<T> extends StateImpl<T> {
	private _c: MemoryCore<T>

	private _hasIsEqual: boolean

	constructor(
		key: string,
		rKey: string,
		options: StateOptions<T>,
		config: Readonly<GjendjeConfig>,
	) {
		super(
			key,
			'memory',
			rKey,
			MEMORY_SHIM as Adapter<T>,
			options,
			config,
			MEMORY_MUTABLE_SHIM as MutableState<T>,
		)

		this._c = {
			current: options.default,
			isDestroyed: false,
			listeners: undefined,
			notifyFn: undefined,
			ext: undefined,
		}

		this._hasIsEqual = options.isEqual !== undefined
	}

	override get(): T {
		return this._c.current
	}

	override peek(): T {
		return this._c.current
	}

	override set(valueOrUpdater: T | ((prev: T) => T)): void {
		const c = this._c

		if (c.isDestroyed) return

		const prev = c.current

		let next =
			typeof valueOrUpdater === 'function'
				? (valueOrUpdater as (prev: T) => T)(prev)
				: valueOrUpdater

		// Inline interceptors and change handlers for hot-path performance.
		// Avoids virtual dispatch overhead of _applyInterceptors/_notifyChange.
		const ext = c.ext

		if (ext !== undefined && ext.interceptors !== undefined && ext.interceptors.size > 0) {
			const original = next

			for (const interceptor of ext.interceptors) {
				next = interceptor(next, prev)
			}

			if (!Object.is(original, next)) {
				this._config.onIntercept?.({
					key: this.key,
					scope: this.scope,
					original,
					intercepted: next,
				})
			}
		}

		if (this._hasIsEqual && this._options.isEqual?.(next, prev)) return

		c.current = next

		if (c.notifyFn !== undefined) {
			notify(c.notifyFn)
		}

		if (ext !== undefined && ext.changeHandlers !== undefined && ext.changeHandlers.size > 0) {
			for (const hook of ext.changeHandlers) {
				hook(next, prev)
			}
		}

		this._config.onChange?.({ key: this.key, scope: this.scope, value: next, previousValue: prev })
	}

	override subscribe(listener: Listener<T>): Unsubscribe {
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

	override reset(): void {
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
				this._config.onIntercept?.({
					key: this.key,
					scope: this.scope,
					original,
					intercepted: next,
				})
			}
		}

		if (this._hasIsEqual && this._options.isEqual?.(next, prev)) return

		c.current = next

		if (c.notifyFn !== undefined) {
			notify(c.notifyFn)
		}

		if (ext !== undefined && ext.changeHandlers !== undefined && ext.changeHandlers.size > 0) {
			for (const hook of ext.changeHandlers) {
				hook(next, prev)
			}
		}

		this._config.onReset?.({ key: this.key, scope: this.scope, previousValue: prev })

		this._config.onChange?.({ key: this.key, scope: this.scope, value: next, previousValue: prev })
	}

	override get ready(): Promise<void> {
		return RESOLVED
	}

	override get settled(): Promise<void> {
		return RESOLVED
	}

	override get hydrated(): Promise<void> {
		return RESOLVED
	}

	override get isDestroyed(): boolean {
		return this._c.isDestroyed
	}

	override get destroyed(): Promise<void> {
		if (this._c.isDestroyed) return RESOLVED

		const ext = getExt(this._c)

		if (!ext.destroyed) {
			ext.destroyed = new Promise<void>((resolve) => {
				ext.resolveDestroyed = resolve
			})
		}

		return ext.destroyed
	}

	override intercept(fn: (next: T, prev: T) => T): Unsubscribe {
		const ext = getExt(this._c)

		if (!ext.interceptors) ext.interceptors = new Set()

		ext.interceptors.add(fn)

		return () => {
			ext.interceptors?.delete(fn)
		}
	}

	override onChange(fn: (next: T, prev: T) => void): Unsubscribe {
		const ext = getExt(this._c)

		if (!ext.changeHandlers) ext.changeHandlers = new Set()

		ext.changeHandlers.add(fn)

		return () => {
			ext.changeHandlers?.delete(fn)
		}
	}

	override watch<K extends T extends object ? keyof T : never>(
		watchKey: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe {
		const ext = getExt(this._c)

		if (!ext.watchers) ext.watchers = new Map()

		this._ensureWatchSubscription()

		return addWatcher(ext.watchers, watchKey, listener)
	}

	protected override _ensureWatchSubscription(): void {
		const ext = getExt(this._c)

		if (ext.watchUnsub) return

		ext.watchPrev = this._c.current

		ext.watchUnsub = this.subscribe((next) => {
			if (ext.watchers && ext.watchers.size > 0) {
				notifyWatchers(ext.watchers, ext.watchPrev, next)
			}

			ext.watchPrev = next
		})
	}

	override destroy(): void {
		const c = this._c

		if (c.isDestroyed) return

		c.isDestroyed = true

		const ext = c.ext

		if (ext !== undefined) {
			ext.lastValue = c.current
			ext.interceptors?.clear()
			ext.changeHandlers?.clear()
			ext.watchers?.clear()
			ext.watchUnsub?.()
		}

		c.listeners?.clear()

		if (this._rKey) unregisterByKey(this._rKey)

		this._config.onDestroy?.({ key: this.key, scope: this.scope })

		if (ext?.resolveDestroyed) {
			ext.resolveDestroyed()
		} else if (ext !== undefined) {
			ext.destroyed = RESOLVED
		}
	}
}

// ---------------------------------------------------------------------------
// Base instance factory
// ---------------------------------------------------------------------------

export function createBase<T>(key: string, options: StateOptions<T>): StateInstance<T> {
	// --- Inlined key validation, scope resolution, and registry lookup ---
	// Previously in resolveKeyAndScope(); inlined to eliminate the intermediate
	// object allocation and function-call overhead on the hot path.

	if (!key) {
		throw new Error('[gjendje] key must be a non-empty string.')
	}

	const config = getConfig()

	if (config.keyPattern && !config.keyPattern.test(key)) {
		throw new Error(
			`[gjendje] Key "${key}" does not match the configured keyPattern ${config.keyPattern}.`,
		)
	}

	const rawScope = options.scope ?? config.scope ?? 'memory'

	const scope = rawScope === 'render' ? 'memory' : rawScope

	// --- Fast path: memory scope — uses MemoryStateImpl ---
	// Checks scope BEFORE computing SSR/sync flags to avoid unnecessary work
	// for the most common case. See the MemoryStateImpl class comment for why
	// this subclass matters.
	if (scope === 'memory') {
		if (options.sync || config.sync) {
			log(
				'warn',
				`sync: true is ignored for scope "memory". Only "local" and "bucket" scopes support cross-tab sync.`,
			)
		}

		// Ultra-fast path: skip registry entirely when registry is false.
		// Map operations are the dominant cost in high-throughput creation
		// (~1.5M ops/s ceiling due to V8's hash table growth).
		if (config.registry === false) {
			return new MemoryStateImpl(key, '', options, config)
		}

		const rKey = scopedKey(key, scope)

		const existing = getRegistered<T>(rKey) as StateInstance<T> | undefined

		if (existing && !existing.isDestroyed) {
			if (config.warnOnDuplicate) {
				log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
			}

			return existing
		}

		const instance = new MemoryStateImpl(key, rKey, options, config)

		registerNew(rKey, key, scope, instance, config, existing)

		return instance
	}

	const rKey = scopedKey(key, scope)

	const existing = getRegistered<T>(rKey) as StateInstance<T> | undefined

	if (existing && !existing.isDestroyed) {
		if (config.warnOnDuplicate) {
			log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
		}

		return existing
	}

	// --- Slow path: non-memory scopes ---

	// requireValidation enforcement
	if (config.requireValidation && PERSISTENT_SCOPES.has(scope) && !options.validate) {
		throw new Error(
			`[gjendje] A validate function is required for persisted scope "${scope}" ` +
				`on state("${key}"). Set requireValidation: false in configure() to disable.`,
		)
	}

	const isSsrMode = (options.ssr ?? config.ssr) && BROWSER_SCOPES.has(scope)

	const useMemoryFallback = isSsrMode && isServer()

	const effectiveSync = options.sync ?? (config.sync && SYNCABLE_SCOPES.has(scope))

	if (effectiveSync && !SYNCABLE_SCOPES.has(scope)) {
		log(
			'warn',
			`sync: true is ignored for scope "${scope}". Only "local" and "bucket" scopes support cross-tab sync.`,
		)
	}

	const storageKey = resolveStorageKey(key, options, config.prefix)

	const baseAdapter = useMemoryFallback
		? createMemoryAdapter(options.default)
		: resolveAdapter(storageKey, scope, options)

	const shouldSync = effectiveSync && SYNCABLE_SCOPES.has(scope) && !useMemoryFallback

	const adapter = shouldSync ? withSync(baseAdapter, storageKey, scope) : baseAdapter

	const instance = new StateImpl(key, scope, rKey, adapter, options, config)

	// SSR hydration
	if (isSsrMode && !isServer()) {
		instance._s.hydrated = afterHydration(() => {
			// If the instance was destroyed or the user already called
			// set() before hydration fired, skip the overwrite.
			if (instance.isDestroyed) return

			const currentValue = instance.get()

			if (!shallowEqual(currentValue, options.default)) return

			let realAdapter: Adapter<T> | undefined

			try {
				realAdapter = resolveAdapter(storageKey, scope, options)

				const storedValue = realAdapter.get()

				if (!shallowEqual(storedValue, options.default)) {
					instance.set(storedValue)
				}

				config.onHydrate?.({
					key,
					scope,
					serverValue: options.default,
					clientValue: storedValue,
				})
			} catch (err) {
				log('debug', `Hydration adapter unavailable for state("${key}") — using memory fallback.`)

				reportError(key, scope, err)
			} finally {
				realAdapter?.destroy?.()
			}
		})
	}

	registerNew(rKey, key, scope, instance, config, existing)

	return instance
}
