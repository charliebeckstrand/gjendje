import { describe, expect, it, vi } from 'vitest'
import { createMemoryAdapter } from '../src/adapters/memory.js'
import { withHistory } from '../src/enhancers/history.js'
import { state } from '../src/index.js'
import { readonly } from '../src/readonly.js'
import { setupBrowserEnv } from './helpers.js'

// ---------------------------------------------------------------------------
// Bug fix 1: StateImpl interceptor returning undefined/Promise should not
// cause spurious storage writes or notifications
// ---------------------------------------------------------------------------

describe('StateImpl interceptor rejection (non-memory scopes)', () => {
	setupBrowserEnv()

	it('does not notify when interceptor returns undefined', () => {
		const s = state('intercept-undef-local', { default: 10, scope: 'local' })

		s.intercept(() => undefined as unknown as number)

		const listener = vi.fn()

		const onChange = vi.fn()

		s.subscribe(listener)
		s.onChange(onChange)

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		s.set(20)

		expect(listener).not.toHaveBeenCalled()
		expect(onChange).not.toHaveBeenCalled()
		expect(s.get()).toBe(10)

		warnSpy.mockRestore()
		s.destroy()
	})

	it('does not notify when interceptor returns a Promise', () => {
		const s = state('intercept-promise-local', { default: 5, scope: 'local' })

		s.intercept(() => Promise.resolve(99) as unknown as number)

		const listener = vi.fn()

		const onChange = vi.fn()

		s.subscribe(listener)
		s.onChange(onChange)

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		s.set(10)

		expect(listener).not.toHaveBeenCalled()
		expect(onChange).not.toHaveBeenCalled()
		expect(s.get()).toBe(5)

		warnSpy.mockRestore()
		s.destroy()
	})

	it('does not notify on reset when interceptor returns undefined', () => {
		const s = state('intercept-undef-reset', { default: 0, scope: 'local' })

		s.set(42)

		s.intercept(() => undefined as unknown as number)

		const listener = vi.fn()

		s.subscribe(listener)

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

		s.reset()

		// Interceptor returned undefined → mapped to prev (42) → Object.is(42, 42) → skip
		expect(listener).not.toHaveBeenCalled()
		expect(s.get()).toBe(42)

		warnSpy.mockRestore()
		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// Bug fix 2: createMemoryAdapter should snapshot listeners during notification
// ---------------------------------------------------------------------------

describe('createMemoryAdapter listener snapshot', () => {
	it('does not skip listeners when one unsubscribes another during notification', () => {
		const adapter = createMemoryAdapter(0)

		const callOrder: string[] = []

		let unsubB: (() => void) | undefined

		const listenerA = () => {
			callOrder.push('A')
			// Unsubscribe B during A's notification
			unsubB?.()
		}

		const listenerB = () => {
			callOrder.push('B')
		}

		const listenerC = () => {
			callOrder.push('C')
		}

		adapter.subscribe(listenerA)
		unsubB = adapter.subscribe(listenerB)
		adapter.subscribe(listenerC)

		adapter.set(1)

		// All three should fire because the snapshot was taken before iteration.
		// Without snapshot, B would be skipped since A unsubscribes it mid-iteration.
		expect(callOrder).toEqual(['A', 'B', 'C'])
	})
})

// ---------------------------------------------------------------------------
// Bug fix 3: readonly() should shadow mutate
// ---------------------------------------------------------------------------

describe('readonly() shadows mutate', () => {
	it('mutate is undefined on a readonly wrapper', () => {
		const s = state('ro-mutate', { default: { count: 0 } })

		const r = readonly(s)

		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior for untyped JS callers
		expect((r as any).mutate).toBeUndefined()

		s.destroy()
	})

	it('mutate on underlying instance still works', () => {
		const s = state('ro-mutate-base', { default: { count: 0 } })

		const r = readonly(s)

		// The readonly wrapper blocks mutate
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior for untyped JS callers
		expect((r as any).mutate).toBeUndefined()

		// But the original instance still allows it
		s.mutate((draft) => {
			draft.count = 5
		})

		expect(r.get().count).toBe(5)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// Bug fix 4: withHistory.navigate() should not mutate stacks when set is a no-op
// ---------------------------------------------------------------------------

describe('withHistory navigate with isEqual/interceptor no-op', () => {
	it('undo is a no-op when interceptor clamps value to current', () => {
		const s = state('hist-noop-intercept', { default: 5, scope: 'memory' })

		const h = withHistory(s)

		h.set(10)
		h.set(15)

		// Interceptor rejects all changes by returning prev
		const unsub = s.intercept((_next, prev) => prev)

		// Undo should be a no-op since the interceptor prevents the value change
		h.undo()

		// State should remain at 15
		expect(h.get()).toBe(15)

		// canUndo should still be true since the undo didn't actually happen
		expect(h.canUndo).toBe(true)

		unsub()
		h.destroy()
	})

	it('undo is a no-op when isEqual rejects the change', () => {
		const s = state('hist-noop-isequal', {
			default: 0,
			scope: 'memory',
			isEqual: () => true, // always considers values equal — rejects all changes
		})

		const h = withHistory(s)

		// These sets are no-ops due to isEqual, so no history is recorded
		h.set(1)
		h.set(2)

		// No history was recorded, so canUndo is false
		expect(h.canUndo).toBe(false)

		h.destroy()
	})

	it('stacks remain consistent after interceptor-rejected undo', () => {
		const s = state('hist-stack-consistent', { default: 0, scope: 'memory' })

		const h = withHistory(s)

		h.set(1)
		h.set(2)
		h.set(3)

		expect(h.canUndo).toBe(true)

		// Interceptor that clamps to minimum of 2
		const unsub = s.intercept((next, prev) => (next < 2 ? prev : next))

		// Undo from 3 → 2: allowed (2 >= 2)
		h.undo()
		expect(h.get()).toBe(2)
		expect(h.canRedo).toBe(true)

		// Undo from 2 → 1: rejected by interceptor (1 < 2, returns prev=2)
		h.undo()
		expect(h.get()).toBe(2)

		// canUndo should still be true because the stack wasn't corrupted
		expect(h.canUndo).toBe(true)

		// Redo should still work — takes us back to 3
		h.redo()
		expect(h.get()).toBe(3)

		unsub()
		h.destroy()
	})
})
