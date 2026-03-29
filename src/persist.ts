import { getConfig, log } from './config.js'
import { MigrationError, StorageReadError, ValidationError } from './errors.js'
import { safeCallConfig } from './listeners.js'
import type { Scope, StateOptions, VersionedValue } from './types.js'
import { isRecord } from './utils.js'

function isVersionedValue(value: unknown): value is VersionedValue<unknown> {
	if (!isRecord(value)) return false

	// Strict check: envelope must have EXACTLY { v, data } — no extra keys.
	// wrapForStorage() only creates { v, data }, so real envelopes always match.
	// Without this, user data shaped like { v: 1, data: "x", status: "ok" }
	// would be misidentified as an envelope, silently dropping extra properties.
	return (
		Object.keys(value).length === 2 &&
		'v' in value &&
		'data' in value &&
		Number.isSafeInteger(value.v)
	)
}

/**
 * Given an already-parsed value from storage, run the post-parse pipeline:
 * 1. Unwrap versioned envelope (if present)
 * 2. Run migration chain up to current version
 * 3. Validate final shape
 * 4. Return typed value or default
 *
 * Shared by both the default JSON path and the custom serializer path.
 */
export function processParsedValue<T>(
	parsed: unknown,
	options: StateOptions<T>,
	key?: string,
	scope?: Scope,
	onFallback?: () => void,
): T {
	const currentVersion = options.version ?? 1

	const defaultValue = options.default

	// Detect versioned envelope — { v: number, data: unknown }
	let storedVersion = 1

	let data: unknown

	if (isVersionedValue(parsed)) {
		storedVersion = parsed.v

		data = parsed.data
	} else {
		data = parsed
	}

	// Guard against future versions (tampered storage, newer app wrote data)
	if (storedVersion > currentVersion) {
		log(
			'warn',
			`Stored version (v${storedVersion}) is higher than current version (v${currentVersion}) for key "${key ?? 'unknown'}" — data may be from a newer app version. Returning as-is.`,
		)
	}

	// Run migration chain if behind current version
	if (storedVersion < currentVersion && options.migrate) {
		data = runMigrations(data, storedVersion, currentVersion, options.migrate, key, scope)

		if (key && scope) {
			safeCallConfig(getConfig().onMigrate, {
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

			safeCallConfig(config.onValidationFail, { key, scope, value: data })

			const validationErr = new ValidationError(key, scope, data)

			safeCallConfig(config.onError, { key, scope, error: validationErr })
		}

		onFallback?.()

		return defaultValue
	}

	return data as T
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
	onFallback?: () => void,
): T {
	try {
		const parsed: unknown = JSON.parse(raw)

		return processParsedValue(parsed, options, key, scope, onFallback)
	} catch (err) {
		log('debug', `Failed to read/migrate stored value — falling back to default.`)

		if (key && scope) {
			const readErr = new StorageReadError(key, scope, err)

			safeCallConfig(getConfig().onError, { key, scope, error: readErr })
		}

		onFallback?.()

		return options.default
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
	if (fromVersion < 0 || toVersion < 0 || toVersion - fromVersion > MAX_MIGRATION_STEPS) {
		log('warn', `Migration range v${fromVersion}→v${toVersion} is out of bounds — skipping.`)

		return data
	}

	// Guard against absurdly high stored versions that would bypass migration
	// entirely (e.g. manually tampered localStorage with v: 999999999).
	if (fromVersion > toVersion) {
		log(
			'warn',
			`Stored version (v${fromVersion}) is higher than current version (v${toVersion}) for key "${key ?? 'unknown'}" — data may be from a newer app version. Returning as-is.`,
		)

		return data
	}

	let current = data

	for (let v = fromVersion; v < toVersion; v++) {
		const migrateFn = migrations[v]

		if (migrateFn) {
			try {
				current = migrateFn(current)
			} catch (err) {
				log('warn', `Migration from v${v} failed — discarding partially migrated data.`)

				const migrationErr = new MigrationError(key ?? '', scope ?? 'memory', v, toVersion, err)

				if (key && scope) {
					safeCallConfig(getConfig().onError, { key, scope, error: migrationErr })
				}

				// Throw instead of returning partial data. The caller (readAndMigrate)
				// catches this, falls back to defaultValue, and triggers onFallback()
				// which backs up the original raw data. Returning partial data here
				// would poison the version envelope on the next set() — the partially
				// migrated value would be stamped with the current version, permanently
				// blocking the missing migration steps from ever running.
				throw migrationErr
			}
		}
	}

	return current
}
