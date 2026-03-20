import { createBucketAdapter } from './adapters/bucket.js'
import { createLocalAdapter } from './adapters/local.js'
import { createRenderAdapter } from './adapters/render.js'
import { createServerAdapter } from './adapters/server.js'
import { withSync } from './adapters/sync.js'
import { createTabAdapter } from './adapters/tab.js'
import { createUrlAdapter } from './adapters/url.js'
import { getConfig, log, reportError } from './config.js'
import { getRegistered, register, unregister } from './registry.js'
import { afterHydration, BROWSER_SCOPES, isServer } from './ssr.js'
import type { Adapter, BaseInstance, Scope, StateOptions } from './types.js'

// ---------------------------------------------------------------------------
// Scope sets (module-level to avoid per-instance allocation)
// ---------------------------------------------------------------------------

const PERSISTENT_SCOPES = new Set<Scope>(['local', 'tab', 'bucket'])
const SYNCABLE_SCOPES = new Set<Scope>(['local', 'bucket'])

// ---------------------------------------------------------------------------
// Key prefixing
// ---------------------------------------------------------------------------

function resolveStorageKey<T>(key: string, options: StateOptions<T>): string {
	if (options.prefix === false) return key

	const prefix = options.prefix ?? getConfig().prefix

	return prefix ? `${prefix}:${key}` : key
}

// ---------------------------------------------------------------------------
// Adapter resolution
// ---------------------------------------------------------------------------

function resolveAdapter<T>(key: string, scope: Scope, options: StateOptions<T>): Adapter<T> {
	const storageKey = resolveStorageKey(key, options)

	switch (scope) {
		case 'render':
			return createRenderAdapter(options.default)

		case 'tab':
			return createTabAdapter(storageKey, options)

		case 'local':
			return createLocalAdapter(storageKey, options)

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

export function createBase<T>(key: string, options: StateOptions<T>): BaseInstance<T> {
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

	const existing = getRegistered<T>(key, scope)

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

	const storageKey = resolveStorageKey(key, options)

	const baseAdapter = useRenderFallback
		? createRenderAdapter(defaultValue)
		: resolveAdapter(key, scope, options)

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

	// --- middleware ---
	const _interceptors = new Set<(next: T, prev: T) => T>()
	const _hooks = new Set<(next: T, prev: T) => void>()

	// --- settled: resolves when the most recent write has persisted ---
	let _settled = Promise.resolve()

	// --- destroyed: resolves when destroy() is called ---
	let _resolveDestroyed: () => void

	const _destroyed = new Promise<void>((resolve) => {
		_resolveDestroyed = resolve
	})

	// --- hydrated: resolves when SSR hydration completes ---
	let _hydrated: Promise<void>

	// For SSR mode on the client — hydrate after render
	if (isSsrMode && !isServer()) {
		_hydrated = afterHydration(() => {
			try {
				const realAdapter = resolveAdapter(key, scope, options)

				const storedValue = realAdapter.get()

				const serverValue = defaultValue
				const clientValue = storedValue

				if (JSON.stringify(storedValue) !== JSON.stringify(defaultValue)) {
					instance.set(storedValue)
				}

				config.onHydrate?.({ key, scope, serverValue, clientValue })
			} catch (err) {
				log('debug', `Hydration adapter unavailable for state("${key}") — using render fallback.`)
				reportError(key, scope, err)
			}
		})
	} else {
		_hydrated = Promise.resolve()
	}

	const instance: BaseInstance<T> = {
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

			for (const interceptor of _interceptors) {
				next = interceptor(next, prev)
			}

			lastValue = next

			adapter.set(next)

			// settled resolves when the adapter is ready (sync = immediate)
			_settled = adapter.ready

			for (const hook of _hooks) {
				hook(next, prev)
			}
		},

		subscribe(listener) {
			return adapter.subscribe(listener)
		},

		reset() {
			if (_isDestroyed) return

			const prev = adapter.get()

			let next = defaultValue

			for (const interceptor of _interceptors) {
				next = interceptor(next, prev)
			}

			lastValue = next

			adapter.set(next)

			_settled = adapter.ready

			for (const hook of _hooks) {
				hook(next, prev)
			}
		},

		get ready() {
			return adapter.ready
		},

		get settled() {
			return _settled
		},

		get hydrated() {
			return _hydrated
		},

		get destroyed() {
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
			_interceptors.add(fn)

			return () => {
				_interceptors.delete(fn)
			}
		},

		use(fn) {
			_hooks.add(fn)

			return () => {
				_hooks.delete(fn)
			}
		},

		destroy() {
			if (_isDestroyed) return

			lastValue = adapter.get()

			_isDestroyed = true

			_interceptors.clear()
			_hooks.clear()

			adapter.destroy?.()

			unregister(key, scope)

			config.onDestroy?.({ key, scope })

			_resolveDestroyed()
		},
	}

	register(key, scope, instance)

	return instance
}
