import { describe, expect, it, vi } from 'vitest'
import { readonly, state } from '../src/index.js'

describe('readonly', () => {
	it('exposes get() from the source', () => {
		const base = state('ro-get', { default: 42, scope: 'render' })
		const ro = readonly(base)

		expect(ro.get()).toBe(42)
	})

	it('reflects source changes', () => {
		const base = state('ro-reflect', { default: 'a', scope: 'render' })
		const ro = readonly(base)

		base.set('b')
		expect(ro.get()).toBe('b')
	})

	it('does not expose set, reset, intercept, or use', () => {
		const base = state('ro-no-write', { default: 0, scope: 'render' })
		const ro = readonly(base)

		expect('set' in ro).toBe(false)
		expect('reset' in ro).toBe(false)
		expect('intercept' in ro).toBe(false)
		expect('use' in ro).toBe(false)
	})

	it('supports subscribe', () => {
		const base = state('ro-sub', { default: 0, scope: 'render' })
		const ro = readonly(base)

		const listener = vi.fn()

		ro.subscribe(listener)
		base.set(1)

		expect(listener).toHaveBeenCalledWith(1)
	})

	it('supports peek', () => {
		const base = state('ro-peek', { default: 'hello', scope: 'render' })
		const ro = readonly(base)

		expect(ro.peek()).toBe('hello')
	})

	it('delegates lifecycle properties', () => {
		const base = state('ro-lifecycle', { default: 0, scope: 'render' })
		const ro = readonly(base)

		expect(ro.key).toBe('ro-lifecycle')
		expect(ro.scope).toBe('render')
		expect(ro.isDestroyed).toBe(false)
	})

	it('destroy delegates to source', () => {
		const base = state('ro-destroy', { default: 0, scope: 'render' })
		const ro = readonly(base)

		ro.destroy()

		expect(base.isDestroyed).toBe(true)
		expect(ro.isDestroyed).toBe(true)
	})
})
