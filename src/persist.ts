import { getConfig, log } from './config.js'
import type { Scope, StateOptions, VersionedValue } from './types.js'

function isVersionedValue(value: unknown): value is VersionedValue<unknown> {
	const hasShape = value !== null && typeof value === 'object' && 'v' in value && 'data' in value

	return hasShape && typeof (value as VersionedValue<unknown>).v === 'number'
}

/**
 * Given a raw string from storage, run the full pipeline:
 * 1. JSON parse
 * 2. Unwrap versioned envelope (if present)
 * 3. Run migration chain up to current version
 * 4. Validate final shape
 * 5. Return typed value or default
 */
export function readAndMigrate<T>(
	raw: string,
	options: StateOptions<T>,
	key?: string,
	scope?: Scope,
): T {
	const currentVersion = options.version ?? 1

	const defaultValue = options.default

	try {
		const parsed: unknown = JSON.parse(raw)

		// Detect versioned envelope — { v: number, data: unknown }
		let storedVersion = 1

		let data: unknown

		if (isVersionedValue(parsed)) {
			storedVersion = parsed.v

			data = parsed.data
		} else {
			// Legacy value with no version envelope — treat as version 1
			storedVersion = 1

			data = parsed
		}

		// Run migration chain if behind current version
		if (storedVersion < currentVersion && options.migrate) {
			data = runMigrations(data, storedVersion, currentVersion, options.migrate)

			if (key && scope) {
				getConfig().onMigrate?.({
					key,
					scope,
					fromVersion: storedVersion,
					toVersion: currentVersion,
					data,
				})
			}
		}

		// Validate final shape
		if (options.validate && !options.validate(data)) {
			return defaultValue
		}

		return data as T
	} catch {
		log('debug', `Failed to read/migrate stored value — falling back to default.`)
		return defaultValue
	}
}

/**
 * Wrap a value in a versioned envelope before writing to storage.
 * If no version is specified, writes the raw value for backwards compat.
 */
export function wrapForStorage<T>(value: T, version?: number): string {
	if (!version || version === 1) {
		return JSON.stringify(value)
	}

	const envelope: VersionedValue<T> = { v: version, data: value }

	return JSON.stringify(envelope)
}

// ---------------------------------------------------------------------------
// Partial persistence helpers (pick / merge)
// ---------------------------------------------------------------------------

/**
 * Pick only the specified keys from an object value before writing to storage.
 * Returns the value unchanged when `keys` is undefined or the value is not an object.
 */
export function pickKeys<T>(value: T, keys: string[] | undefined): T {
	if (!keys || typeof value !== 'object' || value === null) return value

	const partial: Record<string, unknown> = {}

	for (const k of keys) {
		if (k in (value as Record<string, unknown>)) {
			partial[k] = (value as Record<string, unknown>)[k]
		}
	}

	return partial as T
}

/**
 * Merge stored (partial) keys back onto the full default value.
 * Returns the stored value unchanged when `keys` is undefined or the value is not an object.
 */
export function mergeKeys<T>(stored: T, defaultValue: T, keys: string[] | undefined): T {
	if (!keys || typeof stored !== 'object' || stored === null) return stored

	return { ...(defaultValue as object), ...(stored as object) } as T
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Run the migration chain from storedVersion up to currentVersion.
 * Each migration function transforms the value one version at a time.
 */
function runMigrations(
	data: unknown,
	fromVersion: number,
	toVersion: number,
	migrations: Record<number, (old: unknown) => unknown>,
): unknown {
	let current = data

	for (let v = fromVersion; v < toVersion; v++) {
		const migrateFn = migrations[v]

		if (migrateFn) {
			try {
				current = migrateFn(current)
			} catch {
				log('warn', `Migration from v${v} failed — returning partially migrated value.`)
				return current
			}
		}
	}

	return current
}
