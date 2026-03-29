import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disableDevTools, enableDevTools } from '../src/devtools/index.js'
import { configure, readonly, state } from '../src/index.js'

// ---------------------------------------------------------------------------
// Mock Redux DevTools Extension (reused pattern from devtools-integration)
// ---------------------------------------------------------------------------

function createMockDevTools() {
	const actions: Array<{ action: unknown; state: unknown }> = []

	let subscriber: ((message: unknown) => void) | undefined

	const instance = {
		init: vi.fn(),
		send: vi.fn((action: unknown, globalState: unknown) => {
			actions.push({ action, state: globalState })
		}),
		subscribe: vi.fn((listener: (message: unknown) => void) => {
			subscriber = listener

			return () => {
				subscriber = undefined
			}
		}),
	}

	return {
		instance,
		actions,
		connect: vi.fn(() => instance),
		emit(message: unknown) {
			subscriber?.(message)
		},
	}
}

function installMockExtension(mock: ReturnType<typeof createMockDevTools>): void {
	Object.defineProperty(globalThis, '__REDUX_DEVTOOLS_EXTENSION__', {
		value: mock,
		configurable: true,
		writable: true,
	})
}

function removeMockExtension(): void {
	Object.defineProperty(globalThis, '__REDUX_DEVTOOLS_EXTENSION__', {
		value: undefined,
		configurable: true,
		writable: true,
	})
}

// ---------------------------------------------------------------------------
// Finding #1 — readonly() shadows patch
// ---------------------------------------------------------------------------

describe('Finding #1: readonly() shadows patch', () => {
	it('patch is undefined on a readonly wrapper', () => {
		const base = state('ro-patch-shadow', { default: { x: 1, y: 2 }, scope: 'memory' })

		const ro = readonly(base)

		expect((ro as unknown as Record<string, unknown>).patch).toBeUndefined()

		base.destroy()
	})

	it('original instance patch still works after wrapping with readonly', () => {
		const base = state('ro-patch-original', { default: { x: 1, y: 2 }, scope: 'memory' })

		const ro = readonly(base)

		base.patch({ x: 10 })

		expect(base.get()).toEqual({ x: 10, y: 2 })
		expect(ro.get()).toEqual({ x: 10, y: 2 })

		base.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #2 — DevTools time-travel set() error handling
// ---------------------------------------------------------------------------

describe('Finding #2: DevTools time-travel set() error handling', () => {
	beforeEach(() => {
		configure({
			onChange: undefined,
			onReset: undefined,
			onRegister: undefined,
			onDestroy: undefined,
		})

		disableDevTools()

		removeMockExtension()
	})

	afterEach(() => {
		disableDevTools()

		removeMockExtension()
	})

	it('when one instance set() throws during JUMP_TO_STATE, remaining instances still get updated', () => {
		const mock = createMockDevTools()

		installMockExtension(mock)

		const s1 = state('rdx-err-a', { default: 0 })
		const s2 = state('rdx-err-b', { default: 0 })

		enableDevTools({ logger: false })

		// Make s1.set throw when called with a specific value
		const originalSet = s1.set.bind(s1)
		s1.set = (v: unknown) => {
			if (v === 999) {
				throw new Error('set boom')
			}
			originalSet(v as number)
		}

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		// Simulate time-travel that sets both instances
		mock.emit({
			type: 'DISPATCH',
			state: JSON.stringify({ 'rdx-err-a': 999, 'rdx-err-b': 42 }),
			payload: { type: 'JUMP_TO_STATE' },
		})

		// s1 threw, so its value should remain at the default
		expect(s1.get()).toBe(0)

		// s2 should have been updated despite s1 throwing
		expect(s2.get()).toBe(42)

		// Error should have been logged
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('time-travel set failed'),
			expect.any(Error),
		)

		errorSpy.mockRestore()

		s1.destroy()
		s2.destroy()
	})

	it('error in one instance does not prevent JUMP_TO_ACTION from updating others', () => {
		const mock = createMockDevTools()

		installMockExtension(mock)

		const s1 = state('rdx-err-action-a', { default: 'a' })
		const s2 = state('rdx-err-action-b', { default: 'b' })

		enableDevTools({ logger: false })

		// Make s1.set always throw
		s1.set = () => {
			throw new Error('always fails')
		}

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		mock.emit({
			type: 'DISPATCH',
			state: JSON.stringify({ 'rdx-err-action-a': 'new-a', 'rdx-err-action-b': 'new-b' }),
			payload: { type: 'JUMP_TO_ACTION', actionId: 1 },
		})

		// s1 failed, stays at default
		expect(s1.get()).toBe('a')

		// s2 should still be updated
		expect(s2.get()).toBe('new-b')

		errorSpy.mockRestore()

		s1.destroy()
		s2.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding #3 — React hook selector stability in useMemo deps
// ---------------------------------------------------------------------------

// React testing infrastructure is available (@testing-library/react is installed
// and __tests__/react.test.ts exists), so we test the selector memoization fix.

import { act, renderHook } from '@testing-library/react'
import { useGjendje } from '../src/react/index.js'

describe('Finding #3: useMemo deps use !!selector for stability', () => {
	it('changing selector reference (with same truthiness) does not change return type shape', () => {
		const source = state('react-sel-stable', { default: { x: 1, y: 2 }, scope: 'memory' })

		const selectorA = (v: { x: number; y: number }) => v.x
		const selectorB = (v: { x: number; y: number }) => v.x

		const { result, rerender } = renderHook(
			({ sel }: { sel: (v: { x: number; y: number }) => number }) => useGjendje(source, sel),
			{ initialProps: { sel: selectorA } },
		)

		expect(result.current).toBe(1)

		// Rerender with a different selector function reference (same truthiness: truthy)
		rerender({ sel: selectorB })

		// Should still return the selected value, not change to tuple or raw value
		expect(result.current).toBe(1)

		source.destroy()
	})

	it('switching from no selector to selector changes return shape', () => {
		const source = state('react-sel-switch', { default: 10, scope: 'memory' })

		// Start without selector (writable) => [value, set, reset]
		const { result: result1 } = renderHook(() => useGjendje(source))

		expect(Array.isArray(result1.current)).toBe(true)

		// With selector => returns selected value directly
		const { result: result2 } = renderHook(() => useGjendje(source, (v) => v * 2))

		expect(result2.current).toBe(20)

		source.destroy()
	})

	it('selector receives updated values after state changes', () => {
		const source = state('react-sel-update', { default: 5, scope: 'memory' })

		const { result } = renderHook(() => useGjendje(source, (v) => v * 3))

		expect(result.current).toBe(15)

		act(() => {
			source.set(10)
		})

		expect(result.current).toBe(30)

		source.destroy()
	})
})
