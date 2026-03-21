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

	const keysA = Object.keys(a as Record<string, unknown>)
	const keysB = Object.keys(b as Record<string, unknown>)

	if (keysA.length !== keysB.length) return false

	const objA = a as Record<string, unknown>
	const objB = b as Record<string, unknown>

	for (const key of keysA) {
		if (!Object.hasOwn(objB, key)) return false

		if (!Object.is(objA[key], objB[key])) return false
	}

	return true
}
