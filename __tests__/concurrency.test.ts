import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, computed, destroyAll, effect, resetConfig, state } from '../src/index.js'
import { MockBroadcastChannel, makeStorage, setupBrowserEnv } from './helpers.js'

beforeEach(() => {
	setupBrowserEnv()
})

afterEach(() => {
	resetConfig()
	destroyAll()
})

// ---------------------------------------------------------------------------
// 1. Concurrent mutations
// ---------------------------------------------------------------------------

describe('concurrent mutations', () => {
	it('multiple set() calls without batch notify for each and land on final value', () => {
		const s = state('conc-rapid', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		s.subscribe(listener)

		s.set(1)
		s.set(2)
		s.set(3)

		expect(listener).toHaveBeenCalledTimes(3)
		expect(listener.mock.calls).toEqual([[1], [2], [3]])
		expect(s.get()).toBe(3)
	})

	it('rapid mutations are visible via get() after each set()', () => {
		const s = state('conc-rapid-get', { default: 'a', scope: 'memory' })

		const values: string[] = []

		s.subscribe(() => {
			values.push(s.get())
		})

		s.set('b')
		s.set('c')
		s.set('d')

		expect(values).toEqual(['b', 'c', 'd'])
	})
})

// ---------------------------------------------------------------------------
// 2. Diamond dependency
// ---------------------------------------------------------------------------

describe('diamond dependency', () => {
	it('C recomputes to final value when X changes (X -> A,B -> C)', () => {
		const x = state('conc-diamond-x', { default: 1, scope: 'memory' })

		const a = computed([x], ([v]) => (v ?? 0) * 2, { key: 'conc-diamond-a' })
		const b = computed([x], ([v]) => (v ?? 0) * 3, { key: 'conc-diamond-b' })
		const c = computed([a, b], ([av, bv]) => (av ?? 0) + (bv ?? 0), { key: 'conc-diamond-c' })

		const listener = vi.fn()

		c.subscribe(listener)

		batch(() => {
			x.set(2)
		})

		// C should see A=4, B=6 -> C=10
		expect(c.get()).toBe(10)
		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(10)
	})

	it('diamond without batch still converges to correct final value', () => {
		const x = state('conc-diamond-nobatch', { default: 1, scope: 'memory' })

		const a = computed([x], ([v]) => (v ?? 0) * 2)
		const b = computed([x], ([v]) => (v ?? 0) * 3)
		const c = computed([a, b], ([av, bv]) => (av ?? 0) + (bv ?? 0))

		x.set(5)

		// Final value should always be correct: A=10, B=15, C=25
		expect(c.get()).toBe(25)
	})
})

// ---------------------------------------------------------------------------
// 3. Subscriber modifies state during notification
// ---------------------------------------------------------------------------

describe('subscriber modifies state during notification', () => {
	it('setting another state in a subscriber does not deadlock', () => {
		const a = state('conc-sub-mod-a', { default: 0, scope: 'memory' })
		const b = state('conc-sub-mod-b', { default: 0, scope: 'memory' })

		const bListener = vi.fn()

		a.subscribe((val) => {
			b.set(val * 10)
		})

		b.subscribe(bListener)

		a.set(5)

		expect(b.get()).toBe(50)
		expect(bListener).toHaveBeenCalledWith(50)
	})

	it('setting the same state in its own subscriber does not cause infinite loop', () => {
		const s = state('conc-self-mod', { default: 0, scope: 'memory' })

		let callCount = 0

		s.subscribe((val) => {
			callCount++

			if (val < 3) {
				s.set(val + 1)
			}
		})

		s.set(1)

		// Should converge: 1 -> 2 -> 3, then stop
		expect(s.get()).toBe(3)
		expect(callCount).toBeGreaterThanOrEqual(3)
	})
})

// ---------------------------------------------------------------------------
// 4. Effect cleanup during re-trigger
// ---------------------------------------------------------------------------

describe('effect cleanup during re-trigger', () => {
	it('cleanup runs before effect re-executes', () => {
		const s = state('conc-effect-cleanup', { default: 'init', scope: 'memory' })

		const order: string[] = []

		const handle = effect([s], ([val]) => {
			order.push(`run:${val}`)

			return () => {
				order.push(`cleanup:${val}`)
			}
		})

		s.set('updated')

		expect(order).toEqual(['run:init', 'cleanup:init', 'run:updated'])

		handle.stop()

		expect(order).toEqual(['run:init', 'cleanup:init', 'run:updated', 'cleanup:updated'])
	})

	it('cleanup that throws does not prevent next effect run', () => {
		const s = state('conc-effect-cleanup-throw', { default: 0, scope: 'memory' })

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		let runCount = 0

		const handle = effect([s], ([val]) => {
			runCount++

			return () => {
				if (val === 0) throw new Error('cleanup boom')
			}
		})

		s.set(1)

		expect(runCount).toBe(2)
		expect(errorSpy).toHaveBeenCalled()

		handle.stop()

		errorSpy.mockRestore()
	})
})

// ---------------------------------------------------------------------------
// 5. Destroy during subscriber notification
// ---------------------------------------------------------------------------

describe('destroy during subscriber notification', () => {
	it('destroying a state while its subscriber runs does not throw', () => {
		const s = state('conc-destroy-notify', { default: 0, scope: 'memory' })

		s.subscribe(() => {
			s.destroy()
		})

		expect(() => s.set(1)).not.toThrow()
	})

	it('destroying a computed during its subscriber notification does not throw', () => {
		const s = state('conc-destroy-computed-src', { default: 0, scope: 'memory' })

		const c = computed([s], ([v]) => (v ?? 0) * 2)

		c.subscribe(() => {
			c.destroy()
		})

		expect(() => s.set(5)).not.toThrow()
	})
})

// ---------------------------------------------------------------------------
// 6. Batch inside batch
// ---------------------------------------------------------------------------

describe('batch inside batch', () => {
	it('nested batch defers all notifications to the outermost batch', () => {
		const a = state('conc-nested-a', { default: 0, scope: 'memory' })
		const b = state('conc-nested-b', { default: 0, scope: 'memory' })

		const listenerA = vi.fn()
		const listenerB = vi.fn()

		a.subscribe(listenerA)
		b.subscribe(listenerB)

		batch(() => {
			a.set(1)

			batch(() => {
				b.set(2)
				a.set(3)
			})

			// Inner batch should not have flushed yet
			expect(listenerA).not.toHaveBeenCalled()
			expect(listenerB).not.toHaveBeenCalled()
		})

		// After outermost batch, notifications fire
		expect(listenerA).toHaveBeenCalledTimes(1)
		expect(listenerA).toHaveBeenCalledWith(3)
		expect(listenerB).toHaveBeenCalledTimes(1)
		expect(listenerB).toHaveBeenCalledWith(2)
	})

	it('triple-nested batch still defers to outermost', () => {
		const s = state('conc-triple-nested', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		s.subscribe(listener)

		batch(() => {
			batch(() => {
				batch(() => {
					s.set(42)
				})

				expect(listener).not.toHaveBeenCalled()
			})

			expect(listener).not.toHaveBeenCalled()
		})

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(42)
	})
})

// ---------------------------------------------------------------------------
// 7. Subscribe and unsubscribe during notification
// ---------------------------------------------------------------------------

describe('subscribe and unsubscribe during notification', () => {
	it('subscribing a new listener during notification does not break iteration', () => {
		const s = state('conc-sub-during', { default: 0, scope: 'memory' })

		const laterListener = vi.fn()

		s.subscribe(() => {
			s.subscribe(laterListener)
		})

		expect(() => s.set(1)).not.toThrow()

		// The new listener was added during notification — it may or may not
		// fire for the current change, but it must work for subsequent ones.
		laterListener.mockClear()

		s.set(2)

		expect(laterListener).toHaveBeenCalledWith(2)
	})

	it('unsubscribing during notification does not throw', () => {
		const s = state('conc-unsub-during', { default: 0, scope: 'memory' })

		const secondListener = vi.fn()

		let unsub: (() => void) | undefined

		s.subscribe(() => {
			if (unsub) unsub()
		})

		unsub = s.subscribe(secondListener)

		expect(() => s.set(1)).not.toThrow()
	})

	it('unsubscribing self during notification stops future calls', () => {
		const s = state('conc-unsub-self', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		const unsub = s.subscribe((val) => {
			listener(val)

			if (val === 1) unsub()
		})

		s.set(1)
		s.set(2)

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(1)
	})
})

// ---------------------------------------------------------------------------
// 8. Computed with destroyed dependency during batch
// ---------------------------------------------------------------------------

describe('computed with destroyed dependency during batch', () => {
	it('destroying a dependency inside a batch does not throw on flush', () => {
		const dep = state('conc-comp-destroy-dep', { default: 10, scope: 'memory' })

		const c = computed([dep], ([v]) => (v ?? 0) + 1)

		const listener = vi.fn()

		c.subscribe(listener)

		expect(() => {
			batch(() => {
				dep.set(20)
				dep.destroy()
			})
		}).not.toThrow()
	})

	it('computed returns last cached value after dependency is destroyed', () => {
		const dep = state('conc-comp-cached', { default: 5, scope: 'memory' })

		const c = computed([dep], ([v]) => (v ?? 0) * 3)

		expect(c.get()).toBe(15)

		dep.destroy()

		// Should still return the cached value without throwing
		expect(c.peek()).toBe(15)
	})
})

// ---------------------------------------------------------------------------
// 9. BroadcastChannel message during destroy
// ---------------------------------------------------------------------------

describe('BroadcastChannel message during destroy', () => {
	it('receiving a sync message while instance is being destroyed does not throw', () => {
		MockBroadcastChannel.clear()

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: MockBroadcastChannel,
			configurable: true,
			writable: true,
		})

		Object.defineProperty(globalThis, 'localStorage', {
			value: makeStorage(),
			configurable: true,
		})

		Object.defineProperty(globalThis, 'window', {
			value: { addEventListener: () => {}, removeEventListener: () => {} },
			configurable: true,
			writable: true,
		})

		const s1 = state('conc-sync-destroy', { default: 0, scope: 'local' })
		const s2 = state('conc-sync-destroy', { default: 0, scope: 'local' })

		// Simulate: destroy s2 then send a message from s1
		expect(() => {
			s2.destroy()
			s1.set(42)
		}).not.toThrow()

		s1.destroy()
	})

	it('message arriving after destroy is silently ignored', () => {
		MockBroadcastChannel.clear()

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: MockBroadcastChannel,
			configurable: true,
			writable: true,
		})

		Object.defineProperty(globalThis, 'localStorage', {
			value: makeStorage(),
			configurable: true,
		})

		Object.defineProperty(globalThis, 'window', {
			value: { addEventListener: () => {}, removeEventListener: () => {} },
			configurable: true,
			writable: true,
		})

		const s1 = state('conc-sync-after', { default: 'hello', scope: 'local' })
		const s2 = state('conc-sync-after', { default: 'hello', scope: 'local' })

		const listener = vi.fn()

		s2.subscribe(listener)

		s2.destroy()

		// Sending a message after s2 is destroyed should not cause errors
		expect(() => {
			s1.set('world')
		}).not.toThrow()

		// The destroyed instance's listener should not have been called
		expect(listener).not.toHaveBeenCalled()

		s1.destroy()
	})
})
