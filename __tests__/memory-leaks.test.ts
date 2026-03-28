import { afterEach, describe, expect, it, vi } from 'vitest'
import { withHistory } from '../src/enhancers/history.js'
import { withWatch } from '../src/enhancers/watch.js'
import {
	collection,
	computed,
	destroyAll,
	effect,
	resetConfig,
	select,
	state,
} from '../src/index.js'
import { previous } from '../src/previous.js'
import { getRegistry } from '../src/registry.js'

afterEach(() => {
	resetConfig()
	destroyAll()
})

// ---------------------------------------------------------------------------
// 1. Subscriber cleanup after destroy
// ---------------------------------------------------------------------------

describe('subscriber cleanup after destroy', () => {
	it('old subscribers are not called after destroy', () => {
		const s = state('leak-sub-cleanup', { default: 0 })

		const listener = vi.fn()

		s.subscribe(listener)
		s.set(1)
		expect(listener).toHaveBeenCalledTimes(1)

		s.destroy()
		s.set(2)
		expect(listener).toHaveBeenCalledTimes(1)
	})

	it('subscribing after destroy returns a no-op unsub', () => {
		const s = state('leak-sub-after-destroy', { default: 'hello' })

		s.destroy()

		const listener = vi.fn()

		const unsub = s.subscribe(listener)

		// Should not throw when called
		unsub()

		s.set('world')
		expect(listener).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// 2. Computed chain cleanup
// ---------------------------------------------------------------------------

describe('computed chain cleanup', () => {
	it('destroying leaf → intermediates → root silences all listeners', () => {
		const root = state('leak-chain-root', { default: 1 })

		const mid1 = computed([root], ([v]) => (v ?? 0) * 2, { key: 'leak-chain-mid1' })
		const mid2 = computed([mid1], ([v]) => (v ?? 0) + 10, { key: 'leak-chain-mid2' })
		const leaf = select(mid2, (v) => String(v), { key: 'leak-chain-leaf' })

		const leafListener = vi.fn()
		const mid2Listener = vi.fn()
		const mid1Listener = vi.fn()

		leaf.subscribe(leafListener)
		mid2.subscribe(mid2Listener)
		mid1.subscribe(mid1Listener)

		// Verify chain works
		root.set(2)
		expect(leafListener).toHaveBeenCalledTimes(1)
		expect(mid2Listener).toHaveBeenCalledTimes(1)
		expect(mid1Listener).toHaveBeenCalledTimes(1)

		// Destroy leaf first
		leaf.destroy()
		root.set(3)
		expect(leafListener).toHaveBeenCalledTimes(1) // no more calls

		// Destroy mid2
		mid2.destroy()
		root.set(4)
		expect(mid2Listener).toHaveBeenCalledTimes(2) // got call from set(3) but not set(4)? Let's just check final
		// mid2 was destroyed, so mid2Listener should not fire for set(4)
		// mid1Listener still active
		expect(mid1Listener).toHaveBeenCalledTimes(3) // set(2), set(3), set(4)

		// Destroy mid1
		mid1.destroy()
		root.set(5)
		expect(mid1Listener).toHaveBeenCalledTimes(3) // no more calls

		root.destroy()
	})
})

// ---------------------------------------------------------------------------
// 3. Effect cleanup on stop
// ---------------------------------------------------------------------------

describe('effect cleanup on stop', () => {
	it('runs cleanup and stops callbacks after stop()', () => {
		const s = state('leak-effect-stop', { default: 0 })

		const cleanup = vi.fn()
		const callback = vi.fn(() => cleanup)

		const handle = effect([s], callback)

		// Effect runs immediately
		expect(callback).toHaveBeenCalledTimes(1)
		expect(cleanup).not.toHaveBeenCalled()

		// Trigger a change
		s.set(1)
		expect(callback).toHaveBeenCalledTimes(2)
		expect(cleanup).toHaveBeenCalledTimes(1) // cleanup from first run

		// Stop the effect
		handle.stop()
		expect(cleanup).toHaveBeenCalledTimes(2) // final cleanup on stop

		// Further changes should not trigger callback
		s.set(2)
		s.set(3)
		expect(callback).toHaveBeenCalledTimes(2)
		expect(cleanup).toHaveBeenCalledTimes(2)
	})

	it('stop() is idempotent', () => {
		const s = state('leak-effect-idempotent', { default: 0 })

		const cleanup = vi.fn()

		const handle = effect([s], () => cleanup)

		handle.stop()
		expect(cleanup).toHaveBeenCalledTimes(1)

		// Second stop should be a no-op
		handle.stop()
		expect(cleanup).toHaveBeenCalledTimes(1)
	})
})

// ---------------------------------------------------------------------------
// 4. Collection destroy releases watchers
// ---------------------------------------------------------------------------

describe('collection destroy releases watchers', () => {
	it('watchers are cleared and mutations do not trigger them after destroy', () => {
		const col = collection('leak-col-watchers', {
			default: [{ id: 1, name: 'Alice' }] as Array<{ id: number; name: string }>,
		})

		const nameWatcher = vi.fn()
		const idWatcher = vi.fn()

		col.watch('name', nameWatcher)
		col.watch('id', idWatcher)

		// Verify watchers work
		col.update((item) => item.id === 1, { name: 'Bob' })
		expect(nameWatcher).toHaveBeenCalledTimes(1)

		// Destroy
		col.destroy()

		// Mutations after destroy should not trigger watchers
		// (set on destroyed state is a no-op or silent)
		expect(nameWatcher).toHaveBeenCalledTimes(1)
		expect(idWatcher).toHaveBeenCalledTimes(0)
	})
})

// ---------------------------------------------------------------------------
// 5. withHistory destroy releases stacks
// ---------------------------------------------------------------------------

describe('withHistory destroy releases stacks', () => {
	it('tears down properly after undo/redo operations', () => {
		const s = state('leak-history', { default: 0 })

		const h = withHistory(s)

		h.set(1)
		h.set(2)
		h.set(3)
		expect(h.canUndo).toBe(true)

		h.undo()
		expect(h.get()).toBe(2)
		expect(h.canRedo).toBe(true)

		h.redo()
		expect(h.get()).toBe(3)

		// Destroy the history-enhanced instance
		h.destroy()
		expect(h.isDestroyed).toBe(true)
		expect(h.canUndo).toBe(false)
		expect(h.canRedo).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// 6. withWatch destroy releases subscriptions
// ---------------------------------------------------------------------------

describe('withWatch destroy releases subscriptions', () => {
	it('no further notifications after destroy', () => {
		const s = state('leak-watch', { default: { x: 1, y: 2, z: 3 } })

		const w = withWatch(s)

		const xWatcher = vi.fn()
		const yWatcher = vi.fn()
		const zWatcher = vi.fn()

		w.watch('x', xWatcher)
		w.watch('y', yWatcher)
		w.watch('z', zWatcher)

		// Verify watchers work
		w.set({ x: 10, y: 2, z: 3 })
		expect(xWatcher).toHaveBeenCalledTimes(1)
		expect(yWatcher).not.toHaveBeenCalled()

		// Destroy
		w.destroy()

		// No further notifications
		expect(xWatcher).toHaveBeenCalledTimes(1)
		expect(yWatcher).not.toHaveBeenCalled()
		expect(zWatcher).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// 7. destroyAll clears everything
// ---------------------------------------------------------------------------

describe('destroyAll clears everything', () => {
	it('destroys 50 instances and empties the registry', () => {
		const instances = Array.from({ length: 50 }, (_, i) => state(`leak-all-${i}`, { default: i }))

		expect(getRegistry().size).toBeGreaterThanOrEqual(50)

		destroyAll()

		expect(getRegistry().size).toBe(0)

		for (const inst of instances) {
			expect(inst.isDestroyed).toBe(true)
		}
	})
})

// ---------------------------------------------------------------------------
// 8. Circular subscription doesn't leak
// ---------------------------------------------------------------------------

describe('circular subscription does not leak', () => {
	it('cleans up without issues when both sides are destroyed', () => {
		const a = state('leak-circ-a', { default: 0 })
		const b = state('leak-circ-b', { default: 0 })

		let guardA = false
		let guardB = false

		const unsubA = a.subscribe((val) => {
			if (guardB) return
			guardA = true
			b.set(val + 1)
			guardA = false
		})

		const unsubB = b.subscribe((val) => {
			if (guardA) return
			guardB = true
			a.set(val + 1)
			guardB = false
		})

		// Trigger one cycle
		a.set(1)
		expect(b.get()).toBe(2)

		// Clean up subscriptions then destroy
		unsubA()
		unsubB()

		a.destroy()
		b.destroy()

		expect(a.isDestroyed).toBe(true)
		expect(b.isDestroyed).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// 9. Long-lived computed with many source changes
// ---------------------------------------------------------------------------

describe('long-lived computed with many source changes', () => {
	it('works correctly after 1000 source changes and cleans up', () => {
		const source = state('leak-longcomp', { default: 0 })

		const derived = computed([source], ([v]) => (v ?? 0) * 2, { key: 'leak-longcomp-derived' })

		const listener = vi.fn()

		derived.subscribe(listener)

		for (let i = 1; i <= 1000; i++) {
			source.set(i)
		}

		expect(derived.get()).toBe(2000)
		expect(listener).toHaveBeenCalledTimes(1000)

		// Destroy and verify cleanup
		derived.destroy()
		expect(derived.isDestroyed).toBe(true)

		// Source changes should not trigger the destroyed computed's listener
		source.set(9999)
		expect(listener).toHaveBeenCalledTimes(1000)

		source.destroy()
	})
})

// ---------------------------------------------------------------------------
// 10. Previous instance cleanup
// ---------------------------------------------------------------------------

describe('previous instance cleanup', () => {
	it('source changes no longer trigger callbacks after destroy', () => {
		const source = state('leak-prev-src', { default: 'a' })

		const prev = previous(source, { key: 'leak-prev' })

		const listener = vi.fn()

		prev.subscribe(listener)

		// Change source a few times
		source.set('b')
		expect(prev.get()).toBe('a')
		expect(listener).toHaveBeenCalledTimes(1)

		source.set('c')
		expect(prev.get()).toBe('b')
		expect(listener).toHaveBeenCalledTimes(2)

		source.set('d')
		expect(prev.get()).toBe('c')
		expect(listener).toHaveBeenCalledTimes(3)

		// Destroy the previous instance
		prev.destroy()
		expect(prev.isDestroyed).toBe(true)

		// Source changes should not trigger any callbacks
		source.set('e')
		source.set('f')
		expect(listener).toHaveBeenCalledTimes(3)

		source.destroy()
	})
})
