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
// state() — the universal entry point
// ---------------------------------------------------------------------------

/**
 * Create a stateful value.
 *
 * Preferred — entry object form (key derived from property name):
 *
 * ```ts
 * const counter = state({ counter: 0 })
 * const theme = state({ theme: 'light' }, { scope: 'local' })
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
export function state<T>(
	entry: Record<string, T>,
	options?: Omit<StateOptions<T>, 'default'>,
): StateInstance<T>
export function state<T>(key: string, options: StateOptions<T>): StateInstance<T>
export function state<T>(
	key: string,
	defaultValue: T,
	options: Omit<StateOptions<T>, 'default'>,
): StateInstance<T>
export function state<T extends string | number | boolean | null | undefined>(
	key: string,
	defaultValue: T,
): StateInstance<Widen<T>>
export function state<T>(
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

// ---------------------------------------------------------------------------
// Scope shortcuts
// ---------------------------------------------------------------------------

/**
 * Create state stored in `localStorage`.
 *
 * ```ts
 * const theme = local({ theme: 'light' })
 * const synced = local({ theme: 'dark' }, { sync: true })
 * ```
 */
export function local<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'local' })
}

/**
 * Create state stored in `sessionStorage`.
 *
 * ```ts
 * const draft = session({ draft: '' })
 * ```
 */
export function session<T>(
	entry: Record<string, T>,
	options?: ShortcutOptions<T>,
): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'tab' })
}

/**
 * Create state stored in `URLSearchParams`.
 *
 * ```ts
 * const filters = url({ filters: { q: '' } })
 * ```
 */
export function url<T>(entry: Record<string, T>, options?: ShortcutOptions<T>): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'url' })
}

/**
 * Create state stored in server-side `AsyncLocalStorage`.
 *
 * ```ts
 * const user = server({ user: null })
 * ```
 */
export function server<T>(
	entry: Record<string, T>,
	options?: ShortcutOptions<T>,
): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'server' })
}

/**
 * Create state stored in a Storage Bucket.
 *
 * ```ts
 * const data = bucket({ cache: [] }, { bucket: { name: 'my-bucket' } })
 * ```
 */
export function bucket<T>(
	entry: Record<string, T>,
	options: BucketShortcutOptions<T>,
): StateInstance<T> {
	const [key, defaultValue] = extractEntry(entry)

	return createState(key, { ...options, default: defaultValue, scope: 'bucket' })
}
