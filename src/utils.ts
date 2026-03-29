// Shared resolved promise — avoids allocating a new one per instance.
// Exported so that computed/select can short-circuit Promise.all when
// all dependencies are memory-scoped (where ready/hydrated/settled === RESOLVED).
export const RESOLVED: Promise<void> = Promise.resolve()

/**
 * Type guard that narrows `unknown` to `Record<PropertyKey, unknown>`.
 * Useful anywhere you need to access dynamic properties on a value
 * without an unsafe inline `as` cast.
 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return value !== null && typeof value === 'object'
}

/**
 * Shallow equality check for primitives, arrays, and plain objects.
 * Returns true if the two values are structurally equal at one level deep.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true

	if (typeof a !== typeof b) return false

	if (a === null || b === null) return false

	if (typeof a !== 'object' || typeof b !== 'object') return false

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) return false

		if (a.length !== b.length) return false

		for (let i = 0; i < a.length; i++) {
			if (!Object.is(a[i], b[i])) return false
		}

		return true
	}

	if (Array.isArray(b)) return false

	// Set: compare size and shallow-compare elements
	if (a instanceof Set) {
		if (!(b instanceof Set)) return false

		if (a.size !== b.size) return false

		for (const item of a) {
			if (!b.has(item)) return false
		}

		return true
	}

	// Map: compare size and shallow-compare entries
	if (a instanceof Map) {
		if (!(b instanceof Map)) return false

		if (a.size !== b.size) return false

		for (const [key, val] of a) {
			if (!b.has(key) || !Object.is(val, b.get(key))) return false
		}

		return true
	}

	// Date: compare timestamps
	if (a instanceof Date) {
		return b instanceof Date && a.getTime() === b.getTime()
	}

	// RegExp: compare string representation
	if (a instanceof RegExp) {
		return b instanceof RegExp && a.toString() === b.toString()
	}

	// Already narrowed to non-null objects above — safe to index
	const objA = a as Record<PropertyKey, unknown>

	const objB = b as Record<PropertyKey, unknown>

	const keysA = Object.keys(objA)

	const keysB = Object.keys(objB)

	// Fast bail-out on different key counts
	if (keysA.length !== keysB.length) return false

	for (let i = 0; i < keysA.length; i++) {
		const key = keysA[i] as string

		if (!Object.hasOwn(objB, key) || !Object.is(objA[key], objB[key])) return false
	}

	return true
}

/**
 * Create a lazily-allocated destroyed promise.
 * The promise is only created when `.promise` is first accessed,
 * avoiding allocation for instances that are never awaited.
 */
export function createLazyDestroyed(): {
	readonly promise: Promise<void>
	resolve(): void
} {
	let _promise: Promise<void> | undefined

	let _resolve: (() => void) | undefined

	return {
		get promise(): Promise<void> {
			if (!_promise) {
				_promise = new Promise<void>((r) => {
					_resolve = r
				})
			}

			return _promise
		},

		resolve(): void {
			if (_resolve) {
				_resolve()
			} else {
				_promise = Promise.resolve()
			}
		},
	}
}
