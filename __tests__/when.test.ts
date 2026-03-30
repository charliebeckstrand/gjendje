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

	it('rejects if predicate throws synchronously on initial check', async () => {
		const s = state('when-pred-sync-throw', { default: 5, scope: 'memory' })

		let caught: unknown

		try {
			await when([s], () => {
				throw new Error('predicate boom')
			})
		} catch (err) {
			caught = err
		}

		expect(caught instanceof Error).toBe(true)
		expect((caught as Error).message).toBe('predicate boom')

		s.destroy()
	})

	it('rejects if predicate throws during onChange', async () => {
		const s = state('when-pred-async-throw', { default: 0, scope: 'memory' })

		let callCount = 0

		const promise = when([s], () => {
			callCount++
			if (callCount > 1) throw new Error('async boom')
			return false
		})

		s.set(1)

		let caught: unknown

		try {
			await promise
		} catch (err) {
			caught = err
		}

		expect(caught instanceof Error).toBe(true)
		expect((caught as Error).message).toBe('async boom')

		s.destroy()
	})

	it('returns a rejected promise (not sync throw) for predicate errors', async () => {
		const s = state('when-promise-contract', { default: 0, scope: 'memory' })

		// This should NOT throw synchronously — it should return a rejected promise
		const promise = when([s], () => {
			throw new Error('sync boom')
		})

		// Verify it's a promise (not a sync throw)
		expect(promise).toBeDefined()
		expect(typeof promise.catch).toBe('function')

		let caught: unknown

		try {
			await promise
		} catch (err) {
			caught = err
		}

		expect(caught instanceof Error).toBe(true)

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

	it('timeout fires first when both timeout and abort are set', async () => {
		const s = state('when-race-timeout-first', { default: 0, scope: 'memory' })

		const controller = new AbortController()

		let caught: unknown

		try {
			await when([s], ([v]) => (v as number) > 100, {
				timeout: 10,
				signal: controller.signal,
			})
		} catch (err) {
			caught = err
		}

		expect(caught instanceof WhenTimeoutError).toBe(true)

		// Abort after timeout should be safe (no double-rejection)
		controller.abort()

		s.destroy()
	})

	it('abort fires first when both timeout and abort are set', async () => {
		const s = state('when-race-abort-first', { default: 0, scope: 'memory' })

		const controller = new AbortController()

		const promise = when([s], ([v]) => (v as number) > 100, {
			timeout: 1000,
			signal: controller.signal,
		})

		controller.abort()

		let caught: unknown

		try {
			await promise
		} catch (err) {
			caught = err
		}

		expect(
			caught instanceof DOMException || (caught instanceof Error && caught.name === 'AbortError'),
		).toBe(true)

		s.destroy()
	})

	it('resolve fires before timeout and abort', async () => {
		const s = state('when-race-resolve-first', { default: 0, scope: 'memory' })

		const controller = new AbortController()

		const promise = when([s], ([v]) => (v as number) > 0, {
			timeout: 1000,
			signal: controller.signal,
		})

		s.set(1)

		await promise

		// These should be safe no-ops after resolution
		controller.abort()

		s.destroy()
	})

	it('rejects with empty deps and unsatisfied predicate', async () => {
		let caught: unknown

		try {
			await when([], () => false)
		} catch (err) {
			caught = err
		}

		expect(caught instanceof Error).toBe(true)
		expect((caught as Error).message).toContain('no dependencies')
	})

	it('resolves immediately with empty deps and satisfied predicate', async () => {
		await when([], () => true)
	})
})
