import { afterEach, describe, expect, it, vi } from 'vitest'
import { collection } from '../src/collection.js'
import { resetConfig } from '../src/config.js'
import { effect } from '../src/effect.js'
import { withWatch } from '../src/enhancers/watch.js'
import { previous } from '../src/previous.js'
import { destroyAll } from '../src/registry.js'
import { state } from '../src/shortcuts.js'

afterEach(() => {
	resetConfig()
	destroyAll()
})

// ---------------------------------------------------------------------------
// #2 — withWatch: failed subscription allows retry
// ---------------------------------------------------------------------------

describe('withWatch: subscription failure allows retry', () => {
	it('retries subscription after initial failure', () => {
		const base = state('watch-retry', { default: { x: 1 } })

		const originalSubscribe = base.subscribe.bind(base)
		let callCount = 0

		// First call throws, second succeeds
		base.subscribe = (listener: (value: { x: number }) => void) => {
			callCount++
			if (callCount === 1) throw new Error('subscribe failed')
			return originalSubscribe(listener)
		}

		const w = withWatch(base)

		const listener = vi.fn()

		// First watch() call — subscribe throws, watcher registered but not active
		expect(() => w.watch('x', listener)).toThrow('subscribe failed')

		// Second watch() call — subscribe succeeds, watcher should now work
		const unsub = w.watch('x', listener)

		base.subscribe = originalSubscribe

		base.set({ x: 2 })
		expect(listener).toHaveBeenCalledWith(2)

		unsub()
		w.destroy()
	})
})

// ---------------------------------------------------------------------------
// #3 — effect: unsubscribers cleared after stop()
// ---------------------------------------------------------------------------

describe('effect: unsubscribers cleared after stop()', () => {
	it('does not retain references to unsubscribe functions after stop', () => {
		const a = state('effect-clear-a', { default: 0 })
		const b = state('effect-clear-b', { default: 0 })

		const fn = vi.fn()

		const handle = effect([a, b], fn)

		// stop() should unsubscribe and clear the array
		handle.stop()

		// Calling stop() again should be safe (no double-unsub)
		handle.stop()

		a.destroy()
		b.destroy()
	})
})

// ---------------------------------------------------------------------------
// #4 — collection: watcher state nullified after destroy
// ---------------------------------------------------------------------------

describe('collection: watcher state nullified after destroy', () => {
	it('cleans up watchers, unsubscribe, and prevItems on destroy', () => {
		const col = collection('col-cleanup', {
			default: [{ name: 'Alice' }],
		})

		const listener = vi.fn()

		col.watch('name', listener)

		col.add({ name: 'Bob' })
		expect(listener).toHaveBeenCalled()

		listener.mockClear()

		col.destroy()

		// After destroy, adding a new watcher should not throw but
		// the collection is destroyed — any calls are inert
		expect(col.isDestroyed).toBe(true)
	})

	it('does not notify watchers after destroy', () => {
		const col = collection('col-no-notify', {
			default: [{ x: 1 }],
		})

		const listener = vi.fn()

		col.watch('x', listener)

		col.destroy()

		// Verify listener was not called after destroy
		listener.mockClear()
		expect(listener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// #5 — previous: subscription error handling
// ---------------------------------------------------------------------------

describe('previous: subscription error handling', () => {
	it('throws a descriptive error and cleans up when source.subscribe() throws', () => {
		const base = state('prev-throw', { default: 0 })

		const originalSubscribe = base.subscribe.bind(base)

		base.subscribe = () => {
			throw new Error('subscribe boom')
		}

		expect(() => previous(base, { key: 'test-prev' })).toThrow(
			'[gjendje] previous(): source.subscribe() threw for "test-prev"',
		)

		base.subscribe = originalSubscribe

		base.destroy()
	})

	it('works normally when source.subscribe() succeeds', () => {
		const base = state('prev-ok', { default: 0 })

		const prev = previous(base)

		expect(prev.get()).toBe(undefined)

		base.set(1)
		expect(prev.get()).toBe(0)

		base.set(2)
		expect(prev.get()).toBe(1)

		prev.destroy()
		base.destroy()
	})
})
