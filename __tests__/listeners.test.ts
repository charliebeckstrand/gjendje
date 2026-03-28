import { describe, expect, it, vi } from 'vitest'
import { createListeners, safeCall, safeCallChange, safeCallConfig } from '../src/listeners.js'

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

describe('listener edge cases', () => {
	it('safeCall reports error via reportError when key and scope are provided', async () => {
		const { configure } = await import('../src/index.js')

		const onError = vi.fn()

		configure({ onError })

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		safeCall(
			() => {
				throw new Error('boom')
			},
			42,
			'test-key',
			'memory',
		)

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'test-key', scope: 'memory' }),
		)

		spy.mockRestore()
		configure({ onError: undefined })
	})

	it('safeCall does not call reportError when key or scope is missing', async () => {
		const { configure } = await import('../src/index.js')

		const onError = vi.fn()

		configure({ onError })

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		safeCall(() => {
			throw new Error('boom')
		}, 42)

		expect(onError).not.toHaveBeenCalled()
		expect(spy).toHaveBeenCalledWith('[gjendje] Listener threw:', expect.any(Error))

		spy.mockRestore()
		configure({ onError: undefined })
	})

	it('safeCallChange reports error when key and scope are provided', async () => {
		const { configure } = await import('../src/index.js')

		const onError = vi.fn()

		configure({ onError })

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		safeCallChange(
			() => {
				throw new Error('handler boom')
			},
			'next',
			'prev',
			'test-key',
			'memory',
		)

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'test-key', scope: 'memory' }),
		)

		spy.mockRestore()
		configure({ onError: undefined })
	})

	it('safeCallConfig is a no-op when fn is undefined', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		expect(() => safeCallConfig(undefined, 'anything')).not.toThrow()
		expect(spy).not.toHaveBeenCalled()

		spy.mockRestore()
	})

	it('listener can unsubscribe itself during notification without breaking iteration', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const listeners = createListeners<number>()

		const listenerA = vi.fn()
		const listenerC = vi.fn()

		let unsubB: (() => void) | undefined

		const listenerB = vi.fn(() => {
			unsubB?.()
		})

		listeners.subscribe(listenerA)
		unsubB = listeners.subscribe(listenerB)
		listeners.subscribe(listenerC)

		listeners.notify(1)

		expect(listenerA).toHaveBeenCalledTimes(1)
		expect(listenerB).toHaveBeenCalledTimes(1)
		expect(listenerC).toHaveBeenCalledTimes(1)

		spy.mockRestore()
	})
})
