import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorageAdapter } from '../src/adapters/storage.js'
import { resetConfig, state } from '../src/index.js'
import { makeStorage, setupBrowserEnv } from './helpers.js'

// ---------------------------------------------------------------------------
// Finding: MemoryStateImpl subscriber snapshot safety
// ---------------------------------------------------------------------------

describe('MemoryStateImpl: subscriber added during notification does not fire in same cycle', () => {
	it('subscribe during notification (memory scope)', () => {
		const s = state('mem-snap-sub', { default: 0 })

		const secondListener = vi.fn()

		const firstListener = vi.fn(() => {
			s.subscribe(secondListener)
		})

		s.subscribe(firstListener)

		s.set(1)

		expect(firstListener).toHaveBeenCalledWith(1)
		expect(secondListener).not.toHaveBeenCalled()

		// On next change it should fire
		s.set(2)

		expect(secondListener).toHaveBeenCalledWith(2)

		s.destroy()
	})

	it('unsubscribe during notification does not skip other listeners (memory scope)', () => {
		const s = state('mem-snap-unsub', { default: 0 })

		const thirdListener = vi.fn()

		let unsub2: (() => void) | undefined

		const firstListener = vi.fn()

		const secondListener = vi.fn(() => {
			unsub2?.()
		})

		s.subscribe(firstListener)
		unsub2 = s.subscribe(secondListener)
		s.subscribe(thirdListener)

		s.set(1)

		expect(firstListener).toHaveBeenCalledWith(1)
		expect(secondListener).toHaveBeenCalledWith(1)
		expect(thirdListener).toHaveBeenCalledWith(1)

		// On next change, only first and third should fire
		s.set(2)

		expect(firstListener).toHaveBeenCalledTimes(2)
		expect(secondListener).toHaveBeenCalledTimes(1)
		expect(thirdListener).toHaveBeenCalledTimes(2)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding: MemoryStateImpl onChange handler snapshot safety
// ---------------------------------------------------------------------------

describe('MemoryStateImpl: onChange handler snapshot safety', () => {
	it('onChange handler added during notification does not fire in same cycle', () => {
		const s = state('mem-onchange-add', { default: 0 })

		const secondHandler = vi.fn()

		const firstHandler = vi.fn(() => {
			s.onChange(secondHandler)
		})

		s.onChange(firstHandler)

		s.set(1)

		expect(firstHandler).toHaveBeenCalled()
		expect(secondHandler).not.toHaveBeenCalled()

		s.set(2)

		expect(secondHandler).toHaveBeenCalled()

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// Finding: createListeners (adapter) notification snapshot safety
// ---------------------------------------------------------------------------

describe('createListeners: adapter subscriber snapshot safety', () => {
	beforeEach(() => {
		setupBrowserEnv()
	})

	afterEach(() => {
		resetConfig()
	})

	it('subscriber added during adapter notification does not fire in same cycle', () => {
		const storage = makeStorage()

		const adapter = createStorageAdapter(storage, 'adapter-snap', {
			default: 0,
		})

		const secondListener = vi.fn()

		const firstListener = vi.fn(() => {
			adapter.subscribe(secondListener)
		})

		adapter.subscribe(firstListener)

		adapter.set(1)

		expect(firstListener).toHaveBeenCalledWith(1)
		expect(secondListener).not.toHaveBeenCalled()

		adapter.set(2)

		expect(secondListener).toHaveBeenCalledWith(2)

		adapter.destroy?.()
	})
})
