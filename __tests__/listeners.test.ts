import { describe, expect, it, vi } from 'vitest'
import { createListeners, safeCall, safeCallChange } from '../src/listeners.js'

describe('safeCall', () => {
	it('invokes listener with value', () => {
		const fn = vi.fn()

		safeCall(fn, 42)

		expect(fn).toHaveBeenCalledWith(42)
	})

	it('catches and logs listener error without rethrowing', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const fn = () => {
			throw new Error('boom')
		}

		expect(() => safeCall(fn, 1)).not.toThrow()
		expect(spy).toHaveBeenCalledWith('[gjendje] Listener threw:', expect.any(Error))

		spy.mockRestore()
	})
})

describe('safeCallChange', () => {
	it('invokes handler with next and prev', () => {
		const fn = vi.fn()

		safeCallChange(fn, 'next', 'prev')

		expect(fn).toHaveBeenCalledWith('next', 'prev')
	})

	it('catches and logs handler error without rethrowing', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const fn = () => {
			throw new Error('handler boom')
		}

		expect(() => safeCallChange(fn, 1, 0)).not.toThrow()
		expect(spy).toHaveBeenCalledWith('[gjendje] Change handler threw:', expect.any(Error))

		spy.mockRestore()
	})

	it('does not swallow the return value (void)', () => {
		const fn = vi.fn()

		safeCallChange(fn, 'a', 'b')

		expect(fn).toHaveBeenCalledTimes(1)
	})
})

describe('createListeners', () => {
	it('notify calls all subscribed listeners', () => {
		const listeners = createListeners<number>()

		const a = vi.fn()
		const b = vi.fn()

		listeners.subscribe(a)
		listeners.subscribe(b)
		listeners.notify(42)

		expect(a).toHaveBeenCalledWith(42)
		expect(b).toHaveBeenCalledWith(42)
	})

	it('unsubscribe removes a specific listener', () => {
		const listeners = createListeners<number>()
		const a = vi.fn()

		const unsub = listeners.subscribe(a)

		listeners.notify(1)
		expect(a).toHaveBeenCalledTimes(1)

		unsub()

		listeners.notify(2)
		expect(a).toHaveBeenCalledTimes(1)
	})

	it('clear removes all listeners', () => {
		const listeners = createListeners<string>()

		const a = vi.fn()
		const b = vi.fn()

		listeners.subscribe(a)
		listeners.subscribe(b)

		listeners.clear()
		listeners.notify('hello')

		expect(a).not.toHaveBeenCalled()
		expect(b).not.toHaveBeenCalled()
	})

	it('one faulty listener does not silence others', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const listeners = createListeners<number>()

		const good = vi.fn()

		listeners.subscribe(() => {
			throw new Error('bad')
		})
		listeners.subscribe(good)

		listeners.notify(99)

		expect(good).toHaveBeenCalledWith(99)
		expect(spy).toHaveBeenCalled()

		spy.mockRestore()
	})
})
