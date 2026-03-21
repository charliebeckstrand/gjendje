import { describe, expect, it } from 'vitest'
import { useSelector, useSharedState, useStore } from '../src/react/index.js'

describe('React hook exports', () => {
	it('useStore is exported as a function', () => {
		expect(typeof useStore).toBe('function')
	})

	it('useSharedState is exported as a function', () => {
		expect(typeof useSharedState).toBe('function')
	})

	it('useSelector is exported as a function', () => {
		expect(typeof useSelector).toBe('function')
	})
})
