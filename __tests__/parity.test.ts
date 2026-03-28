import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batch } from '../src/batch.js'
import { computed } from '../src/computed.js'
import { configure, resetConfig } from '../src/config.js'
import { withHistory } from '../src/enhancers/history.js'
import { InterceptorError } from '../src/errors.js'
import { state } from '../src/shortcuts.js'
import { setupBrowserEnv } from './helpers.js'

// ---------------------------------------------------------------------------
// Helper — run the same suite against both memory and local scopes
// ---------------------------------------------------------------------------

function describeForBothScopes(name: string, fn: (scope: 'memory' | 'local') => void) {
	describe(`${name} (memory)`, () => {
		fn('memory')
	})

	describe(`${name} (local)`, () => {
		beforeEach(() => {
			setupBrowserEnv()
		})

		fn('local')
	})
}

// ---------------------------------------------------------------------------
// 1. get / set / reset basics
// ---------------------------------------------------------------------------

describeForBothScopes('get/set/reset basics', (scope) => {
	it('get() returns the default value', () => {
		const s = state(`par-basics-default-${scope}`, { default: 42, scope })

		expect(s.get()).toBe(42)

		s.destroy()
	})

	it('set() updates the stored value', () => {
		const s = state(`par-basics-set-${scope}`, { default: 0, scope })

		s.set(7)

		expect(s.get()).toBe(7)

		s.destroy()
	})

	it('set() with updater function receives current value', () => {
		const s = state(`par-basics-updater-${scope}`, { default: 10, scope })

		s.set((prev) => prev + 5)

		expect(s.get()).toBe(15)

		s.destroy()
	})

	it('reset() restores the default value', () => {
		const s = state(`par-basics-reset-${scope}`, { default: 100, scope })

		s.set(999)
		s.reset()

		expect(s.get()).toBe(100)

		s.destroy()
	})

	it('peek() returns the same value as get() on a live instance', () => {
		const s = state(`par-basics-peek-${scope}`, { default: 'hello', scope })

		s.set('world')

		expect(s.peek()).toBe(s.get())

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 2. subscribe notifications
// ---------------------------------------------------------------------------

describeForBothScopes('subscribe notifications', (scope) => {
	it('subscriber fires when value changes', () => {
		const s = state(`par-sub-fire-${scope}`, { default: 0, scope })

		const listener = vi.fn()

		s.subscribe(listener)
		s.set(1)

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(1)

		s.destroy()
	})

	it('unsubscribe stops notifications', () => {
		const s = state(`par-sub-unsub-${scope}`, { default: 0, scope })

		const listener = vi.fn()

		const unsub = s.subscribe(listener)

		s.set(1)
		unsub()
		s.set(2)

		expect(listener).toHaveBeenCalledTimes(1)

		s.destroy()
	})

	it('multiple subscribers all receive the notification', () => {
		const s = state(`par-sub-multi-${scope}`, { default: 0, scope })

		const listenerA = vi.fn()
		const listenerB = vi.fn()

		s.subscribe(listenerA)
		s.subscribe(listenerB)

		s.set(5)

		expect(listenerA).toHaveBeenCalledTimes(1)
		expect(listenerB).toHaveBeenCalledTimes(1)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 3. onChange handlers
// ---------------------------------------------------------------------------

describeForBothScopes('onChange handlers', (scope) => {
	it('onChange fires with (next, prev) when value changes', () => {
		const s = state(`par-onchange-args-${scope}`, { default: 0, scope })

		const handler = vi.fn()

		s.onChange(handler)
		s.set(99)

		expect(handler).toHaveBeenCalledTimes(1)
		expect(handler).toHaveBeenCalledWith(99, 0)

		s.destroy()
	})

	it('onChange fires on reset()', () => {
		const s = state(`par-onchange-reset-${scope}`, { default: 5, scope })

		const handler = vi.fn()

		s.set(20)
		s.onChange(handler)
		s.reset()

		expect(handler).toHaveBeenCalledWith(5, 20)

		s.destroy()
	})

	it('removeOnChange unsubscribe stops the handler', () => {
		const s = state(`par-onchange-unsub-${scope}`, { default: 0, scope })

		const handler = vi.fn()

		const remove = s.onChange(handler)

		s.set(1)
		remove()
		s.set(2)

		expect(handler).toHaveBeenCalledTimes(1)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 4. Intercept chain
// ---------------------------------------------------------------------------

describeForBothScopes('intercept chain', (scope) => {
	it('interceptor can transform the value', () => {
		const s = state(`par-intercept-transform-${scope}`, { default: 0, scope })

		s.intercept((next) => next * 2)
		s.set(5)

		expect(s.get()).toBe(10)

		s.destroy()
	})

	it('interceptor receives (next, prev)', () => {
		const s = state(`par-intercept-prev-${scope}`, { default: 1, scope })

		const spy = vi.fn((next: number) => next)

		s.intercept(spy)
		s.set(3)

		expect(spy).toHaveBeenCalledWith(3, 1)

		s.destroy()
	})

	it('removing interceptor restores plain pass-through', () => {
		const s = state(`par-intercept-remove-${scope}`, { default: 0, scope })

		const removeIntercept = s.intercept((next) => next + 100)

		s.set(1)

		expect(s.get()).toBe(101)

		removeIntercept()

		s.set(2)

		expect(s.get()).toBe(2)

		s.destroy()
	})

	it('multiple interceptors run in registration order', () => {
		const s = state(`par-intercept-chain-${scope}`, { default: 0, scope })

		s.intercept((next) => next + 10)
		s.intercept((next) => next * 2)

		s.set(5)

		// (5 + 10) * 2 = 30
		expect(s.get()).toBe(30)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 5. destroy lifecycle
// ---------------------------------------------------------------------------

describeForBothScopes('destroy lifecycle', (scope) => {
	it('isDestroyed is false before destroy()', () => {
		const s = state(`par-destroy-before-${scope}`, { default: 0, scope })

		expect(s.isDestroyed).toBe(false)

		s.destroy()
	})

	it('isDestroyed is true after destroy()', () => {
		const s = state(`par-destroy-after-${scope}`, { default: 0, scope })

		s.destroy()

		expect(s.isDestroyed).toBe(true)
	})

	it('peek() returns last value after destroy()', () => {
		const s = state(`par-destroy-peek-${scope}`, { default: 0, scope })

		s.set(77)
		s.destroy()

		expect(s.peek()).toBe(77)
	})

	it('set() is a no-op after destroy()', () => {
		const s = state(`par-destroy-set-${scope}`, { default: 0, scope })

		s.set(10)
		s.destroy()
		s.set(999)

		expect(s.peek()).toBe(10)
	})

	it('destroyed promise resolves after destroy()', async () => {
		const s = state(`par-destroy-promise-${scope}`, { default: 0, scope })

		const p = s.destroyed

		s.destroy()

		await expect(p).resolves.toBeUndefined()
	})
})

// ---------------------------------------------------------------------------
// 6. Double destroy safety
// ---------------------------------------------------------------------------

describeForBothScopes('double destroy safety', (scope) => {
	it('calling destroy() twice does not throw', () => {
		const s = state(`par-double-destroy-${scope}`, { default: 0, scope })

		s.destroy()

		expect(() => s.destroy()).not.toThrow()
	})

	it('isDestroyed remains true after double destroy()', () => {
		const s = state(`par-double-destroy-isd-${scope}`, { default: 0, scope })

		s.destroy()
		s.destroy()

		expect(s.isDestroyed).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// 7. Integration — interceptor abort + batch + computed
// ---------------------------------------------------------------------------

describe('integration: interceptor abort inside batch does not propagate to computed', () => {
	it('computed retains old value when interceptor aborts inside a batch (memory)', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const base = state('int-batch-base-mem', { default: 0, scope: 'memory' })

		const derived = computed([base], ([v]) => (v ?? 0) * 10)

		// Intercept that always returns undefined — causes the set to be aborted
		base.intercept(() => undefined as unknown as number)

		const listenerDerived = vi.fn()

		derived.subscribe(listenerDerived)

		batch(() => {
			base.set(5)
		})

		// derived should still be 0 because the set was aborted
		expect(derived.get()).toBe(0)
		expect(listenerDerived).not.toHaveBeenCalled()

		warnSpy.mockRestore()
		derived.destroy()
		base.destroy()
	})
})

// ---------------------------------------------------------------------------
// 8. Integration — post-destroy onChange handler should not fire
// ---------------------------------------------------------------------------

describe('integration: post-destroy onChange handler does not fire', () => {
	it('onChange handler does not fire after destroy() (memory)', () => {
		const s = state('int-postdestroy-mem', { default: 0, scope: 'memory' })

		const handler = vi.fn()

		s.onChange(handler)
		s.destroy()

		// Attempt to set after destroy — should be a no-op
		s.set(99)

		expect(handler).not.toHaveBeenCalled()
	})

	it('onChange handler does not fire after destroy() (local)', () => {
		setupBrowserEnv()

		const s = state('int-postdestroy-local', { default: 0, scope: 'local' })

		const handler = vi.fn()

		s.onChange(handler)
		s.destroy()

		s.set(99)

		expect(handler).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// 9. Integration — computed with destroyed dependency
// ---------------------------------------------------------------------------

describe('integration: computed handles a destroyed dependency gracefully', () => {
	it('computed.get() still returns cached value after its dependency is destroyed', () => {
		const dep = state('int-comp-dep', { default: 5, scope: 'memory' })

		const derived = computed([dep], ([v]) => (v ?? 0) + 1)

		// Verify initial state
		expect(derived.get()).toBe(6)

		dep.set(10)

		expect(derived.get()).toBe(11)

		// Destroy the dependency
		dep.destroy()

		// computed cached value remains accessible
		expect(derived.get()).toBe(11)

		derived.destroy()
	})

	it('computed.isDestroyed remains false even if its dependency is destroyed', () => {
		const dep = state('int-comp-dep-isd', { default: 0, scope: 'memory' })

		const derived = computed([dep], ([v]) => (v ?? 0) * 2)

		dep.destroy()

		expect(derived.isDestroyed).toBe(false)

		derived.destroy()
	})
})

// ---------------------------------------------------------------------------
// 10. Validation edge cases — withHistory maxSize
// ---------------------------------------------------------------------------

describe('withHistory maxSize validation', () => {
	it('rejects maxSize: 0', () => {
		const s = state('hist-val-0', { default: 0, scope: 'memory' })

		expect(() => withHistory(s, { maxSize: 0 })).toThrow()

		s.destroy()
	})

	it('rejects maxSize: -1', () => {
		const s = state('hist-val-neg1', { default: 0, scope: 'memory' })

		expect(() => withHistory(s, { maxSize: -1 })).toThrow()

		s.destroy()
	})

	it('rejects maxSize: 1.5', () => {
		const s = state('hist-val-1p5', { default: 0, scope: 'memory' })

		expect(() => withHistory(s, { maxSize: 1.5 })).toThrow()

		s.destroy()
	})

	it('rejects maxSize: NaN', () => {
		const s = state('hist-val-nan', { default: 0, scope: 'memory' })

		expect(() => withHistory(s, { maxSize: NaN })).toThrow()

		s.destroy()
	})

	it('rejects maxSize: Infinity', () => {
		const s = state('hist-val-inf', { default: 0, scope: 'memory' })

		expect(() => withHistory(s, { maxSize: Infinity })).toThrow()

		s.destroy()
	})

	it('accepts maxSize: 1', () => {
		const s = state('hist-val-1', { default: 0, scope: 'memory' })

		const h = withHistory(s, { maxSize: 1 })

		expect(h).toBeDefined()

		h.destroy()
	})

	it('accepts maxSize: 100', () => {
		const s = state('hist-val-100', { default: 0, scope: 'memory' })

		const h = withHistory(s, { maxSize: 100 })

		expect(h).toBeDefined()

		h.destroy()
	})
})

// ---------------------------------------------------------------------------
// 11. Validation edge cases — configure maxKeys
// ---------------------------------------------------------------------------

describe('configure maxKeys validation', () => {
	afterEach(() => {
		resetConfig()
	})

	it('configure({ maxKeys: 0 }) throws', () => {
		expect(() => configure({ maxKeys: 0 })).toThrow()
	})

	it('configure({ maxKeys: -1 }) throws', () => {
		expect(() => configure({ maxKeys: -1 })).toThrow()
	})

	it('configure({ maxKeys: 1.5 }) throws', () => {
		expect(() => configure({ maxKeys: 1.5 })).toThrow()
	})

	it('configure({ maxKeys: 1 }) works', () => {
		expect(() => configure({ maxKeys: 1 })).not.toThrow()

		resetConfig()
	})
})

// ---------------------------------------------------------------------------
// 12. Validation edge cases — createBucketAdapter with empty name
// ---------------------------------------------------------------------------

describe('createBucketAdapter with empty bucket name', () => {
	it('throws when bucket.name is an empty string', () => {
		setupBrowserEnv()

		expect(() =>
			state('bucket-empty-name', {
				default: 0,
				scope: 'bucket',
				bucket: { name: '' },
			}),
		).toThrow('[gjendje] bucket.name must be a non-empty string.')
	})
})

// ---------------------------------------------------------------------------
// 13. InterceptorError integration — interceptor throw propagates and is
//     reported via onError
// ---------------------------------------------------------------------------

describe('InterceptorError integration', () => {
	afterEach(() => {
		resetConfig()
	})

	it('interceptor that throws propagates the error to the caller (memory)', () => {
		const boom = new Error('interceptor exploded')

		const s = state('int-err-mem', { default: 0, scope: 'memory' })

		s.intercept(() => {
			throw boom
		})

		expect(() => s.set(1)).toThrow('Interceptor threw')

		s.destroy()
	})

	it('interceptor that throws is reported via configure onError (memory)', () => {
		const boom = new Error('reported error')

		const onError = vi.fn()

		configure({ onError })

		const s = state('int-err-onerror-mem', { default: 0, scope: 'memory' })

		s.intercept(() => {
			throw boom
		})

		// Expect the set to throw (error re-thrown after reporting)
		expect(() => s.set(1)).toThrow()

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'int-err-onerror-mem',
				scope: 'memory',
				error: expect.any(InterceptorError),
			}),
		)

		resetConfig()
		s.destroy()
	})

	it('interceptor that throws propagates the error to the caller (local)', () => {
		setupBrowserEnv()

		const boom = new Error('local interceptor exploded')

		const s = state('int-err-local', { default: 0, scope: 'local' })

		s.intercept(() => {
			throw boom
		})

		expect(() => s.set(1)).toThrow('Interceptor threw')

		s.destroy()
	})

	it('interceptor that throws is reported via configure onError (local)', () => {
		setupBrowserEnv()

		const boom = new Error('local reported error')

		const onError = vi.fn()

		configure({ onError })

		const s = state('int-err-onerror-local', { default: 0, scope: 'local' })

		s.intercept(() => {
			throw boom
		})

		expect(() => s.set(1)).toThrow()

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'int-err-onerror-local',
				scope: 'local',
				error: expect.any(InterceptorError),
			}),
		)

		resetConfig()
		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 14. patch() parity tests
// ---------------------------------------------------------------------------

describeForBothScopes('patch() parity', (scope) => {
	it('basic patch merges partial into existing object', () => {
		const s = state(`par-patch-basic-${scope}`, {
			default: { a: 1, b: 2, c: 3 },
			scope,
		})

		s.patch({ b: 20 })

		expect(s.get()).toEqual({ a: 1, b: 20, c: 3 })

		s.destroy()
	})

	it('patch() with empty object spreads into a new reference but keeps same values', () => {
		const s = state(`par-patch-empty-${scope}`, {
			default: { x: 1, y: 2 },
			scope,
		})

		const before = s.get()

		s.patch({})

		const after = s.get()

		// Values are equal
		expect(after).toEqual({ x: 1, y: 2 })
		// But it is a new object reference (spread creates a new object)
		expect(after).not.toBe(before)

		s.destroy()
	})

	it('patch() notifies subscribers with the merged result', () => {
		const s = state(`par-patch-notify-${scope}`, {
			default: { name: 'alice', age: 30 },
			scope,
		})

		const listener = vi.fn()

		s.subscribe(listener)
		s.patch({ age: 31 })

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith({ name: 'alice', age: 31 })

		s.destroy()
	})

	it('patch() with strict mode ignores unknown keys', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		const s = state(`par-patch-strict-${scope}`, {
			default: { a: 1, b: 2 },
			scope,
		})

		s.patch({ a: 10, z: 99 } as Partial<{ a: number; b: number }>, { strict: true })

		expect(s.get()).toEqual({ a: 10, b: 2 })

		warnSpy.mockRestore()
		s.destroy()
	})

	it('patch() after reset restores default then patches', () => {
		const s = state(`par-patch-reset-${scope}`, {
			default: { x: 0, y: 0 },
			scope,
		})

		s.set({ x: 100, y: 200 })
		s.reset()

		expect(s.get()).toEqual({ x: 0, y: 0 })

		s.patch({ x: 5 })

		expect(s.get()).toEqual({ x: 5, y: 0 })

		s.destroy()
	})

	it('patch() with nested objects does shallow merge only', () => {
		const s = state(`par-patch-nested-${scope}`, {
			default: { meta: { deep: true, count: 1 }, label: 'hi' },
			scope,
		})

		s.patch({ meta: { deep: false, count: 99 } })

		expect(s.get()).toEqual({ meta: { deep: false, count: 99 }, label: 'hi' })

		// Verify nested object is replaced, not merged
		s.patch({ meta: { deep: true } } as Partial<{
			meta: { deep: boolean; count: number }
			label: string
		}>)

		expect(s.get()).toEqual({ meta: { deep: true }, label: 'hi' })

		s.destroy()
	})

	it('patch() works correctly with interceptors', () => {
		const s = state(`par-patch-intercept-${scope}`, {
			default: { a: 1, b: 2 },
			scope,
		})

		const interceptSpy = vi.fn((next: { a: number; b: number }) => ({ ...next, a: next.a * 10 }))

		s.intercept(interceptSpy)
		s.patch({ a: 5 })

		expect(interceptSpy).toHaveBeenCalledTimes(1)
		// The interceptor receives the fully merged value
		expect(interceptSpy).toHaveBeenCalledWith({ a: 5, b: 2 }, { a: 1, b: 2 })
		// The final value reflects the interceptor's transformation
		expect(s.get()).toEqual({ a: 50, b: 2 })

		s.destroy()
	})

	it('patch() inside batch() only notifies once', () => {
		const s = state(`par-patch-batch-${scope}`, {
			default: { a: 0, b: 0, c: 0 },
			scope,
		})

		const listener = vi.fn()

		s.subscribe(listener)

		batch(() => {
			s.patch({ a: 1 })
			s.patch({ b: 2 })
			s.patch({ c: 3 })
		})

		expect(listener).toHaveBeenCalledTimes(1)
		expect(s.get()).toEqual({ a: 1, b: 2, c: 3 })

		s.destroy()
	})

	it('patch() on a destroyed instance is a no-op', () => {
		const s = state(`par-patch-destroyed-${scope}`, {
			default: { a: 1, b: 2 },
			scope,
		})

		s.set({ a: 10, b: 20 })
		s.destroy()

		s.patch({ a: 999 })

		expect(s.peek()).toEqual({ a: 10, b: 20 })
	})
})
