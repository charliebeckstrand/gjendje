import { describe, expect, it, vi } from 'vitest'
import { state } from '../../src/shortcuts.js'

describe('interceptor chain behaviour', () => {
	it('second interceptor receives undefined when first returns undefined', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state('int-midchain', { default: 1 })

		const secondReceived: unknown[] = []

		s.intercept(() => undefined as unknown as number)
		s.intercept((next) => {
			secondReceived.push(next)
			return (next as number) + 100
		})

		s.set(5)

		// First interceptor returned undefined, second received undefined,
		// returned NaN (undefined + 100). Final check is NaN !== undefined,
		// so the set goes through with NaN — documenting the known limitation.
		expect(secondReceived).toEqual([undefined])

		warnSpy.mockRestore()
		s.destroy()
	})

	it('Promise returned mid-chain aborts the set', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state('int-midchain-promise', { default: 1 })

		s.intercept(() => Promise.resolve(42) as unknown as number)
		s.intercept((next) => next)

		s.set(5)

		expect(s.get()).toBe(1)
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Promise'))

		warnSpy.mockRestore()
		s.destroy()
	})

	it('three interceptors compose correctly', () => {
		const s = state('int-triple', { default: 0 })

		s.intercept((next) => next + 1)
		s.intercept((next) => next * 2)
		s.intercept((next) => next + 10)

		// Chain: 5 → +1 → 6 → *2 → 12 → +10 → 22
		s.set(5)

		expect(s.get()).toBe(22)

		s.destroy()
	})
})
