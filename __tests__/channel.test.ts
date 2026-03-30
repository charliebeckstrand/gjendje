import { describe, expect, it, vi } from 'vitest'
import { channel } from '../src/index.js'

describe('channel', () => {
	it('emits to a single subscriber', () => {
		const ch = channel<number>('ch-single')

		const listener = vi.fn()

		ch.subscribe(listener)
		ch.emit(42)

		expect(listener).toHaveBeenCalledWith(42)

		ch.destroy()
	})

	it('emits to multiple subscribers', () => {
		const ch = channel<string>('ch-multi')

		const listenerA = vi.fn()
		const listenerB = vi.fn()

		ch.subscribe(listenerA)
		ch.subscribe(listenerB)
		ch.emit('hello')

		expect(listenerA).toHaveBeenCalledWith('hello')
		expect(listenerB).toHaveBeenCalledWith('hello')

		ch.destroy()
	})

	it('unsubscribe stops receiving events', () => {
		const ch = channel<number>('ch-unsub')

		const listener = vi.fn()

		const unsub = ch.subscribe(listener)
		ch.emit(1)

		expect(listener).toHaveBeenCalledTimes(1)

		unsub()
		ch.emit(2)

		expect(listener).toHaveBeenCalledTimes(1)

		ch.destroy()
	})

	it('destroy() removes all listeners', () => {
		const ch = channel<number>('ch-destroy')

		const listener = vi.fn()

		ch.subscribe(listener)
		ch.destroy()
		ch.emit(1)

		expect(listener).not.toHaveBeenCalled()
	})

	it('emit() after destroy is a no-op', () => {
		const ch = channel<number>('ch-emit-after-destroy')

		const listener = vi.fn()

		ch.subscribe(listener)
		ch.destroy()

		expect(() => ch.emit(42)).not.toThrow()
		expect(listener).not.toHaveBeenCalled()
	})

	it('listener errors do not prevent other listeners from firing', () => {
		const ch = channel<number>('ch-error')

		const badListener = vi.fn(() => {
			throw new Error('boom')
		})
		const goodListener = vi.fn()

		ch.subscribe(badListener)
		ch.subscribe(goodListener)
		ch.emit(1)

		expect(badListener).toHaveBeenCalledWith(1)
		expect(goodListener).toHaveBeenCalledWith(1)

		ch.destroy()
	})

	it('auto-generates unique keys', () => {
		const ch1 = channel<number>()
		const ch2 = channel<number>()

		expect(ch1.key).not.toBe(ch2.key)

		ch1.destroy()
		ch2.destroy()
	})

	it('uses custom key from string argument', () => {
		const ch = channel<number>('my-key')

		expect(ch.key).toBe('my-key')

		ch.destroy()
	})

	it('uses custom key from options object', () => {
		const ch = channel<number>({ key: 'my-key' })

		expect(ch.key).toBe('my-key')

		ch.destroy()
	})

	it('isDestroyed reflects lifecycle', () => {
		const ch = channel<number>('ch-lifecycle')

		expect(ch.isDestroyed).toBe(false)

		ch.destroy()

		expect(ch.isDestroyed).toBe(true)
	})
})
