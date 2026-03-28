import type { Scope } from './types.js'

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

/**
 * Base error class for all gjendje errors.
 *
 * All errors emitted through the `onError` callback or thrown by gjendje
 * extend this class, allowing consumers to discriminate error types:
 *
 * ```ts
 * configure({
 *   onError({ error }) {
 *     if (error instanceof StorageReadError) {
 *       // handle corrupted/unparseable storage
 *     } else if (error instanceof StorageWriteError) {
 *       // handle write failure (quota, permissions)
 *     } else if (error instanceof MigrationError) {
 *       // handle failed schema migration
 *     } else if (error instanceof InterceptorError) {
 *       // handle interceptor throw
 *     } else if (error instanceof ComputedError) {
 *       // handle computed derivation throw
 *     }
 *   },
 * })
 * ```
 */
export class GjendjeError extends Error {
	readonly key: string
	readonly scope: Scope

	constructor(message: string, key: string, scope: Scope, options?: ErrorOptions) {
		super(message, options)
		this.name = 'GjendjeError'
		this.key = key
		this.scope = scope
	}
}

// ---------------------------------------------------------------------------
// Storage errors
// ---------------------------------------------------------------------------

/**
 * Thrown when reading from storage fails (corrupt data, parse error, etc.).
 */
export class StorageReadError extends GjendjeError {
	constructor(key: string, scope: Scope, cause?: unknown) {
		super(
			`Failed to read key "${key}" from ${scope} storage.`,
			key,
			scope,
			cause !== undefined ? { cause } : undefined,
		)
		this.name = 'StorageReadError'
	}
}

/**
 * Thrown when writing to storage fails (quota exceeded, permissions, etc.).
 *
 * When the failure is specifically a quota error, `isQuotaError` is `true`.
 */
export class StorageWriteError extends GjendjeError {
	readonly isQuotaError: boolean

	constructor(key: string, scope: Scope, cause?: unknown, isQuotaError = false) {
		super(
			isQuotaError
				? `Storage quota exceeded writing key "${key}" to ${scope} storage.`
				: `Failed to write key "${key}" to ${scope} storage.`,
			key,
			scope,
			cause !== undefined ? { cause } : undefined,
		)
		this.name = 'StorageWriteError'
		this.isQuotaError = isQuotaError
	}
}

// ---------------------------------------------------------------------------
// Migration / validation errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a schema migration function throws during `readAndMigrate()`.
 */
export class MigrationError extends GjendjeError {
	readonly fromVersion: number
	readonly toVersion: number

	constructor(key: string, scope: Scope, fromVersion: number, toVersion: number, cause?: unknown) {
		super(
			`Migration from v${fromVersion} to v${toVersion} failed for key "${key}".`,
			key,
			scope,
			cause !== undefined ? { cause } : undefined,
		)
		this.name = 'MigrationError'
		this.fromVersion = fromVersion
		this.toVersion = toVersion
	}
}

/**
 * Thrown when a `validate()` function rejects a value read from storage.
 */
export class ValidationError extends GjendjeError {
	readonly rejectedValue: unknown

	constructor(key: string, scope: Scope, rejectedValue: unknown) {
		super(`Validation failed for key "${key}" in ${scope} storage.`, key, scope)
		this.name = 'ValidationError'
		this.rejectedValue = rejectedValue
	}
}

// ---------------------------------------------------------------------------
// Interceptor errors
// ---------------------------------------------------------------------------

/**
 * Thrown when an interceptor function throws during state access.
 */
export class InterceptorError extends GjendjeError {
	constructor(key: string, scope: Scope, cause?: unknown) {
		super(
			`Interceptor threw for key "${key}".`,
			key,
			scope,
			cause !== undefined ? { cause } : undefined,
		)
		this.name = 'InterceptorError'
	}
}

// ---------------------------------------------------------------------------
// Computed errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a computed derivation function throws during recomputation.
 */
export class ComputedError extends GjendjeError {
	constructor(key: string, scope: Scope, cause?: unknown) {
		super(
			`Computed derivation threw for "${key}".`,
			key,
			scope,
			cause !== undefined ? { cause } : undefined,
		)
		this.name = 'ComputedError'
	}
}

// ---------------------------------------------------------------------------
// Sync errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a cross-tab BroadcastChannel sync operation fails.
 */
export class SyncError extends GjendjeError {
	constructor(key: string, scope: Scope, cause?: unknown) {
		super(
			`Cross-tab sync failed for key "${key}".`,
			key,
			scope,
			cause !== undefined ? { cause } : undefined,
		)
		this.name = 'SyncError'
	}
}

// ---------------------------------------------------------------------------
// Hydration errors
// ---------------------------------------------------------------------------

/**
 * Thrown when SSR hydration fails to read the real storage value.
 */
export class HydrationError extends GjendjeError {
	constructor(key: string, scope: Scope, cause?: unknown) {
		super(
			`Hydration failed for key "${key}" — adapter unavailable.`,
			key,
			scope,
			cause !== undefined ? { cause } : undefined,
		)
		this.name = 'HydrationError'
	}
}
