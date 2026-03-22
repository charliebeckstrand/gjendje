import { state } from './factory.js'
import type { StateInstance, StateOptions } from './types.js'

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

	return state(key, { ...options, default: defaultValue, scope: 'local' })
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

	return state(key, { ...options, default: defaultValue, scope: 'tab' })
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

	return state(key, { ...options, default: defaultValue, scope: 'url' })
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

	return state(key, { ...options, default: defaultValue, scope: 'bucket' })
}
