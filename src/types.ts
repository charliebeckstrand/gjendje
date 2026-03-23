// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export type Scope =
	| 'memory' // in-memory, ephemeral (preferred name)
	| 'render' // in-memory, ephemeral (alias for 'memory')
	| 'session' // sessionStorage — survives page reloads, gone when tab closes
	| 'local' // localStorage — survives across tabs and restarts
	| 'url' // URLSearchParams — lives in the address bar, shareable
	| 'server' // AsyncLocalStorage — server-side session scoped
	| 'bucket' // Storage Buckets API — isolated, expirable, quota-managed

// ---------------------------------------------------------------------------
// Adapter interface — every scope implements this contract
// ---------------------------------------------------------------------------

export interface Adapter<T> {
	get(): T
	set(value: T): void
	subscribe(listener: Listener<T>): Unsubscribe
	/** Resolves when the adapter is ready to read/write. Sync adapters resolve immediately. */
	ready: Promise<void>
	destroy?(): void
}

// ---------------------------------------------------------------------------
// ReadonlyInstance — shared base for instances that cannot be written to
// Includes identity, lifecycle, and reactive read — but no set/reset.
// ---------------------------------------------------------------------------

export interface ReadonlyInstance<T> {
	/** Current value */
	get(): T
	/** Read the current value without any reactive implications */
	peek(): T
	/** Subscribe to all changes. Returns an unsubscribe function. */
	subscribe(listener: Listener<T>): Unsubscribe
	/** Which scope this instance uses */
	readonly scope: Scope
	/** The key this instance was created with */
	readonly key: string
	/** Whether this instance has been destroyed */
	readonly isDestroyed: boolean
	/**
	 * Resolves when the adapter is fully initialized.
	 * Resolves immediately for synchronous scopes.
	 */
	readonly ready: Promise<void>
	/**
	 * Resolves when the most recent write has been persisted to storage.
	 * For synchronous scopes this resolves immediately.
	 * For async scopes (e.g. bucket) this resolves once the adapter is ready
	 * and the write has landed.
	 */
	readonly settled: Promise<void>
	/**
	 * Resolves when SSR hydration is complete and the real stored value
	 * has been read. Resolves immediately when not in SSR mode.
	 */
	readonly hydrated: Promise<void>
	/**
	 * Resolves when destroy() has been called and teardown is complete.
	 */
	readonly destroyed: Promise<void>
	/** Tear down listeners and storage resources */
	destroy(): void
}

// ---------------------------------------------------------------------------
// BaseInstance — full read/write instance every adapter produces
// ---------------------------------------------------------------------------

export interface BaseInstance<T> extends ReadonlyInstance<T> {
	/** Update value — accepts a value or an updater function */
	set(value: T | ((prev: T) => T)): void
	/** Reset to default value */
	reset(): void

	/**
	 * Register an interceptor that runs before each set/reset.
	 * The interceptor receives `(next, prev)` and returns the value to actually store.
	 * Return `prev` to reject the update. Multiple interceptors run in registration order.
	 */
	intercept(fn: (next: T, prev: T) => T): Unsubscribe

	/**
	 * Register a handler that fires after each set/reset.
	 * Receives `(next, prev)`. Return value is ignored.
	 * Multiple handlers run in registration order.
	 */
	onChange(fn: (next: T, prev: T) => void): Unsubscribe
}

// ---------------------------------------------------------------------------
// Enhancer — a function that augments an instance with new capabilities
// ---------------------------------------------------------------------------

export type Enhancer<TIn, TOut extends TIn> = (instance: TIn) => TOut

// ---------------------------------------------------------------------------
// StateInstance — base + peek + watch
// ---------------------------------------------------------------------------

export interface StateInstance<T> extends BaseInstance<T> {
	/**
	 * Watch a specific key within an object value.
	 * Listener only fires when that key's value changes.
	 */
	watch<K extends T extends object ? keyof T : never>(
		key: K,
		listener: (value: T[K & keyof T]) => void,
	): Unsubscribe

	/**
	 * Merge a partial update into the current object value (shallow merge).
	 * Only available when T is an object type.
	 *
	 * By default, all keys in the partial are merged (including new ones).
	 * Pass `{ strict: true }` to only merge keys that already exist on the
	 * current value — unknown keys are ignored and a warning is logged.
	 */
	patch(partial: T extends object ? Partial<T> : never, options?: { strict?: boolean }): void
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BucketOptions {
	/**
	 * Name of the storage bucket. Each name is isolated — keys in one
	 * bucket never conflict with keys in another.
	 */
	name: string

	/**
	 * Whether the bucket should persist under storage pressure.
	 * Defaults to false.
	 */
	persisted?: boolean

	/**
	 * Expiry duration or Unix timestamp in ms.
	 * Examples: '7d', '24h', '30m', or a timestamp.
	 */
	expires?: string | number

	/**
	 * Maximum storage quota for this bucket.
	 * Examples: '10mb', '50mb', or a byte count.
	 */
	quota?: string | number

	/**
	 * Scope to use if the Storage Buckets API is not available.
	 * Defaults to 'local'.
	 */
	fallback?: 'local' | 'session'
}

export interface StateOptions<T> {
	/** Initial / default value */
	default: T

	/** Where state should live. Defaults to 'render'. */
	scope?: Scope

	/**
	 * Storage bucket options. Required when scope is 'bucket'.
	 * Ignored for all other scopes.
	 */
	bucket?: BucketOptions

	/**
	 * Custom serializer. Defaults to JSON.stringify / JSON.parse.
	 * Only used by adapters that persist to string-based storage.
	 */
	serialize?: Serializer<T>

	/**
	 * Enable SSR safety. When true:
	 * - On server: silently falls back to 'render' scope
	 * - On client before hydration: uses default value to match server output
	 * - On client after hydration: reads real storage and emits update if different
	 */
	ssr?: boolean

	/**
	 * Schema version for migrations. Defaults to 1.
	 */
	version?: number

	/**
	 * Validate a value read from storage. Falls back to default on failure.
	 * Runs after migration.
	 */
	validate?: (value: unknown) => value is T

	/**
	 * Migration functions keyed by the version they migrate FROM.
	 *
	 * Example: { 1: (old) => ({ ...old, newField: 'default' }) }
	 */
	migrate?: Record<number, (old: unknown) => unknown>

	/**
	 * Override the global prefix for this instance.
	 * - `string`: use this prefix instead of the global one
	 * - `false`: disable prefixing entirely for this instance
	 */
	prefix?: string | false

	/**
	 * Broadcast changes to other tabs via BroadcastChannel.
	 * When true, any set() call is also sent to other open tabs,
	 * and incoming changes from other tabs update this instance.
	 *
	 * Works with `local` and `bucket` scopes only.
	 */
	sync?: boolean

	/**
	 * Selectively persist only the specified keys of an object value.
	 * Non-listed keys are kept in memory but excluded from storage writes.
	 * On read, persisted keys are merged with the default value.
	 *
	 * Only meaningful for object-typed state with a persistent scope.
	 */
	persist?: Array<keyof T & string>

	/**
	 * Custom equality function. When provided, set() skips the update
	 * (no storage write, no subscriber notification) if isEqual(next, prev)
	 * returns true. Useful for preventing unnecessary re-renders with
	 * structurally equal objects.
	 */
	isEqual?: (a: T, b: T) => boolean
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface Serializer<T> {
	stringify(value: T): string
	parse(raw: string): T
}

export interface VersionedValue<T> {
	v: number
	data: T
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Listener<T> = (value: T) => void
export type Unsubscribe = () => void
