import { describe, expect, it } from 'vitest'
import { useSelector, useStoreValue } from '../src/react/index.js'

// These hooks rely on React internals (useSyncExternalStore, useCallback).
// Full rendering tests would require a .tsx setup with @testing-library/react.
// Here we verify the hooks are properly exported and the module loads cleanly.

describe('React hook exports', () => {
	it('useSelector is exported as a function', () => {
		expect(typeof useSelector).toBe('function')
	})

	it('useStoreValue is exported as a function', () => {
		expect(typeof useStoreValue).toBe('function')
	})
})
