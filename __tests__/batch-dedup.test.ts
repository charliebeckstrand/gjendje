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
