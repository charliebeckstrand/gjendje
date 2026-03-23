import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, state } from '../src/index.js'
import { makeStorage } from './helpers.js'

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'BroadcastChannel', {
		value: class {
			onmessage = null
			postMessage() {}
			close() {}
		},
		configurable: true,
	})
})

// ---------------------------------------------------------------------------
// Feature 4 — Instance registry
// ---------------------------------------------------------------------------

describe('instance registry', () => {
	it('returns the same instance for the same key and scope', () => {
		const a = state('reg-theme', { default: 'light', scope: 'memory' })
		const b = state('reg-theme', { default: 'light', scope: 'memory' })

		expect(a).toBe(b)

		a.destroy()
	})

	it('returns different instances for different scopes', () => {
		const a = state('reg-x', { default: 0, scope: 'memory' })
		const b = state('reg-x', { default: 0, scope: 'local' })

		expect(a).not.toBe(b)

		a.destroy()
		b.destroy()
	})

	it('returns different instances for different keys', () => {
		const a = state('reg-a', { default: 0 })
		const b = state('reg-b', { default: 0 })

		expect(a).not.toBe(b)

		a.destroy()
		b.destroy()
	})

	it('returns a fresh instance after the previous one is destroyed', () => {
		const a = state('reg-fresh', { default: 0 })

		a.destroy()

		const b = state('reg-fresh', { default: 0 })

		expect(a).not.toBe(b)
		expect(b.isDestroyed).toBe(false)

		b.destroy()
	})

	it('shared instance sees updates from any reference', () => {
		const a = state('reg-shared', { default: 0 })
		const b = state('reg-shared', { default: 0 })

		a.set(99)

		expect(b.get()).toBe(99)

		a.destroy()
	})
})

// ---------------------------------------------------------------------------
// Feature 1 — Destroy safety
// ---------------------------------------------------------------------------

