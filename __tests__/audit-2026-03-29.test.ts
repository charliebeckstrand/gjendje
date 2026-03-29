import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { computed, configure, readonly, resetConfig, select, state } from '../src/index.js'
import { createOptimizedListeners } from '../src/listeners.js'
import { afterHydration } from '../src/ssr.js'
import { useGjendje } from '../src/vue/index.js'

// ---------------------------------------------------------------------------
// Finding 2 — createOptimizedListeners counter desync
// ---------------------------------------------------------------------------

describe('createOptimizedListeners — duplicate subscription handling', () => {
	it('does not desync when the same listener is subscribed twice', () => {
		const listeners = createOptimizedListeners<number>('test', 'memory')

		const fn = vi.fn()

		const unsub1 = listeners.subscribe(fn)
		const unsub2 = listeners.subscribe(fn)

		// Set deduplicates — only one copy in the set
		listeners.notify(42)
		expect(fn).toHaveBeenCalledTimes(1)

		// After removing via first unsub, listener should be gone
		unsub1()

		fn.mockClear()
		listeners.notify(99)
		expect(fn).toHaveBeenCalledTimes(0)

		// Second unsub is a no-op (already removed)
		unsub2()

		// A new listener should work correctly after the desync window
		const fn2 = vi.fn()

		const unsub3 = listeners.subscribe(fn2)

		listeners.notify(7)
		expect(fn2).toHaveBeenCalledTimes(1)
		expect(fn2).toHaveBeenCalledWith(7)

		unsub3()
	})

	it('singleListener fast path activates correctly after duplicate cleanup', () => {
		const listeners = createOptimizedListeners<string>('test2', 'memory')

		const fn = vi.fn()

		// Subscribe same reference twice
		const unsub1 = listeners.subscribe(fn)
		listeners.subscribe(fn)

		// Remove the listener
		unsub1()

		// Subscribe a fresh listener — should hit single-listener fast path
		const fresh = vi.fn()

		listeners.subscribe(fresh)

		listeners.notify('hello')
		expect(fresh).toHaveBeenCalledTimes(1)
		expect(fresh).toHaveBeenCalledWith('hello')
	})
})

// ---------------------------------------------------------------------------
// Finding 3 — computed/select use Object.is instead of ===
// ---------------------------------------------------------------------------

describe('computed — Object.is equality for NaN', () => {
	it('does not fire spurious notifications when computed returns NaN', () => {
		const a = state('nan-src', { default: 'not-a-number' })

		const c = computed([a], ([v]) => Number(v))

		const listener = vi.fn()

		c.subscribe(listener)

		// c.get() is NaN. Setting a to a different non-numeric string should
		// still produce NaN — Object.is(NaN, NaN) is true, so no notification.
		a.set('also-not-a-number')

		expect(listener).not.toHaveBeenCalled()

		c.destroy()
		a.destroy()
	})
})

describe('select — Object.is equality for NaN', () => {
	it('does not fire spurious notifications when select returns NaN', () => {
		const a = state('nan-sel-src', { default: 'abc' })

		const s = select(a, (v) => Number(v))

		const listener = vi.fn()

		s.subscribe(listener)

		// Both 'abc' and 'xyz' parse to NaN
		a.set('xyz')

		expect(listener).not.toHaveBeenCalled()

		s.destroy()
		a.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding 4 — Vue useGjendje selector caching
// ---------------------------------------------------------------------------

function useSetup<T>(fn: () => T) {
	const box = { result: undefined as T }

	const wrapper = mount(
		defineComponent({
			setup() {
				box.result = fn()
				return () => null
			},
		}),
	)

	return { result: box.result, wrapper }
}

describe('Vue useGjendje — selector caching', () => {
	const instances: Array<{ destroy(): void }> = []

	function tracked<T extends { destroy(): void }>(instance: T): T {
		instances.push(instance)
		return instance
	}

	afterEach(() => {
		for (const instance of instances) instance.destroy()
		instances.length = 0
	})

	it('does not re-run selector on repeated .value access when value has not changed', () => {
		const user = tracked(state('vue-sel-cache', { default: { name: 'Jane', age: 30 } }))

		const selector = vi.fn((u: { name: string; age: number }) => u.name)

		const { result, wrapper } = useSetup(() => useGjendje(user, selector))

		// First access
		expect(result.value).toBe('Jane')

		const callsAfterFirst = selector.mock.calls.length

		// Second access — should NOT call selector again
		expect(result.value).toBe('Jane')
		expect(selector.mock.calls.length).toBe(callsAfterFirst)

		wrapper.unmount()
	})

	it('returns updated value after state change', async () => {
		const user = tracked(state('vue-sel-update', { default: { name: 'Jane', age: 30 } }))

		const { result, wrapper } = useSetup(() =>
			useGjendje(user, (u: { name: string; age: number }) => u.name),
		)

		expect(result.value).toBe('Jane')

		user.set({ name: 'John', age: 31 })

		await nextTick()

		expect(result.value).toBe('John')

		wrapper.unmount()
	})
})

// ---------------------------------------------------------------------------
// Finding 5 — afterHydration error handling
// ---------------------------------------------------------------------------

describe('afterHydration — error handling', () => {
	it('resolves the promise even when the callback throws', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const promise = afterHydration(() => {
			throw new Error('hydration boom')
		})

		// Must resolve, not hang forever
		await expect(promise).resolves.toBeUndefined()

		expect(spy).toHaveBeenCalledWith('[gjendje] Hydration callback threw:', expect.any(Error))

		spy.mockRestore()
	})
})

// ---------------------------------------------------------------------------
// Finding 7 — configure() unknown key warning
// ---------------------------------------------------------------------------

describe('configure — unknown key warning', () => {
	beforeEach(() => resetConfig())

	afterEach(() => resetConfig())

	it('warns when an unknown key is passed', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		configure({ logLvel: 'warn' } as unknown as Parameters<typeof configure>[0])

		expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown key "logLvel"'))

		spy.mockRestore()
	})

	it('does not warn for known keys', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		configure({ logLevel: 'silent' })

		expect(spy).not.toHaveBeenCalled()

		spy.mockRestore()
	})
})

// ---------------------------------------------------------------------------
// Finding 8 — readonly() shadows onChange
// ---------------------------------------------------------------------------

describe('readonly — onChange is shadowed', () => {
	it('onChange is undefined on readonly wrapper', () => {
		const s = state('ro-onchange', { default: 0 })

		const ro = readonly(s)

		// TypeScript hides it, but JS callers can try
		expect((ro as unknown as Record<string, unknown>).onChange).toBeUndefined()

		s.destroy()
	})
})
