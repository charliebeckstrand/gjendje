import { createBase } from './core.js'
import type { Scope, StateInstance, StateOptions } from './types.js'

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
// Core scope shortcut implementations (shared by state.* and standalone)
// ---------------------------------------------------------------------------

function scopeShortcut<T>(
	scope: Scope,
	entry: Record<string, T>,
	options?: Omit<StateOptions<T>, 'default' | 'scope'>,
): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createBase(key, { ...options, default: defaultValue, scope })
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
 *
 * @throws {Error} If `version` is not a positive integer.
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

	return createBase(key, options)
}

// Attach scope shortcuts as dot-notation properties
_state.local = <T>(e: Record<string, T>, o?: ShortcutOptions<T>) => scopeShortcut('local', e, o)
_state.session = <T>(e: Record<string, T>, o?: ShortcutOptions<T>) => scopeShortcut('session', e, o)
_state.url = <T>(e: Record<string, T>, o?: ShortcutOptions<T>) => scopeShortcut('url', e, o)
_state.bucket = <T>(e: Record<string, T>, o: BucketShortcutOptions<T>) =>
	scopeShortcut('bucket', e, o)
_state.server = <T>(e: Record<string, T>, o?: ShortcutOptions<T>) => scopeShortcut('server', e, o)

export const state: StateFunction = _state as StateFunction
