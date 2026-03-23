import { createBucketAdapter } from './adapters/bucket.js'
import { createMemoryAdapter } from './adapters/memory.js'
import { createStorageAdapter } from './adapters/storage.js'
import { withSync } from './adapters/sync.js'
import { createUrlAdapter } from './adapters/url.js'
import { notify } from './batch.js'
import type { GjendjeConfig } from './config.js'
import { getConfig, log, reportError } from './config.js'
import { getRegistered, registerByKey, scopedKey, unregisterByKey } from './registry.js'
import { afterHydration, BROWSER_SCOPES, isServer } from './ssr.js'
import type { Adapter, Listener, Scope, StateInstance, StateOptions, Unsubscribe } from './types.js'
import { shallowEqual } from './utils.js'
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

// Shared resolved promise — avoids allocating a new one per instance
const RESOLVED = Promise.resolve()

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
	) {
		this.key = key
		this.scope = scope
		this._rKey = rKey
		this._adapter = adapter
		this._defaultValue = options.default
		this._options = options
		this._config = config

		this._s = {
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
// MemoryStateImpl — specialized subclass for memory scope that skips the
// adapter object entirely. State is stored directly on the instance.
// ---------------------------------------------------------------------------

interface MemoryMutableState<T> extends MutableState<T> {
	current: T
	memoryListeners: Set<Listener<T>> | undefined
	notifyFn: (() => void) | undefined
}

class MemoryStateImpl<T> extends StateImpl<T> {
	// Direct reference — avoids a getter cast on every get()/set() call
	private _r: MemoryMutableState<T>

	private _hasIsEqual: boolean

	constructor(
		key: string,
		rKey: string,
		options: StateOptions<T>,
		config: Readonly<GjendjeConfig>,
	) {
		super(key, 'memory', rKey, MEMORY_SHIM as Adapter<T>, options, config)

		// Extend the mutable state with memory-specific fields
		const rs = this._s as MemoryMutableState<T>

		rs.current = options.default
		rs.memoryListeners = undefined
		rs.notifyFn = undefined

		this._r = rs

		this._hasIsEqual = options.isEqual !== undefined
	}

	override get(): T {
		return this._r.current
	}

	override peek(): T {
		return this._r.current
	}

	override set(valueOrUpdater: T | ((prev: T) => T)): void {
		const s = this._r

		if (s.isDestroyed) return

		const prev = s.current

		let next =
			typeof valueOrUpdater === 'function'
				? (valueOrUpdater as (prev: T) => T)(prev)
				: valueOrUpdater

		next = this._applyInterceptors(next, prev)

		if (this._hasIsEqual && this._options.isEqual?.(next, prev)) return

		s.current = next

		if (s.notifyFn !== undefined) {
			notify(s.notifyFn)
		}

		this._notifyChange(next, prev)
	}

	override subscribe(listener: Listener<T>): Unsubscribe {
		const s = this._r

		if (!s.memoryListeners) {
			const listeners = new Set<Listener<T>>()

			s.memoryListeners = listeners

			s.notifyFn = () => {
				for (const l of listeners) {
					try {
						l(s.current)
					} catch (err) {
						console.error('[gjendje] Listener threw:', err)
					}
				}
			}
		}

		const set = s.memoryListeners

		set.add(listener)

		return () => {
			set.delete(listener)
		}
	}

	override reset(): void {
		const s = this._r

		if (s.isDestroyed) return

		const prev = s.current

		const next = this._applyInterceptors(this._defaultValue, prev)

		if (this._hasIsEqual && this._options.isEqual?.(next, prev)) return

		s.current = next

		if (s.notifyFn !== undefined) {
			notify(s.notifyFn)
		}

		this._config.onReset?.({ key: this.key, scope: this.scope, previousValue: prev })

		this._notifyChange(next, prev)
	}

	override get ready(): Promise<void> {
		return RESOLVED
	}

	protected override _ensureWatchSubscription(): void {
		const s = this._r

		if (s.watchUnsub) return

		s.watchPrev = s.current

		s.watchUnsub = this.subscribe((next) => {
			if (s.watchers && s.watchers.size > 0) {
				notifyWatchers(s.watchers, s.watchPrev, next)
			}

			s.watchPrev = next
		})
	}

	override destroy(): void {
		const s = this._r

		if (s.isDestroyed) return

		s.lastValue = s.current

		s.isDestroyed = true

		s.interceptors?.clear()
		s.changeHandlers?.clear()
		s.watchers?.clear()

		s.watchUnsub?.()

		s.memoryListeners?.clear()

		unregisterByKey(this._rKey)

		this._config.onDestroy?.({ key: this.key, scope: this.scope })

		if (s.resolveDestroyed) {
			s.resolveDestroyed()
		} else {
			s.destroyed = RESOLVED
		}
	}
}

// ---------------------------------------------------------------------------
// Base instance factory
// ---------------------------------------------------------------------------

interface ResolvedKeyAndScope<T> {
	config: Readonly<GjendjeConfig>
	scope: Scope
	rKey: string
	existing: StateInstance<T> | undefined
}

/**
 * Shared key validation, scope normalization, and registry lookup.
 */
function resolveKeyAndScope<T>(key: string, options: StateOptions<T>): ResolvedKeyAndScope<T> {
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

	const rKey = scopedKey(key, scope)

	const existing = getRegistered<T>(rKey) as StateInstance<T> | undefined

	return { config, scope, rKey, existing }
}

export function createBase<T>(key: string, options: StateOptions<T>): StateInstance<T> {
	const { config, scope, rKey, existing } = resolveKeyAndScope(key, options)

	if (existing && !existing.isDestroyed) {
		if (config.warnOnDuplicate) {
			log('warn', `Duplicate state("${key}") with scope "${scope}". Returning cached instance.`)
		}

		return existing
	}

	// --- requireValidation enforcement ---
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

	// --- Fast path: memory scope (no SSR, no sync) — skip adapter object ---
	let instance: StateImpl<T>

	if (scope === 'memory' && !isSsrMode) {
		instance = new MemoryStateImpl(key, rKey, options, config)
	} else {
		const storageKey = resolveStorageKey(key, options, config.prefix)

		const baseAdapter = useMemoryFallback
			? createMemoryAdapter(options.default)
			: resolveAdapter(storageKey, scope, options)

		const shouldSync = effectiveSync && SYNCABLE_SCOPES.has(scope) && !useMemoryFallback

		const adapter = shouldSync ? withSync(baseAdapter, storageKey, scope) : baseAdapter

		instance = new StateImpl(key, scope, rKey, adapter, options, config)

		// SSR hydration
		if (isSsrMode && !isServer()) {
			instance._s.hydrated = afterHydration(() => {
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
	}

	registerByKey(rKey, key, scope, instance, config)

	return instance
}
