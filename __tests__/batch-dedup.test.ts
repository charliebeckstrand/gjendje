import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batch, state } from '../src/index.js'
import { setupBrowserEnv } from './helpers.js'

beforeEach(() => {
	setupBrowserEnv()
})

describe('batch notification deduplication', () => {
	it('duplicate set() in a batch only notifies once per instance', () => {
		const s = state('batch-dedup', { default: 0, scope: 'memory' })
		const listener = vi.fn()

		s.subscribe(listener)

		batch(() => {
			s.set(1)
			s.set(2)
			s.set(3)
		})

		// Should only notify once with the final value
		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(3)
	})

	it('multiple instances in a batch each notify exactly once', () => {
		const a = state('batch-dedup-a', { default: 0, scope: 'memory' })
		const b = state('batch-dedup-b', { default: 0, scope: 'memory' })

		const listenerA = vi.fn()
		const listenerB = vi.fn()

		a.subscribe(listenerA)
		b.subscribe(listenerB)

		batch(() => {
			a.set(1)
			b.set(1)
			a.set(2)
			b.set(2)
		})

		expect(listenerA).toHaveBeenCalledTimes(1)
		expect(listenerA).toHaveBeenCalledWith(2)
		expect(listenerB).toHaveBeenCalledTimes(1)
		expect(listenerB).toHaveBeenCalledWith(2)
	})

	it('notification that re-enqueues itself during flush is deduped', () => {
		const a = state('batch-dedup-reenter', { default: 0, scope: 'memory' })
		const b = state('batch-dedup-reenter-b', { default: 0, scope: 'memory' })

		const calls: string[] = []

		a.subscribe((v) => {
			calls.push(`a:${v}`)
			// Re-entrant: set b during a's notification
			b.set(v * 10)
		})

		b.subscribe((v) => {
			calls.push(`b:${v}`)
		})

		batch(() => {
			a.set(1)
		})

		// a's listener fires, which sets b, causing b's listener to fire
		expect(calls).toContain('a:1')
		expect(calls).toContain('b:10')
	})
})

describe('batch edge cases', () => {
	it('fires notification immediately when not in a batch', () => {
		const s = state('edge-immediate', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		s.subscribe(listener)
		s.set(1)

		// Should have fired synchronously, not deferred
		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(1)
	})

	it('catches and logs notification errors during flush', () => {
		const s = state('edge-error', { default: 0, scope: 'memory' })

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const badListener = vi.fn(() => {
			throw new Error('listener boom')
		})
		const goodListener = vi.fn()

		s.subscribe(badListener)
		s.subscribe(goodListener)

		batch(() => {
			s.set(42)
		})

		expect(goodListener).toHaveBeenCalledTimes(1)
		expect(goodListener).toHaveBeenCalledWith(42)
		expect(errorSpy).toHaveBeenCalled()

		errorSpy.mockRestore()
	})

	it('nested batch only flushes at outermost level', () => {
		const s = state('edge-nested', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		s.subscribe(listener)

		batch(() => {
			s.set(1)

			batch(() => {
				s.set(2)
			})

			// Inner batch completed but listener should NOT have fired yet
			expect(listener).not.toHaveBeenCalled()
		})

		// After outer batch, listener fires with final value
		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(2)
	})

	it('batch callback error still flushes pending notifications', () => {
		const s = state('edge-throw', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		s.subscribe(listener)

		let caught: Error | undefined

		try {
			batch(() => {
				s.set(42)
				throw new Error('boom')
			})
		} catch (err) {
			caught = err as Error
		}

		// The error should have propagated
		expect(caught instanceof Error).toBe(true)
		expect(caught?.message).toBe('boom')

		// Flush still ran because of try/finally in batch()
		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(42)
	})

	it('generation counter prevents stale dedup across separate batches', () => {
		const s = state('edge-generation', { default: 0, scope: 'memory' })

		const listener = vi.fn()

		s.subscribe(listener)

		batch(() => {
			s.set(1)
		})

		expect(listener).toHaveBeenCalledTimes(1)
		expect(listener).toHaveBeenCalledWith(1)

		batch(() => {
			s.set(2)
		})

		// Listener should fire again — generation was incremented between batches
		expect(listener).toHaveBeenCalledTimes(2)
		expect(listener).toHaveBeenCalledWith(2)
	})
})
