import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetRenderScopeWarning } from '../src/core.js'
import { state } from '../src/index.js'

describe('render scope deprecation warning', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>

	afterEach(() => {
		resetRenderScopeWarning()
		warnSpy.mockRestore()
	})

	it('warns on first use of scope "render"', () => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state('render-warn-1', 0, { scope: 'render' })

		expect(warnSpy).toHaveBeenCalledTimes(1)
		expect(warnSpy).toHaveBeenCalledWith(
			'[gjendje] The "render" scope is deprecated. Use "memory" instead. "render" will be removed in the next major version.',
		)

		s.destroy()
	})

	it('does not warn on subsequent uses', () => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const a = state('render-warn-2a', 0, { scope: 'render' })
		const b = state('render-warn-2b', 0, { scope: 'render' })

		expect(warnSpy).toHaveBeenCalledTimes(1)

		a.destroy()
		b.destroy()
	})

	it('does not warn when using scope "memory"', () => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state('render-warn-3', 0, { scope: 'memory' })

		expect(warnSpy).not.toHaveBeenCalled()

		s.destroy()
	})

	it('still works correctly with "render" scope', () => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state('render-warn-4', 42, { scope: 'render' })

		expect(s.get()).toBe(42)

		s.set(99)
		expect(s.get()).toBe(99)

		s.destroy()
	})
})
