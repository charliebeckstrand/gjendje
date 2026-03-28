import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../../src/shortcuts.js'
import { setupFullBrowserEnv } from '../helpers.js'

beforeEach(() => {
	setupFullBrowserEnv()
})

describe('session scope parity', () => {
	it('get() returns the default value', () => {
		const s = state('sess-par-default', { default: 42, scope: 'session' })

		expect(s.get()).toBe(42)

		s.destroy()
	})

	it('set() updates the stored value', () => {
		const s = state('sess-par-set', { default: 0, scope: 'session' })

		s.set(7)

		expect(s.get()).toBe(7)

		s.destroy()
	})

	it('reset() restores to default', () => {
		const s = state('sess-par-reset', { default: 10, scope: 'session' })

		s.set(99)
		s.reset()

		expect(s.get()).toBe(10)

		s.destroy()
	})

	it('subscribe fires on set()', () => {
		const s = state('sess-par-sub', { default: 0, scope: 'session' })

		const calls: number[] = []

		s.subscribe((v) => calls.push(v))
		s.set(5)

		expect(calls).toEqual([5])

		s.destroy()
	})

	it('unsubscribe stops notifications', () => {
		const s = state('sess-par-unsub', { default: 0, scope: 'session' })

		const listener = vi.fn()

		const unsub = s.subscribe(listener)

		s.set(1)
		unsub()
		s.set(2)

		expect(listener).toHaveBeenCalledTimes(1)

		s.destroy()
	})

	it('onChange fires with next and prev', () => {
		const s = state('sess-par-onchange', { default: 'a', scope: 'session' })

		const changes: Array<[string, string]> = []

		s.onChange((next, prev) => changes.push([next, prev]))

		s.set('b')
		s.set('c')

		expect(changes).toEqual([
			['b', 'a'],
			['c', 'b'],
		])

		s.destroy()
	})

	it('intercept transforms the value', () => {
		const s = state('sess-par-intercept', { default: 0, scope: 'session' })

		s.intercept((next) => next * 2)

		s.set(5)

		expect(s.get()).toBe(10)

		s.destroy()
	})

	it('destroy prevents further set()', () => {
		const s = state('sess-par-destroy', { default: 0, scope: 'session' })

		s.set(1)
		s.destroy()
		s.set(2)

		expect(s.peek()).toBe(1)
	})

	it('isDestroyed is true after destroy()', () => {
		const s = state('sess-par-isdestroyed', { default: 0, scope: 'session' })

		s.destroy()

		expect(s.isDestroyed).toBe(true)
	})

	it('double destroy is safe', () => {
		const s = state('sess-par-double-destroy', { default: 0, scope: 'session' })

		s.destroy()

		expect(() => s.destroy()).not.toThrow()
	})
})
