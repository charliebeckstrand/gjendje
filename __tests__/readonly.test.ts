import { describe, expect, it, vi } from 'vitest'
import { readonly, state } from '../src/index.js'

describe('readonly', () => {
	it('exposes get() from the source', () => {
		const base = state('ro-get', { default: 42, scope: 'memory' })
		const ro = readonly(base)

		expect(ro.get()).toBe(42)
	})

	it('reflects source changes', () => {
		const base = state('ro-reflect', { default: 'a', scope: 'memory' })
		const ro = readonly(base)

		base.set('b')
		expect(ro.get()).toBe('b')
	})

	it('shadows set, reset, and intercept as undefined', () => {
		const base = state('ro-no-write', { default: 0, scope: 'memory' })
		const ro = readonly(base)

		// Write methods are shadowed with undefined on the wrapper —
		// calling them from untyped JS would throw "not a function".
		expect((ro as unknown as Record<string, unknown>).set).toBeUndefined()
		expect((ro as unknown as Record<string, unknown>).reset).toBeUndefined()
		expect((ro as unknown as Record<string, unknown>).intercept).toBeUndefined()
	})

	it('supports subscribe', () => {
		const base = state('ro-sub', { default: 0, scope: 'memory' })
		const ro = readonly(base)

		const listener = vi.fn()

		ro.subscribe(listener)
		base.set(1)

		expect(listener).toHaveBeenCalledWith(1)
	})

	it('supports peek', () => {
		const base = state('ro-peek', { default: 'hello', scope: 'memory' })
		const ro = readonly(base)

		expect(ro.peek()).toBe('hello')
	})

	it('delegates lifecycle properties', () => {
		const base = state('ro-lifecycle', { default: 0, scope: 'memory' })
		const ro = readonly(base)

		expect(ro.key).toBe('ro-lifecycle')
		expect(ro.scope).toBe('memory')
		expect(ro.isDestroyed).toBe(false)
	})

	it('destroy delegates to source', () => {
		const base = state('ro-destroy', { default: 0, scope: 'memory' })
		const ro = readonly(base)

		ro.destroy()

		expect(base.isDestroyed).toBe(true)
		expect(ro.isDestroyed).toBe(true)
	})
})
