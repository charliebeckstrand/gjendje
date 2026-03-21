import { createBucketAdapter } from './adapters/bucket.js'
import { createRenderAdapter } from './adapters/render.js'
import { createServerAdapter } from './adapters/server.js'
import { createStorageAdapter } from './adapters/storage.js'
import { withSync } from './adapters/sync.js'
import { createUrlAdapter } from './adapters/url.js'
import { getConfig, log, reportError } from './config.js'
import { getRegistered, registerByKey, scopedKey, unregisterByKey } from './registry.js'
import { afterHydration, BROWSER_SCOPES, isServer } from './ssr.js'
import type {
	Adapter,
	BaseInstance,
	Listener,
	Scope,
	StateInstance,
	StateOptions,
	Unsubscribe,
} from './types.js'
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
// Base instance factory
// ---------------------------------------------------------------------------

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
	const scope = options.scope ?? config.defaultScope ?? 'render'

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

	const defaultValue = options.default

	const isSsrMode = (options.ssr ?? config.ssr) && BROWSER_SCOPES.has(scope)

	const useRenderFallback = isSsrMode && isServer()

	const storageKey = resolveStorageKey(key, options, config.prefix)

	const baseAdapter = useRenderFallback
		? createRenderAdapter(defaultValue)
		: resolveAdapter(storageKey, scope, options)

	const effectiveSync = options.sync ?? (config.sync && SYNCABLE_SCOPES.has(scope))

	if (effectiveSync && !SYNCABLE_SCOPES.has(scope)) {
		log(
			'warn',
			`sync: true is ignored for scope "${scope}". Only "local" and "bucket" scopes support cross-tab sync.`,
		)
	}

	const shouldSync = effectiveSync && SYNCABLE_SCOPES.has(scope) && !useRenderFallback

	const adapter = shouldSync ? withSync(baseAdapter, storageKey, scope) : baseAdapter

	let lastValue = adapter.get()

	let _isDestroyed = false

	// --- middleware (lazy — only allocated when intercept/use is called) ---
	let _interceptors: Set<(next: T, prev: T) => T> | undefined
	let _hooks: Set<(next: T, prev: T) => void> | undefined

	// --- settled: resolves when the most recent write has persisted ---
	let _settled: Promise<void> = RESOLVED

	// --- destroyed: lazy promise, only allocated when .destroyed getter is accessed ---
	let _resolveDestroyed: (() => void) | undefined
	let _destroyed: Promise<void> | undefined

	// --- hydrated: resolves when SSR hydration completes ---
	let _hydrated: Promise<void> | undefined

	// For SSR mode on the client — hydrate after render
	if (isSsrMode && !isServer()) {
		_hydrated = afterHydration(() => {
			try {
				const realAdapter = resolveAdapter(storageKey, scope, options)

				const storedValue = realAdapter.get()

				const serverValue = defaultValue
				const clientValue = storedValue

				if (!shallowEqual(storedValue, defaultValue)) {
					instance.set(storedValue)
				}

				config.onHydrate?.({ key, scope, serverValue, clientValue })

				// Clean up the temporary adapter to avoid leaking event listeners
				realAdapter.destroy?.()
			} catch (err) {
				log('debug', `Hydration adapter unavailable for state("${key}") — using render fallback.`)
				reportError(key, scope, err)
			}
		})
	}

	// --- watch (lazy — subscription and Map only allocated when watch() is called) ---
	let _watchers: Map<PropertyKey, Set<Listener<unknown>>> | undefined
	let _watchUnsub: Unsubscribe | undefined
	let _watchPrev: unknown

	function ensureWatchSubscription() {
		if (_watchUnsub) return

		_watchPrev = adapter.get()

		_watchUnsub = adapter.subscribe((next) => {
			if (!_watchers || _watchers.size === 0) {
				_watchPrev = next

				return
			}

			for (const [watchKey, listeners] of _watchers) {
				const prevVal =
					_watchPrev !== null && typeof _watchPrev === 'object'
						? (_watchPrev as Record<PropertyKey, unknown>)[watchKey]
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

			_watchPrev = next
		})
	}

	const instance: StateInstance<T> = {
		get() {
			return _isDestroyed ? lastValue : adapter.get()
		},

		peek() {
			return _isDestroyed ? lastValue : adapter.get()
		},

		set(valueOrUpdater) {
			if (_isDestroyed) return

			const prev = adapter.get()

			let next =
				typeof valueOrUpdater === 'function'
					? (valueOrUpdater as (prev: T) => T)(prev)
					: valueOrUpdater

			if (_interceptors !== undefined && _interceptors.size > 0) {
				for (const interceptor of _interceptors) {
					next = interceptor(next, prev)
				}
			}

			if (options.isEqual?.(next, prev)) return

			lastValue = next

			adapter.set(next)

			// settled resolves when the adapter is ready (sync = immediate)
			_settled = adapter.ready

			if (_hooks !== undefined && _hooks.size > 0) {
				for (const hook of _hooks) {
					hook(next, prev)
				}
			}
		},

		subscribe(listener) {
			return adapter.subscribe(listener)
		},

		reset() {
			if (_isDestroyed) return

			const prev = adapter.get()

			let next = defaultValue

			if (_interceptors !== undefined && _interceptors.size > 0) {
				for (const interceptor of _interceptors) {
					next = interceptor(next, prev)
				}
			}

			if (options.isEqual?.(next, prev)) return

			lastValue = next

			adapter.set(next)

			_settled = adapter.ready

			if (_hooks !== undefined && _hooks.size > 0) {
				for (const hook of _hooks) {
					hook(next, prev)
				}
			}
		},

		get ready() {
			return adapter.ready
		},

		get settled() {
			return _settled
		},

		get hydrated() {
			return _hydrated ?? RESOLVED
		},

		get destroyed() {
			if (!_destroyed) {
				_destroyed = new Promise<void>((resolve) => {
					_resolveDestroyed = resolve
				})
			}

			return _destroyed
		},

		get scope() {
			return scope
		},

		get key() {
			return key
		},

		get isDestroyed() {
			return _isDestroyed
		},

		intercept(fn) {
			if (!_interceptors) _interceptors = new Set()

			_interceptors.add(fn)

			return () => {
				_interceptors?.delete(fn)
			}
		},

		use(fn) {
			if (!_hooks) _hooks = new Set()

			_hooks.add(fn)

			return () => {
				_hooks?.delete(fn)
			}
		},

		watch(watchKey, listener) {
			if (!_watchers) _watchers = new Map()

			ensureWatchSubscription()

			let listeners = _watchers.get(watchKey as PropertyKey)

			if (!listeners) {
				listeners = new Set()
				_watchers.set(watchKey as PropertyKey, listeners)
			}

			listeners.add(listener as Listener<unknown>)

			return () => {
				listeners.delete(listener as Listener<unknown>)

				if (listeners.size === 0) {
					_watchers?.delete(watchKey as PropertyKey)
				}
			}
		},

		destroy() {
			if (_isDestroyed) return

			lastValue = adapter.get()

			_isDestroyed = true

			_interceptors?.clear()
			_hooks?.clear()
			_watchers?.clear()
			_watchUnsub?.()

			adapter.destroy?.()

			unregisterByKey(rKey)

			config.onDestroy?.({ key, scope })

			if (_resolveDestroyed) {
				_resolveDestroyed()
			} else {
				// Ensure .destroyed resolves even if the getter was never accessed
				_destroyed = RESOLVED
			}
		},
	}

	registerByKey(rKey, key, scope, instance, config)

	return instance
}
