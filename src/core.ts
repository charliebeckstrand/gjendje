import { createBucketAdapter } from './adapters/bucket.js'
import { createRenderAdapter } from './adapters/render.js'
import { createServerAdapter } from './adapters/server.js'
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

// ---------------------------------------------------------------------------
// Scope sets (module-level to avoid per-instance allocation)
// ---------------------------------------------------------------------------

const PERSISTENT_SCOPES = new Set<Scope>(['local', 'tab', 'bucket'])
const SYNCABLE_SCOPES = new Set<Scope>(['local', 'bucket'])

// Shared resolved promise — avoids allocating a new one per instance
const RESOLVED = Promise.resolve()

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
		case 'render':
			return createRenderAdapter(options.default)

		case 'tab':
			if (typeof sessionStorage === 'undefined') {
				throw new Error(
					'[state] sessionStorage is not available. Use ssr: true or scope: "render" for server environments.',
				)
			}

			return createStorageAdapter(sessionStorage, storageKey, options)

		case 'local':
			if (typeof localStorage === 'undefined') {
				throw new Error(
					'[state] localStorage is not available. Use ssr: true or scope: "server" for server environments.',
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
			return createServerAdapter(storageKey, options.default)

		case 'bucket': {
			if (!options.bucket) {
				throw new Error(
					'[state] scope: "bucket" requires a bucket option. ' +
						'Example: { scope: "bucket", bucket: { name: "my-bucket" } }',
				)
			}

			return createBucketAdapter(storageKey, options.bucket, options)
		}

		default: {
			const _exhaustive: never = scope

			throw new Error(`[state] Unknown scope: ${_exhaustive}`)
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
	hooks: Set<(next: T, prev: T) => void> | undefined
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
			hooks: undefined,
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

	set(valueOrUpdater: T | ((prev: T) => T)): void {
		const s = this._s

		if (s.isDestroyed) return

		const prev = this._adapter.get()

		let next =
			typeof valueOrUpdater === 'function'
				? (valueOrUpdater as (prev: T) => T)(prev)
				: valueOrUpdater

		if (s.interceptors !== undefined && s.interceptors.size > 0) {
			for (const interceptor of s.interceptors) {
				next = interceptor(next, prev)
			}
		}

		if (this._options.isEqual?.(next, prev)) return

		s.lastValue = next

		this._adapter.set(next)

		s.settled = this._adapter.ready

		if (s.hooks !== undefined && s.hooks.size > 0) {
			for (const hook of s.hooks) {
				hook(next, prev)
			}
		}
	}

	subscribe(listener: Listener<T>): Unsubscribe {
		return this._adapter.subscribe(listener)
	}

	reset(): void {
		const s = this._s

		if (s.isDestroyed) return

		const prev = this._adapter.get()

		let next = this._defaultValue

		if (s.interceptors !== undefined && s.interceptors.size > 0) {
			for (const interceptor of s.interceptors) {
				next = interceptor(next, prev)
			}
		}

		if (this._options.isEqual?.(next, prev)) return

		s.lastValue = next

		this._adapter.set(next)

		s.settled = this._adapter.ready

		if (s.hooks !== undefined && s.hooks.size > 0) {
			for (const hook of s.hooks) {
				hook(next, prev)
			}
		}
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

	use(fn: (next: T, prev: T) => void): Unsubscribe {
		const s = this._s

		if (!s.hooks) s.hooks = new Set()

		s.hooks.add(fn)

		return () => {
			s.hooks?.delete(fn)
		}
	}

	watch<K extends T extends object ? keyof T : never>(
		watchKey: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe {
		const s = this._s

		if (!s.watchers) s.watchers = new Map()

		this._ensureWatchSubscription()

		let listeners = s.watchers.get(watchKey as PropertyKey)

		if (!listeners) {
			listeners = new Set()
			s.watchers.set(watchKey as PropertyKey, listeners)
		}

		listeners.add(listener as Listener<unknown>)

		return () => {
			listeners.delete(listener as Listener<unknown>)

			if (listeners.size === 0) {
				s.watchers?.delete(watchKey as PropertyKey)
			}
		}
	}

	destroy(): void {
		const s = this._s

		if (s.isDestroyed) return

		s.lastValue = this._adapter.get()

		s.isDestroyed = true

		s.interceptors?.clear()
		s.hooks?.clear()
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

		s.watchPrev = this._adapter.get()

		s.watchUnsub = this._adapter.subscribe((next) => {
			if (!s.watchers || s.watchers.size === 0) {
				s.watchPrev = next

				return
			}

			for (const [watchKey, listeners] of s.watchers) {
				const prevVal =
					s.watchPrev !== null && typeof s.watchPrev === 'object'
						? (s.watchPrev as Record<PropertyKey, unknown>)[watchKey]
						: undefined

				const nextVal =
					next !== null && typeof next === 'object'
						? (next as Record<PropertyKey, unknown>)[watchKey]
						: undefined

				if (!Object.is(prevVal, nextVal)) {
					for (const listener of listeners) {
						listener(nextVal)
					}
				}
			}

			s.watchPrev = next
		})
	}
}

// ---------------------------------------------------------------------------
// RenderStateImpl — specialized subclass for render scope that skips the
// adapter object entirely. State is stored directly on the instance.
// ---------------------------------------------------------------------------

interface RenderMutableState<T> extends MutableState<T> {
	current: T
	renderListeners: Set<Listener<T>> | undefined
	notifyFn: (() => void) | undefined
}

class RenderStateImpl<T> extends StateImpl<T> {
	// Direct reference — avoids a getter cast on every get()/set() call
	private _r: RenderMutableState<T>

	private _hasIsEqual: boolean

	constructor(
		key: string,
		rKey: string,
		options: StateOptions<T>,
		config: Readonly<GjendjeConfig>,
	) {
		// Pass a minimal adapter shim — prototype methods that access _adapter
		// are overridden below, so this is only used by the base constructor's
		// adapter.get() call for _s.lastValue initialization.
		const shim: Adapter<T> = {
			ready: RESOLVED,
			get: () => options.default,
			set: () => {},
			subscribe: () => () => {},
		}

		super(key, 'render', rKey, shim, options, config)

		// Extend the mutable state with render-specific fields
		const rs = this._s as RenderMutableState<T>

		rs.current = options.default
		rs.renderListeners = undefined
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

		if (s.interceptors !== undefined && s.interceptors.size > 0) {
			for (const interceptor of s.interceptors) {
				next = interceptor(next, prev)
			}
		}

		if (this._hasIsEqual && this._options.isEqual!(next, prev)) return

		s.current = next

		if (s.notifyFn !== undefined) {
			notify(s.notifyFn)
		}

		if (s.hooks !== undefined && s.hooks.size > 0) {
			for (const hook of s.hooks) {
				hook(next, prev)
			}
		}
	}

	override subscribe(listener: Listener<T>): Unsubscribe {
		const s = this._r

		if (!s.renderListeners) {
			const listeners = new Set<Listener<T>>()

			s.renderListeners = listeners
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

		s.renderListeners.add(listener)

		return () => {
			s.renderListeners?.delete(listener)
		}
	}

	override reset(): void {
		const s = this._r

		if (s.isDestroyed) return

		const prev = s.current

		let next = this._defaultValue

		if (s.interceptors !== undefined && s.interceptors.size > 0) {
			for (const interceptor of s.interceptors) {
				next = interceptor(next, prev)
			}
		}

		if (this._hasIsEqual && this._options.isEqual!(next, prev)) return

		s.current = next

		if (s.notifyFn !== undefined) {
			notify(s.notifyFn)
		}

		if (s.hooks !== undefined && s.hooks.size > 0) {
			for (const hook of s.hooks) {
				hook(next, prev)
			}
		}
	}

	override get ready(): Promise<void> {
		return RESOLVED
	}

	protected override _ensureWatchSubscription(): void {
		const s = this._r

		if (s.watchUnsub) return

		s.watchPrev = s.current

		s.watchUnsub = this.subscribe((next) => {
			if (!s.watchers || s.watchers.size === 0) {
				s.watchPrev = next

				return
			}

			for (const [watchKey, listeners] of s.watchers) {
				const prevVal =
					s.watchPrev !== null && typeof s.watchPrev === 'object'
						? (s.watchPrev as Record<PropertyKey, unknown>)[watchKey]
						: undefined

				const nextVal =
					next !== null && typeof next === 'object'
						? (next as Record<PropertyKey, unknown>)[watchKey]
						: undefined

				if (!Object.is(prevVal, nextVal)) {
					for (const listener of listeners) {
						listener(nextVal)
					}
				}
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
		s.hooks?.clear()
		s.watchers?.clear()
		s.watchUnsub?.()
		s.renderListeners?.clear()

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

/**
 * Create a state instance backed by the appropriate adapter for the given scope.
 *
 * Same key + same scope always returns the same instance.
 * This is the low-level factory used by both `state()` and `collection()`.
 */
export function createBase<T>(key: string, options: StateOptions<T>): StateInstance<T> {
	if (!key) {
		throw new Error('[state] key must be a non-empty string.')
	}

	const config = getConfig()

	// --- keyPattern validation ---
	if (config.keyPattern && !config.keyPattern.test(key)) {
		throw new Error(
			`[gjendje] Key "${key}" does not match the configured keyPattern ${config.keyPattern}.`,
		)
	}

	// Apply global defaults — per-instance options take precedence
	const scope = options.scope ?? config.scope ?? 'render'

	const rKey = scopedKey(key, scope)

	const existing = getRegistered<T>(rKey) as StateInstance<T> | undefined

	if (existing && !existing.isDestroyed) return existing

	// --- requireValidation enforcement ---
	if (config.requireValidation && PERSISTENT_SCOPES.has(scope) && !options.validate) {
		throw new Error(
			`[gjendje] A validate function is required for persisted scope "${scope}" ` +
				`on state("${key}"). Set requireValidation: false in configure() to disable.`,
		)
	}

	const isSsrMode = (options.ssr ?? config.ssr) && BROWSER_SCOPES.has(scope)
	const useRenderFallback = isSsrMode && isServer()

	// --- Sync warning (must run before the render fast-path) ---
	const effectiveSync = options.sync ?? (config.sync && SYNCABLE_SCOPES.has(scope))

	if (effectiveSync && !SYNCABLE_SCOPES.has(scope)) {
		log(
			'warn',
			`sync: true is ignored for scope "${scope}". Only "local" and "bucket" scopes support cross-tab sync.`,
		)
	}

	// --- Fast path: render scope (no SSR, no sync) — skip adapter object ---
	let instance: StateImpl<T>

	if (scope === 'render' && !isSsrMode) {
		instance = new RenderStateImpl(key, rKey, options, config)
	} else {
		const storageKey = resolveStorageKey(key, options, config.prefix)

		const baseAdapter = useRenderFallback
			? createRenderAdapter(options.default)
			: resolveAdapter(storageKey, scope, options)

		const shouldSync = effectiveSync && SYNCABLE_SCOPES.has(scope) && !useRenderFallback

		const adapter = shouldSync ? withSync(baseAdapter, storageKey, scope) : baseAdapter

		instance = new StateImpl(key, scope, rKey, adapter, options, config)

		// SSR hydration
		if (isSsrMode && !isServer()) {
			instance._s.hydrated = afterHydration(() => {
				try {
					const realAdapter = resolveAdapter(storageKey, scope, options)

					const storedValue = realAdapter.get()

					const serverValue = options.default
					const clientValue = storedValue

					if (!shallowEqual(storedValue, options.default)) {
						instance.set(storedValue)
					}

					config.onHydrate?.({ key, scope, serverValue, clientValue })

					realAdapter.destroy?.()
				} catch (err) {
					log('debug', `Hydration adapter unavailable for state("${key}") — using render fallback.`)
					reportError(key, scope, err)
				}
			})
		}
	}

	registerByKey(rKey, key, scope, instance, config)

	return instance
}
