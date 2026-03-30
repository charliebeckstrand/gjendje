import { describe, expect, it } from 'vitest'
import { resource, state } from '../src/index.js'

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

	it('sets error on rejection', async () => {
		const r = resource(async () => {
			throw new Error('boom')
		})

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(r.error.get() instanceof Error).toBe(true)
		expect(r.error.get()?.message).toBe('boom')
		expect(r.loading.get()).toBe(false)
		expect(r.data.get()).toBeUndefined()

		r.destroy()
	})

	it('wraps non-Error rejections', async () => {
		const r = resource(async () => {
			throw 'string error'
		})

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(r.error.get() instanceof Error).toBe(true)
		expect(r.error.get()?.message).toBe('string error')

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
		expect(r.error.get() instanceof Error).toBe(true)

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
})
