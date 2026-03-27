import { describe, expect, it } from 'vitest'
import { computed, readonly, state } from '../src/index.js'
import { isWritable } from '../src/is-writable.js'

describe('isWritable', () => {
	it('returns true for a writable state instance', () => {
		const s = state('iw-writable', { default: 0, scope: 'memory' })

		expect(isWritable(s)).toBe(true)
	})

	it('returns false for a readonly wrapper', () => {
		const s = state('iw-readonly', { default: 0, scope: 'memory' })

		const ro = readonly(s)

		expect(isWritable(ro)).toBe(false)
	})

	it('returns false for a computed instance', () => {
		const s = state('iw-comp-src', { default: 0, scope: 'memory' })

		const c = computed([s], ([v]) => (v ?? 0) * 2)

		expect(isWritable(c)).toBe(false)
	})

	it('returns true for state even after set/reset', () => {
		const s = state('iw-after-ops', { default: 'hello', scope: 'memory' })

		s.set('world')
		s.reset()

		expect(isWritable(s)).toBe(true)
	})
})
