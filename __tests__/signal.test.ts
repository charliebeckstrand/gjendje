import { describe, expect, it, vi } from 'vitest'
import { computed, fromSignal, readonly, state, toSignal } from '../src/index.js'

describe('toSignal', () => {
	it('wraps a writable instance — .value reads get()', () => {
		const s = state('sig-read', { default: 42, scope: 'memory' })

		const sig = toSignal(s)

		expect(sig.value).toBe(42)
	})

	it('wraps a writable instance — .value = x calls set(x)', () => {
		const s = state('sig-write', { default: 0, scope: 'memory' })

		const sig = toSignal(s)

		sig.value = 99
		expect(s.get()).toBe(99)
	})

	it('subscribe mirrors instance subscribe', () => {
		const s = state('sig-sub', { default: 'a', scope: 'memory' })

		const sig = toSignal(s)

		const listener = vi.fn()

		sig.subscribe(listener)
		s.set('b')
		expect(listener).toHaveBeenCalledWith('b')
	})

	it('wraps a readonly instance — .value is read-only', () => {
		const s = state('sig-ro-base', { default: 10, scope: 'memory' })
		const ro = readonly(s)

		const sig = toSignal(ro)

		expect(sig.value).toBe(10)
		// sig should NOT have a set — it's typed as Signal<number>, not WritableSignal
		expect('set' in sig).toBe(false) // no setter on the object
		// Actually, for a getter-only property, setting should be a no-op or throw in strict mode
		// The key thing is that the type system prevents it
	})

	it('works with computed instances', () => {
		const s = state('sig-comp-base', { default: 5, scope: 'memory' })

		const c = computed([s], ([v]) => (v as number) * 2)

		const sig = toSignal(c)

		expect(sig.value).toBe(10)
	})
})

describe('fromSignal', () => {
	// Helper to create a minimal signal-like object
	function createMockSignal<T>(initial: T) {
		let current = initial
		const listeners = new Set<(v: T) => void>()

		return {
			get value() {
				return current
			},
			subscribe(fn: (v: T) => void) {
				listeners.add(fn)
				return () => {
					listeners.delete(fn)
				}
			},
			// Helper for tests to push updates
			_set(v: T) {
				current = v
				for (const fn of listeners) fn(v)
			},
		}
	}

	it('mirrors external signal value', () => {
		const mock = createMockSignal(42)

		const inst = fromSignal(mock)

		expect(inst.get()).toBe(42)
	})

	it('updates when external signal changes', () => {
		const mock = createMockSignal('hello')

		const inst = fromSignal(mock)

		mock._set('world')
		expect(inst.get()).toBe('world')
	})

	it('notifies subscribers on external change', () => {
		const mock = createMockSignal(0)

		const inst = fromSignal(mock)

		const listener = vi.fn()

		inst.subscribe(listener)
		mock._set(1)
		expect(listener).toHaveBeenCalledWith(1)
	})

	it('returns ReadonlyInstance — no set or reset', () => {
		const mock = createMockSignal(0)

		const inst = fromSignal(mock)

		expect('set' in inst).toBe(false)
		expect('reset' in inst).toBe(false)
	})

	it('destroy unsubscribes from external signal', () => {
		const mock = createMockSignal(0)

		const inst = fromSignal(mock)

		const listener = vi.fn()

		inst.subscribe(listener)
		inst.destroy()
		mock._set(99)
		expect(listener).not.toHaveBeenCalled()
		expect(inst.isDestroyed).toBe(true)
	})

	it('uses custom key', () => {
		const mock = createMockSignal(0)

		const inst = fromSignal(mock, { key: 'my-signal' })

		expect(inst.key).toBe('my-signal')
	})

	it('auto-generates unique keys', () => {
		const m1 = createMockSignal(0)
		const m2 = createMockSignal(0)

		const i1 = fromSignal(m1)
		const i2 = fromSignal(m2)

		expect(i1.key).not.toBe(i2.key)
	})

	it('scope is memory', () => {
		const mock = createMockSignal(0)

		const inst = fromSignal(mock)

		expect(inst.scope).toBe('memory')
	})
})
