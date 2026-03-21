import { describe, expect, it } from 'vitest'
import { computed, state } from '../src/index.js'

describe('computed key', () => {
	it('auto-generates a key when none is provided', () => {
		const a = state('ck-a', { default: 1, scope: 'render' })
		const c = computed([a], ([v]) => (v ?? 0) * 2)

		expect(c.key).toContain('computed:')
	})

	it('uses the provided key', () => {
		const a = state('ck-b', { default: 1, scope: 'render' })
		const c = computed([a], ([v]) => (v ?? 0) * 2, { key: 'double-b' })

		expect(c.key).toBe('double-b')
	})

	it('each computed gets a unique auto-generated key', () => {
		const a = state('ck-c', { default: 1, scope: 'render' })
		const c1 = computed([a], ([v]) => (v ?? 0) + 1)
		const c2 = computed([a], ([v]) => (v ?? 0) + 2)

		expect(c1.key).not.toBe(c2.key)
	})
})
