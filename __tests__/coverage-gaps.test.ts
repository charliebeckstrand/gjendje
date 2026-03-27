import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, collection, computed, configure, effect, state } from '../src/index.js'
import { makeStorage, setupFullBrowserEnv } from './helpers.js'

beforeEach(() => {
	setupFullBrowserEnv()
})

// ---------------------------------------------------------------------------
// Interceptor chain edge cases
// ---------------------------------------------------------------------------

describe('interceptor chain', () => {
	it('multiple interceptors run in registration order', () => {
		const s = state('chain-order', { default: 0, scope: 'memory' })

		const log: string[] = []

		s.intercept((next, _prev) => {
			log.push('A')
			return next + 1
		})

		s.intercept((next, _prev) => {
			log.push('B')
			return next * 10
		})

		s.set(1) // A: 1+1=2, B: 2*10=20

		expect(s.get()).toBe(20)
		expect(log).toEqual(['A', 'B'])
	})

	it('first interceptor throwing prevents subsequent interceptors from running', () => {
		const s = state('chain-throw-first', { default: 0, scope: 'memory' })

		const secondCalled = vi.fn()

		s.intercept(() => {
			throw new Error('first throws')
		})

		s.intercept((next) => {
			secondCalled()
			return next
		})

		expect(() => s.set(1)).toThrow('first throws')
		expect(secondCalled).not.toHaveBeenCalled()
		expect(s.get()).toBe(0)
	})

	it('unsubscribing an interceptor removes it from the chain', () => {
		const s = state('chain-unsub', { default: 0, scope: 'memory' })

		const unsub = s.intercept((next) => next * 2)

		s.set(5)
		expect(s.get()).toBe(10)

		unsub()

		s.set(3)
		expect(s.get()).toBe(3)
	})

	it('interceptor can reject update by returning prev', () => {
		const s = state('chain-reject', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		s.subscribe(listener)

		s.intercept((_next, prev) => prev)

		s.set(42)

		// Value unchanged — but the adapter still sets + notifies (isEqual is the opt-in gate)
		expect(s.get()).toBe(0)
	})

	it('interceptors run on reset() too', () => {
		const s = state('chain-reset', { default: 0, scope: 'memory' })

		const intercepted = vi.fn((next: number) => next + 100)

		s.intercept(intercepted)

		s.set(5) // intercepted: 5+100=105
		expect(s.get()).toBe(105)

		s.reset() // intercepted: 0+100=100
		expect(s.get()).toBe(100)
		expect(intercepted).toHaveBeenCalledTimes(2)
	})
})

// ---------------------------------------------------------------------------
// Effect cleanup edge cases
// ---------------------------------------------------------------------------

describe('effect cleanup edge cases', () => {
	it('cleanup throwing does not prevent the next effect run', () => {
		const a = state('effect-cleanup-throw', { default: 0, scope: 'memory' })

		const log: string[] = []
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const handle = effect([a], () => {
			log.push('run')

			return () => {
				log.push('cleanup-throw')
				throw new Error('cleanup boom')
			}
		})

		expect(log).toEqual(['run'])

		// Cleanup throws, but listener error isolation catches it.
		// The effect still re-runs because the error is isolated.
		a.set(1)

		expect(log).toEqual(['run', 'cleanup-throw', 'run'])
		expect(consoleSpy).toHaveBeenCalled()

		// stop() also calls cleanup — which throws again, but is caught
		handle.stop()

		consoleSpy.mockRestore()
	})

	it('effect does not run after stop even if dep changes', () => {
		const a = state('effect-stop-dep', { default: 0, scope: 'memory' })

		let runCount = 0

		const handle = effect([a], () => {
			runCount++
			return undefined
		})

		expect(runCount).toBe(1) // initial

		handle.stop()

		a.set(1)
		expect(runCount).toBe(1) // no additional run
	})

	it('effect with zero dependencies runs once and never re-runs', () => {
		let runCount = 0

		const handle = effect([], () => {
			runCount++
			return undefined
		})

		expect(runCount).toBe(1)

		handle.stop()
	})

	it('effect cleanup runs when stop() is called without any dependency change', () => {
		let cleanedUp = false

		const a = state('effect-cleanup-stop', { default: 0, scope: 'memory' })

		const handle = effect([a], () => {
			return () => {
				cleanedUp = true
			}
		})

		expect(cleanedUp).toBe(false)

		handle.stop()
		expect(cleanedUp).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Re-entrancy — set during notification
// ---------------------------------------------------------------------------

describe('re-entrancy', () => {
	it('subscriber calling set() on same state during notification works', () => {
		const s = state('reentrant-same', { default: 0, scope: 'memory' })

		const values: number[] = []

		s.subscribe((v) => {
			values.push(v)

			// Re-entrant: cap value at 3
			if (v < 3) {
				s.set(v + 1)
			}
		})

		s.set(1)

		// Should have cascaded: 1, 2, 3
		expect(values).toEqual([1, 2, 3])
		expect(s.get()).toBe(3)
	})

	it('subscriber calling set() on different state during notification works', () => {
		const a = state('reentrant-a', { default: 0, scope: 'memory' })
		const b = state('reentrant-b', { default: 0, scope: 'memory' })

		const bValues: number[] = []

		a.subscribe((v) => {
			b.set(v * 10)
		})

		b.subscribe((v) => {
			bValues.push(v)
		})

		a.set(5)

		expect(b.get()).toBe(50)
		expect(bValues).toContain(50)
	})

	it('batch prevents re-entrant notifications until flush', () => {
		const a = state('reentrant-batch-a', { default: 0, scope: 'memory' })
		const b = state('reentrant-batch-b', { default: 0, scope: 'memory' })

		const log: string[] = []

		a.subscribe((v) => {
			log.push(`a:${v}`)
			b.set(v * 10)
		})

		b.subscribe((v) => {
			log.push(`b:${v}`)
		})

		batch(() => {
			a.set(1)
			a.set(2)
		})

		// After batch: only the last set(2) should notify
		// a subscriber fires, sets b=20, b subscriber fires
		expect(b.get()).toBe(20)
	})

	it('computed handles re-entrant dependency updates', () => {
		const a = state('reentrant-comp', { default: 1, scope: 'memory' })

		const c = computed([a], ([v]) => (v ?? 0) * 2)

		const values: number[] = []

		c.subscribe((v) => {
			values.push(v)
		})

		batch(() => {
			a.set(2)
			a.set(3)
		})

		// Computed should settle to 6
		expect(c.get()).toBe(6)
	})
})

// ---------------------------------------------------------------------------
// Collection watch edge cases
// ---------------------------------------------------------------------------

describe('collection watch edge cases', () => {
	it('watch on empty collection fires when first item added', () => {
		const col = collection<{ id: number; name: string }>('col-watch-empty', {
			default: [],
			scope: 'memory',
		})

		const listener = vi.fn()

		col.watch('name', listener)

		col.add({ id: 1, name: 'Alice' })

		expect(listener).toHaveBeenCalledWith([{ id: 1, name: 'Alice' }])
	})

	it('watch fires when item is removed (length changes)', () => {
		const col = collection('col-watch-remove', {
			default: [
				{ id: 1, name: 'Alice' },
				{ id: 2, name: 'Bob' },
			],
			scope: 'memory',
		})

		const listener = vi.fn()

		col.watch('name', listener)

		col.remove((item) => item.id === 2)

		expect(listener).toHaveBeenCalledWith([{ id: 1, name: 'Alice' }])
	})

	it('watch unsubscribe during notification does not throw', () => {
		const col = collection('col-watch-unsub-mid', {
			default: [{ id: 1, name: 'A' }],
			scope: 'memory',
		})

		let unsub: (() => void) | null = null

		unsub = col.watch('name', () => {
			unsub?.()
		})

		// Should not throw
		col.update((item) => item.id === 1, { name: 'B' })
	})

	it('multiple watchers on same key all fire', () => {
		const col = collection('col-watch-multi', {
			default: [{ id: 1, val: 0 }],
			scope: 'memory',
		})

		const listener1 = vi.fn()
		const listener2 = vi.fn()

		col.watch('val', listener1)
		col.watch('val', listener2)

		col.update((item) => item.id === 1, { val: 1 })

		expect(listener1).toHaveBeenCalled()
		expect(listener2).toHaveBeenCalled()
	})

	it('watch does not fire when unwatched key changes', () => {
		const col = collection('col-watch-wrong-key', {
			default: [{ id: 1, name: 'A', age: 20 }],
			scope: 'memory',
		})

		const listener = vi.fn()

		col.watch('name', listener)

		col.update((item) => item.id === 1, { age: 30 })

		expect(listener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// Configuration cascading
// ---------------------------------------------------------------------------

describe('configuration cascading', () => {
	it('scope: "local" applies to new instances', () => {
		configure({ scope: 'local' })

		const s = state('config-default-scope', { default: 0 })
		expect(s.scope).toBe('local')

		// Reset
		configure({ scope: undefined })
	})

	it('per-instance scope overrides scope', () => {
		configure({ scope: 'local' })

		const s = state('config-override', { default: 0, scope: 'memory' })
		expect(s.scope).toBe('memory')

		configure({ scope: undefined })
	})

	it('requireValidation does not affect memory scope', () => {
		configure({ requireValidation: true })

		// memory scope should not require validation
		expect(() => state('config-memory-no-val', { default: 0, scope: 'memory' })).not.toThrow()

		configure({ requireValidation: false })
	})

	it('requireValidation throws for local scope without validate', () => {
		configure({ requireValidation: true })

		expect(() => state('config-local-no-val', { default: 0, scope: 'local' })).toThrow(/validate/)

		configure({ requireValidation: false })
	})

	it('multiple configure() calls merge options', () => {
		configure({ prefix: 'app' })
		configure({ logLevel: 'silent' })

		const s = state('config-merge', { default: 0, scope: 'local' })

		// prefix should still be applied (from first configure)
		s.set(42)
		const raw2 = localStorage.getItem('app:config-merge')
		expect(raw2).not.toBeNull()

		// Reset
		configure({ prefix: undefined, logLevel: undefined })
	})
})

// ---------------------------------------------------------------------------
// onChange() handler edge cases
// ---------------------------------------------------------------------------

describe('onChange() handlers', () => {
	it('multiple handlers fire in registration order', () => {
		const s = state('hooks-order', { default: 0, scope: 'memory' })

		const log: string[] = []

		s.onChange(() => log.push('A'))
		s.onChange(() => log.push('B'))
		s.onChange(() => log.push('C'))

		s.set(1)

		expect(log).toEqual(['A', 'B', 'C'])
	})

	it('handler receives next and prev values', () => {
		const s = state('hooks-args', { default: 'hello', scope: 'memory' })

		const calls: [string, string][] = []

		s.onChange((next, prev) => {
			calls.push([next, prev])
		})

		s.set('world')

		expect(calls).toEqual([['world', 'hello']])
	})

	it('unsubscribing a handler removes it', () => {
		const s = state('hooks-unsub', { default: 0, scope: 'memory' })

		const hookFn = vi.fn()

		const unsub = s.onChange(hookFn)

		s.set(1)
		expect(hookFn).toHaveBeenCalledTimes(1)

		unsub()

		s.set(2)
		expect(hookFn).toHaveBeenCalledTimes(1) // no additional call
	})
})

// ---------------------------------------------------------------------------
// State recreation after destroy
// ---------------------------------------------------------------------------

describe('state recreation', () => {
	it('new instance after destroy gets fresh default', () => {
		const s1 = state('recreate', { default: 0, scope: 'memory' })
		s1.set(42)
		s1.destroy()

		const s2 = state('recreate', { default: 0, scope: 'memory' })
		expect(s2.get()).toBe(0) // fresh default
		expect(s2.isDestroyed).toBe(false)
	})

	it('new instance after destroy reads from storage if persisted', () => {
		const storage = makeStorage()

		storage.setItem('recreate-persist', JSON.stringify(99))

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		const s1 = state('recreate-persist', { default: 0, scope: 'local' })
		expect(s1.get()).toBe(99)
		s1.destroy()

		const s2 = state('recreate-persist', { default: 0, scope: 'local' })
		expect(s2.get()).toBe(99) // reads from storage
	})
})
