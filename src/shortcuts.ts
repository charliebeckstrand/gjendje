import { createState } from './factory.js'
import type { StateInstance, StateOptions } from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Widen<T> = T extends string
	? string
	: T extends number
		? number
		: T extends boolean
			? boolean
			: T

type ShortcutOptions<T> = Omit<StateOptions<T>, 'default' | 'scope'>

type BucketShortcutOptions<T> = Omit<StateOptions<T>, 'default' | 'scope' | 'bucket'> &
	Pick<StateOptions<T>, 'bucket'>

/**
 * Extract the single key and value from a `{ key: defaultValue }` entry object.
 */
function extractEntry<T>(entry: Record<string, T>): [string, T] {
	const keys = Object.keys(entry)

	if (keys.length !== 1) {
		throw new Error(
			`[gjendje] Shortcut expects exactly one key, got ${keys.length}: ${keys.join(', ')}`,
		)
	}

	const key = keys[0] as string

	return [key, entry[key] as T]
}

// ---------------------------------------------------------------------------
// Deprecation helper
// ---------------------------------------------------------------------------

const _deprecationWarned = new Set<string>()

function warnDeprecated(name: string): void {
	if (_deprecationWarned.has(name)) return
	_deprecationWarned.add(name)
	console.warn(
		`[gjendje] ${name}() is deprecated and will be removed in 1.0.0. ` +
			`Use state.${name}() instead. Example: state.${name}({ key: value })`,
	)
}

// ---------------------------------------------------------------------------
// Core scope shortcut implementations (shared by state.* and standalone)
// ---------------------------------------------------------------------------

function _local<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'local' })
}

function _session<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'tab' })
}

function _url<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'url' })
}

function _server<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'server' })
}

function _bucket<T>(entry: Record<string, T>, options: BucketShortcutOptions<T>): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'bucket' })
}

// ---------------------------------------------------------------------------
// state() — the universal entry point
// ---------------------------------------------------------------------------

/** state function with dot-notation scope shortcuts */
export interface StateFunction {
	/** Create in-memory state (default scope) */
	<T>(entry: Record<string, T>, options?: Omit<StateOptions<T>, 'default'>): StateInstance<T>
	<T>(key: string, options: StateOptions<T>): StateInstance<T>
	<T>(key: string, defaultValue: T, options: Omit<StateOptions<T>, 'default'>): StateInstance<T>
	<T extends string | number | boolean | null | undefined>(
		key: string,
		defaultValue: T,
	): StateInstance<Widen<T>>

	/** Create state stored in `localStorage` */
	local: <T>(entry: Record<string, T>, options?: ShortcutOptions<T>) => StateInstance<T>
	/** Create state stored in `sessionStorage` */
	session: <T>(entry: Record<string, T>, options?: ShortcutOptions<T>) => StateInstance<T>
	/** Create state stored in `URLSearchParams` */
	url: <T>(entry: Record<string, T>, options?: ShortcutOptions<T>) => StateInstance<T>
	/** Create state stored in a Storage Bucket */
	bucket: <T>(entry: Record<string, T>, options: BucketShortcutOptions<T>) => StateInstance<T>
	/** Create state stored in server-side `AsyncLocalStorage` */
	server: <T>(entry: Record<string, T>, options?: ShortcutOptions<T>) => StateInstance<T>
}

/**
 * Create a stateful value.
 *
 * Preferred — entry object form (key derived from property name):
 *
 * ```ts
 * const counter = state({ counter: 0 })
 * const theme = state.local({ theme: 'light' })
 * ```
 *
 * Scope shortcuts via dot notation:
 *
 * ```ts
 * state.local({ theme: 'light' })    // localStorage
 * state.session({ draft: '' })        // sessionStorage
 * state.url({ q: '' })               // URLSearchParams
 * state.bucket({ cache: [] }, opts)   // Storage Buckets API
 * state.server({ user: null })        // AsyncLocalStorage
 * ```
 *
 * Alternative — string key forms:
 *
 * ```ts
 * const theme = state('theme', { default: 'light', scope: 'local' })
 * const synced = state('theme', 'light', { scope: 'local', sync: true })
 * const counter = state('counter', 0)
 * ```
 */
function _state<T>(
	keyOrEntry: string | Record<string, T>,
	optionsOrDefault?: T | StateOptions<T> | Omit<StateOptions<T>, 'default'>,
	extraOptions?: Omit<StateOptions<T>, 'default'>,
): StateInstance<T> {
	let key: string

	let options: StateOptions<T>

	if (typeof keyOrEntry === 'object') {
		const [entryKey, defaultValue] = extractEntry(keyOrEntry)

		key = entryKey

		options = { ...(optionsOrDefault as Omit<StateOptions<T>, 'default'>), default: defaultValue }
	} else {
		key = keyOrEntry

		options = extraOptions
			? ({ ...extraOptions, default: optionsOrDefault } as StateOptions<T>)
			: optionsOrDefault !== null &&
					typeof optionsOrDefault === 'object' &&
					'default' in optionsOrDefault
				? (optionsOrDefault as StateOptions<T>)
				: ({ default: optionsOrDefault } as StateOptions<T>)
	}

	return createState(key, options)
}

// Attach scope shortcuts as dot-notation properties
_state.local = _local
_state.session = _session
_state.url = _url
_state.bucket = _bucket
_state.server = _server

export const state: StateFunction = _state as StateFunction

// ---------------------------------------------------------------------------
// Deprecated standalone scope shortcuts
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `state.local()` instead. Will be removed in 1.0.0.
 *
 * Create state stored in `localStorage`.
 *
 * ```ts
 * const theme = state.local({ theme: 'light' })
 * ```
 */
export function local<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	warnDeprecated('local')
	return _local(entry, options)
}

/**
 * @deprecated Use `state.session()` instead. Will be removed in 1.0.0.
 *
 * Create state stored in `sessionStorage`.
 *
 * ```ts
 * const draft = state.session({ draft: '' })
 * ```
 */
export function session<T>(
	entry: Record<string, T>,
	options?: ShortcutOptions<T>,
): StateInstance<T> {
	warnDeprecated('session')
	return _session(entry, options)
}

/**
 * @deprecated Use `state.url()` instead. Will be removed in 1.0.0.
 *
 * Create state stored in `URLSearchParams`.
 *
 * ```ts
 * const filters = state.url({ q: '' })
 * ```
 */
export function url<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	warnDeprecated('url')
	return _url(entry, options)
}

/**
 * @deprecated Use `state.server()` instead. Will be removed in 1.0.0.
 *
 * Create state stored in server-side `AsyncLocalStorage`.
 *
 * ```ts
 * const user = state.server({ user: null })
 * ```
 */
export function server<T>(
	entry: Record<string, T>,
	options?: ShortcutOptions<T>,
): StateInstance<T> {
	warnDeprecated('server')
	return _server(entry, options)
}

/**
 * @deprecated Use `state.bucket()` instead. Will be removed in 1.0.0.
 *
 * Create state stored in a Storage Bucket.
 *
 * ```ts
 * const data = state.bucket({ cache: [] }, { bucket: { name: 'my-bucket' } })
 * ```
 */
export function bucket<T>(
	entry: Record<string, T>,
	options: BucketShortcutOptions<T>,
): StateInstance<T> {
	warnDeprecated('bucket')
	return _bucket(entry, options)
}