describe('destroy safety', () => {
	it('returns last known value after destroy', () => {
		const x = state('dst-x', { default: 0 })

		x.set(42)
		x.destroy()

		expect(x.get()).toBe(42)
	})

	it('set is a no-op after destroy', () => {
		const x = state('dst-set', { default: 0 })

		x.destroy()
		x.set(99)

		expect(x.get()).toBe(0)
	})

	it('reset is a no-op after destroy', () => {
		const x = state('dst-reset', { default: 0 })

		x.set(42)
		x.destroy()
		x.reset()

		expect(x.get()).toBe(42)
	})

	it('isDestroyed flag is false before destroy', () => {
		const x = state('dst-flag', { default: 0 })

		expect(x.isDestroyed).toBe(false)

		x.destroy()
	})

	it('isDestroyed flag is true after destroy', () => {
		const x = state('dst-flag2', { default: 0 })

		x.destroy()

		expect(x.isDestroyed).toBe(true)
	})

	it('calling destroy twice does not throw', () => {
		const x = state('dst-twice', { default: 0 })

		x.destroy()

		expect(() => x.destroy()).not.toThrow()
	})

	it('subscribers are not notified after destroy', () => {
		const x = state('dst-sub', { default: 0 })
		const listener = vi.fn()

		x.subscribe(listener)
		x.destroy()
		x.set(1)

		expect(listener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// Feature 3 — peek()
// ---------------------------------------------------------------------------

describe('peek()', () => {
	it('returns current value', () => {
		const x = state('peek-x', { default: 'hello' })

		expect(x.peek()).toBe('hello')

		x.set('world')

		expect(x.peek()).toBe('world')

		x.destroy()
	})

	it('returns last known value after destroy', () => {
		const x = state('peek-dst', { default: 0 })

		x.set(7)
		x.destroy()

		expect(x.peek()).toBe(7)
	})

	it('returns same value as get() on a live instance', () => {
		const x = state('peek-same', { default: 42 })

		expect(x.peek()).toBe(x.get())

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// Feature 5 — batch()
// ---------------------------------------------------------------------------

describe('batch()', () => {
	it('defers notifications until batch completes', () => {
		const a = state('batch-a', { default: 0 })
		const b = state('batch-b', { default: 0 })
		const calls: string[] = []

		a.subscribe(() => calls.push('a'))
		b.subscribe(() => calls.push('b'))

		batch(() => {
			a.set(1)
			b.set(1)
			expect(calls).toHaveLength(0)
		})

		expect(calls).toEqual(['a', 'b'])

		a.destroy()
		b.destroy()
	})

	it('notifies immediately when not batching', () => {
		const x = state('batch-imm', { default: 0 })
		const listener = vi.fn()

		x.subscribe(listener)
		x.set(1)

		expect(listener).toHaveBeenCalledTimes(1)

		x.destroy()
	})

	it('handles nested batch calls', () => {
		const x = state('batch-nested', { default: 0 })
		const listener = vi.fn()

		x.subscribe(listener)

		batch(() => {
			batch(() => {
				x.set(1)
				x.set(2)
			})

			x.set(3)
		})

		// Outer batch flushes everything at the end
		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(3)

		x.destroy()
	})

	it('flushes even if fn throws', () => {
		const x = state('batch-throw', { default: 0 })
		const listener = vi.fn()

		x.subscribe(listener)

		try {
			batch(() => {
				x.set(1)
				throw new Error('oops')
			})
		} catch {
			/* expected */
		}

		expect(listener).toHaveBeenCalledWith(1)
		expect(listener).toHaveBeenCalledTimes(1)

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// Feature 7 — watch()
// ---------------------------------------------------------------------------

describe('watch()', () => {
	it('fires when the watched key changes', () => {
		const prefs = state('watch-prefs', {
			default: { theme: 'light' as string, fontSize: 14 },
		})

		const listener = vi.fn()

		prefs.watch('theme', listener)
		prefs.set({ theme: 'dark', fontSize: 14 })

		expect(listener).toHaveBeenCalledWith('dark')
		expect(listener).toHaveBeenCalledTimes(1)

		prefs.destroy()
	})

	it('does not fire when an unwatched key changes', () => {
		const prefs = state('watch-unrelated', {
			default: { theme: 'light' as string, fontSize: 14 },
		})

		const listener = vi.fn()

		prefs.watch('theme', listener)
		prefs.set({ theme: 'light', fontSize: 16 })

		expect(listener).not.toHaveBeenCalled()

		prefs.destroy()
	})

	it('returns an unsubscribe function', () => {
		const prefs = state('watch-unsub', {
			default: { theme: 'light' as string, fontSize: 14 },
		})

		const listener = vi.fn()

		const unsub = prefs.watch('theme', listener)

		prefs.set({ theme: 'dark', fontSize: 14 })
		unsub()
		prefs.set({ theme: 'light', fontSize: 14 })

		expect(listener).toHaveBeenCalledTimes(1)

		prefs.destroy()
	})

	it('supports watching multiple keys independently', () => {
		const prefs = state('watch-multi', {
			default: { theme: 'light' as string, fontSize: 14 },
		})

		const themeListener = vi.fn()
		const fontListener = vi.fn()

		prefs.watch('theme', themeListener)
		prefs.watch('fontSize', fontListener)

		prefs.set({ theme: 'dark', fontSize: 14 })

		expect(themeListener).toHaveBeenCalledWith('dark')
		expect(fontListener).not.toHaveBeenCalled()

		prefs.set({ theme: 'dark', fontSize: 16 })

		expect(fontListener).toHaveBeenCalledWith(16)
		expect(fontListener).toHaveBeenCalledTimes(1)
		expect(themeListener).toHaveBeenCalledTimes(1)

		prefs.destroy()
	})

	it('uses Object.is for comparison', () => {
		const x = state('watch-is', {
			default: { count: 0 },
		})

		const listener = vi.fn()

		x.watch('count', listener)

		x.set({ count: 0 }) // same value

		expect(listener).not.toHaveBeenCalled()

		x.set({ count: 1 })

		expect(listener).toHaveBeenCalledWith(1)
		expect(listener).toHaveBeenCalledTimes(1)

		x.destroy()
	})

	it('is a no-op on a destroyed instance', () => {
		const prefs = state('watch-dst', {
			default: { theme: 'light' as string },
		})

		prefs.destroy()

		const listener = vi.fn()
		const unsub = prefs.watch('theme', listener)

		expect(listener).not.toHaveBeenCalled()

		unsub()
	})
})
