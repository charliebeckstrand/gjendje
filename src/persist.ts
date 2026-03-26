import { getConfig, log } from './config.js'
import { MigrationError, StorageReadError, ValidationError } from './errors.js'
import type { Scope, StateOptions, VersionedValue } from './types.js'
import { isRecord } from './utils.js'

function isVersionedValue(value: unknown): value is VersionedValue<unknown> {
	if (!isRecord(value)) return false

	return 'v' in value && 'data' in value && Number.isSafeInteger(value.v)
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
			data = parsed
		}

		// Run migration chain if behind current version
		if (storedVersion < currentVersion && options.migrate) {
			data = runMigrations(data, storedVersion, currentVersion, options.migrate, key, scope)

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
			if (key && scope) {
				const config = getConfig()

				config.onValidationFail?.({ key, scope, value: data })

				const validationErr = new ValidationError(key, scope, data)

				config.onError?.({ key, scope, error: validationErr })
			}

			return defaultValue
		}

		return data as T
	} catch (err) {
		log('debug', `Failed to read/migrate stored value — falling back to default.`)

		if (key && scope) {
			const readErr = new StorageReadError(key, scope, err)

			getConfig().onError?.({ key, scope, error: readErr })
		}

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
	if (!keys || !isRecord(value)) return value

	const partial: Record<string, unknown> = {}

	for (const k of keys) {
		if (Object.hasOwn(value, k)) {
			partial[k] = value[k]
		}
	}

	return partial as T
}

/**
 * Merge stored (partial) keys back onto the full default value.
 * Returns the stored value unchanged when `keys` is undefined or the value is not an object.
 */
export function mergeKeys<T>(stored: T, defaultValue: T, keys: string[] | undefined): T {
	if (!keys || !isRecord(stored)) return stored

	return { ...(defaultValue as object), ...(stored as object) } as T
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Run the migration chain from storedVersion up to currentVersion.
 * Each migration function transforms the value one version at a time.
 */
/** Maximum migration steps to prevent runaway loops from corrupted version numbers. */
const MAX_MIGRATION_STEPS = 1000

function runMigrations(
	data: unknown,
	fromVersion: number,
	toVersion: number,
	migrations: Record<number, (old: unknown) => unknown>,
	key?: string,
	scope?: Scope,
): unknown {
	if (fromVersion < 0 || toVersion - fromVersion > MAX_MIGRATION_STEPS) {
		log('warn', `Migration range v${fromVersion}→v${toVersion} is out of bounds — skipping.`)

		return data
	}

	let current = data

	for (let v = fromVersion; v < toVersion; v++) {
		const migrateFn = migrations[v]

		if (migrateFn) {
			try {
				current = migrateFn(current)
			} catch (err) {
				log('warn', `Migration from v${v} failed — returning partially migrated value.`)

				if (key && scope) {
					const migrationErr = new MigrationError(key, scope, v, toVersion, err)

					getConfig().onError?.({ key, scope, error: migrationErr })
				}

				return current
			}
		}
	}

	return current
}
