import { describe, expect, it } from 'vitest'
import { state, WhenTimeoutError, when } from '../src/index.js'

describe('when', () => {
	it('resolves immediately when predicate is already true', async () => {
		const s = state('when-already-true', { default: 5, scope: 'memory' })

		await when([s], ([v]) => (v as number) > 0)

		s.destroy()
	})

	it('resolves when predicate becomes true after state change', async () => {
		const s = state('when-becomes-true', { default: 0, scope: 'memory' })

		const promise = when([s], ([v]) => (v as number) > 0)

		s.set(1)

		await promise

		s.destroy()
	})

	it('works with multiple dependencies', async () => {
		const a = state('when-multi-a', { default: 0, scope: 'memory' })
		const b = state('when-multi-b', { default: 0, scope: 'memory' })

		const promise = when([a, b], ([x, y]) => (x as number) > 0 && (y as number) > 0)

		a.set(1)
		b.set(1)

		await promise

		a.destroy()
		b.destroy()
	})

	it('rejects with WhenTimeoutError on timeout', async () => {
		const s = state('when-timeout', { default: 0, scope: 'memory' })

		let caught: unknown

		try {
			await when([s], ([v]) => (v as number) > 100, { timeout: 20 })
		} catch (err) {
			caught = err
		}

		expect(caught instanceof WhenTimeoutError).toBe(true)

		s.destroy()
	})

	it('rejects when AbortSignal is aborted', async () => {
		const s = state('when-abort', { default: 0, scope: 'memory' })

		const controller = new AbortController()

		const promise = when([s], ([v]) => (v as number) > 100, { signal: controller.signal })

		controller.abort()

		let rejected = false

		try {
			await promise
		} catch {
			rejected = true
		}

		expect(rejected).toBe(true)

		s.destroy()
	})

	it('rejects immediately if signal is already aborted', async () => {
		const s = state('when-pre-aborted', { default: 0, scope: 'memory' })

		const controller = new AbortController()
		controller.abort()

		let rejected = false

		try {
			await when([s], ([v]) => (v as number) > 100, { signal: controller.signal })
		} catch {
			rejected = true
		}

		expect(rejected).toBe(true)

		s.destroy()
	})

	it('cleans up subscriptions after resolving', async () => {
		const s = state('when-cleanup-resolve', { default: 0, scope: 'memory' })

		const promise = when([s], ([v]) => (v as number) > 0)

		s.set(1)

		await promise

		// Further state changes should not cause issues
		s.set(2)
		s.set(3)

		s.destroy()
	})

	it('cleans up subscriptions after timeout', async () => {
		const s = state('when-cleanup-timeout', { default: 0, scope: 'memory' })

		try {
			await when([s], ([v]) => (v as number) > 100, { timeout: 20 })
		} catch {
			// Expected timeout
		}

		// Further state changes should not cause issues
		s.set(1)
		s.set(2)

		s.destroy()
	})
})
