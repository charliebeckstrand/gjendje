import { describe, expect, it, vi } from 'vitest'
import { ResourceError, resource, state } from '../src/index.js'

describe('resource', () => {
	it('starts in loading state', () => {
		const r = resource(async () => 42)

		expect(r.loading.get()).toBe(true)
		expect(r.data.get()).toBeUndefined()
		expect(r.error.get()).toBeUndefined()

		r.destroy()
	})

	it('resolves data after fetch', async () => {
		const r = resource(async () => 'hello')

		// Wait for the microtask to complete
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(r.data.get()).toBe('hello')
		expect(r.loading.get()).toBe(false)
		expect(r.error.get()).toBeUndefined()

		r.destroy()
	})

	it('sets ResourceError on rejection', async () => {
		const r = resource(async () => {
			throw new Error('boom')
		})

		await new Promise((resolve) => setTimeout(resolve, 0))

		const err = r.error.get()

		expect(err instanceof ResourceError).toBe(true)
		expect(err?.cause instanceof Error).toBe(true)
		expect((err?.cause as Error).message).toBe('boom')
		expect(r.loading.get()).toBe(false)
		expect(r.data.get()).toBeUndefined()

		r.destroy()
	})

	it('wraps non-Error rejections in ResourceError', async () => {
		const r = resource(async () => {
			throw 'string error'
		})

		await new Promise((resolve) => setTimeout(resolve, 0))

		const err = r.error.get()

		expect(err instanceof ResourceError).toBe(true)
		expect(err?.cause).toBe('string error')

		r.destroy()
	})

	it('refetch re-triggers the async function', async () => {
		let count = 0

		const r = resource(async () => ++count)

		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.data.get()).toBe(1)

		r.refetch()
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.data.get()).toBe(2)

		r.destroy()
	})

	it('discards stale responses (race condition)', async () => {
		let callCount = 0

		const r = resource(async () => {
			const id = ++callCount
			// First call takes longer
			if (id === 1) await new Promise((resolve) => setTimeout(resolve, 100))
			return id
		})

		// Immediately refetch (second call will be faster)
		r.refetch()
		// Wait for both to complete
		await new Promise((resolve) => setTimeout(resolve, 150))
		// Should have the result of the second call (the latest), not the first
		expect(r.data.get()).toBe(2)

		r.destroy()
	})

	it('auto-refetches when deps change', async () => {
		const dep = state('res-dep', { default: 1, scope: 'memory' })

		const r = resource([dep], async ([v]) => {
			return (v as number) * 10
		})

		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.data.get()).toBe(10)

		dep.set(2)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.data.get()).toBe(20)

		r.destroy()
		dep.destroy()
	})

	it('uses initialData option', () => {
		const r = resource(async () => 'fetched', { initialData: 'initial' })

		expect(r.data.get()).toBe('initial')

		r.destroy()
	})

	it('destroy cleans up all internal state', async () => {
		const r = resource(async () => 42)

		await new Promise((resolve) => setTimeout(resolve, 0))

		r.destroy()
		expect(r.isDestroyed).toBe(true)
		// refetch after destroy should be a no-op
		r.refetch()
	})

	it('error resets on successful refetch', async () => {
		let shouldFail = true

		const r = resource(async () => {
			if (shouldFail) throw new Error('fail')
			return 'ok'
		})

		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.error.get() instanceof ResourceError).toBe(true)

		shouldFail = false
		r.refetch()
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.error.get()).toBeUndefined()
		expect(r.data.get()).toBe('ok')

		r.destroy()
	})

	it('uses custom key', () => {
		const r = resource(async () => 1, { key: 'my-resource' })

		r.destroy()
		// The key is used internally for sub-states — just verify no crash
	})

	it('handles synchronously throwing fetch function', () => {
		const r = resource(() => {
			throw new Error('sync boom')
		})

		const err = r.error.get()

		expect(err instanceof ResourceError).toBe(true)
		expect(err?.cause instanceof Error).toBe(true)
		expect((err?.cause as Error).message).toBe('sync boom')
		expect(r.loading.get()).toBe(false)

		r.destroy()
	})

	it('destroy during in-flight fetch does not update state on resolve', async () => {
		let resolveFetch: (v: string) => void = () => {}

		const r = resource(
			() =>
				new Promise<string>((resolve) => {
					resolveFetch = resolve
				}),
		)

		expect(r.loading.get()).toBe(true)

		const dataListener = vi.fn()
		r.data.subscribe(dataListener)

		r.destroy()

		resolveFetch('late result')
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(dataListener).not.toHaveBeenCalled()
		expect(r.isDestroyed).toBe(true)
	})

	it('destroy during in-flight fetch does not update state on reject', async () => {
		let rejectFetch: (e: Error) => void = () => {}

		const r = resource(
			() =>
				new Promise<string>((_, reject) => {
					rejectFetch = reject
				}),
		)

		const errorListener = vi.fn()
		r.error.subscribe(errorListener)

		r.destroy()

		rejectFetch(new Error('late error'))
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(errorListener).not.toHaveBeenCalled()
	})

	it('does not apply stale results after rapid refetches', async () => {
		let callCount = 0

		const r = resource(async () => {
			const id = ++callCount

			await new Promise((resolve) => setTimeout(resolve, 10))
			return id
		})

		r.refetch()
		r.refetch()
		r.refetch()

		await new Promise((resolve) => setTimeout(resolve, 50))

		// Only the last refetch result (id=4, including initial) should be applied
		expect(r.data.get()).toBe(4)

		r.destroy()
	})

	it('isEqual skips data notification for identical results', async () => {
		let fetchCount = 0

		const r = resource(
			async () => {
				fetchCount++
				return { value: 42 }
			},
			{ isEqual: (prev, next) => prev?.value === next.value },
		)

		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.data.get()).toEqual({ value: 42 })

		const dataListener = vi.fn()
		r.data.subscribe(dataListener)

		r.refetch()
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(dataListener).not.toHaveBeenCalled()
		expect(r.loading.get()).toBe(false)
		expect(fetchCount).toBe(2)

		r.destroy()
	})

	it('isEqual allows update when values differ', async () => {
		let counter = 0

		const r = resource(
			async () => {
				return { value: ++counter }
			},
			{ isEqual: (prev, next) => prev?.value === next.value },
		)

		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.data.get()).toEqual({ value: 1 })

		const dataListener = vi.fn()
		r.data.subscribe(dataListener)

		r.refetch()
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(dataListener).toHaveBeenCalledWith({ value: 2 })
		expect(r.data.get()).toEqual({ value: 2 })

		r.destroy()
	})

	it('handles synchronously throwing fetch function on dep-triggered refetch', async () => {
		const dep = state('res-sync-throw-dep', { default: 0, scope: 'memory' })

		let callCount = 0

		const r = resource([dep], ([v]) => {
			callCount++
			if (callCount > 1) throw new Error('sync dep boom')
			return Promise.resolve((v as number) * 10)
		})

		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(r.data.get()).toBe(0)

		dep.set(1)

		const err = r.error.get()

		expect(err instanceof ResourceError).toBe(true)
		expect(err?.cause instanceof Error).toBe(true)
		expect((err?.cause as Error).message).toBe('sync dep boom')
		expect(r.loading.get()).toBe(false)

		r.destroy()
		dep.destroy()
	})
})
