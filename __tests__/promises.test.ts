import { beforeEach, describe, expect, it } from 'vitest'
import { computed, state } from '../src/index.js'

function makeStorage(): Storage {
	const store = new Map<string, string>()

	return {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => {
			store.set(k, v)
		},
		removeItem: (k) => {
			store.delete(k)
		},
		clear: () => {
			store.clear()
		},
		get length() {
			return store.size
		},
		key: (i) => [...store.keys()][i] ?? null,
	}
}

beforeEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'sessionStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'document', {
		value: {},
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'BroadcastChannel', {
		value: class {
			onmessage = null
			postMessage() {}
			close() {}
		},
		configurable: true,
	})

	Object.defineProperty(globalThis, 'navigator', {
		value: {},
		configurable: true,
		writable: true,
	})
})

// ---------------------------------------------------------------------------
// settled
// ---------------------------------------------------------------------------

describe('settled', () => {
	it('resolves immediately for render scope', async () => {
		const x = state('settled-render', { default: 0 })

		x.set(1)

		await expect(x.settled).resolves.toBeUndefined()

		x.destroy()
	})

	it('resolves immediately for local scope', async () => {
		const x = state('settled-local', { default: 0, scope: 'local' })

		x.set(1)

		await expect(x.settled).resolves.toBeUndefined()

		x.destroy()
	})

	it('resolves immediately before any set is called', async () => {
		const x = state('settled-initial', { default: 0 })

		await expect(x.settled).resolves.toBeUndefined()

		x.destroy()
	})

	it('resolves after ready for bucket scope', async () => {
		const x = state('settled-bucket', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'settled-test' },
		})

		await x.ready

		x.set('dark')

		await expect(x.settled).resolves.toBeUndefined()

		x.destroy()
	})

	it('settled updates on each set call', async () => {
		const x = state('settled-multi', { default: 0 })

		x.set(1)
		const first = x.settled

		x.set(2)
		const second = x.settled

		await expect(first).resolves.toBeUndefined()
		await expect(second).resolves.toBeUndefined()

		x.destroy()
	})

	it('resolves on computed when all deps are settled', async () => {
		const a = state('settled-comp-a', { default: 0 })
		const b = state('settled-comp-b', { default: 0 })
		const c = computed([a, b], ([x, y]) => (x ?? 0) + (y ?? 0))

		a.set(1)
		b.set(2)

		await expect(c.settled).resolves.toBeUndefined()

		a.destroy()
		b.destroy()
		c.destroy()
	})
})

// ---------------------------------------------------------------------------
// hydrated
// ---------------------------------------------------------------------------

describe('hydrated', () => {
	it('resolves immediately for non-SSR state', async () => {
		const x = state('hydrated-render', { default: 0 })

		await expect(x.hydrated).resolves.toBeUndefined()

		x.destroy()
	})

	it('resolves immediately for local scope without ssr flag', async () => {
		const x = state('hydrated-local', { default: 0, scope: 'local' })

		await expect(x.hydrated).resolves.toBeUndefined()

		x.destroy()
	})

	it('resolves after hydration for SSR-mode client state', async () => {
		const x = state('hydrated-ssr', {
			default: 'light',
			scope: 'local',
			ssr: true,
		})

		// On the client (window is defined), hydrated resolves after afterHydration
		await expect(x.hydrated).resolves.toBeUndefined()

		x.destroy()
	})

	it('resolves on computed when all deps are hydrated', async () => {
		const a = state('hydrated-comp-a', { default: 0 })
		const b = state('hydrated-comp-b', { default: 0 })
		const c = computed([a, b], ([x, y]) => (x ?? 0) + (y ?? 0))

		await expect(c.hydrated).resolves.toBeUndefined()

		a.destroy()
		b.destroy()
		c.destroy()
	})
})

// ---------------------------------------------------------------------------
// destroyed
// ---------------------------------------------------------------------------

describe('destroyed', () => {
	it('does not resolve before destroy is called', async () => {
		const x = state('destroyed-pending', { default: 0 })

		let resolved = false

		x.destroyed.then(() => {
			resolved = true
		})

		// Flush microtasks
		await Promise.resolve()
		await Promise.resolve()

		expect(resolved).toBe(false)

		x.destroy()
	})

	it('resolves when destroy() is called', async () => {
		const x = state('destroyed-resolve', { default: 0 })

		const promise = x.destroyed

		x.destroy()

		await expect(promise).resolves.toBeUndefined()
	})

	it('resolves immediately if already destroyed', async () => {
		const x = state('destroyed-already', { default: 0 })

		x.destroy()

		await expect(x.destroyed).resolves.toBeUndefined()
	})

	it('resolves on computed when destroy is called', async () => {
		const a = state('destroyed-comp-a', { default: 0 })
		const c = computed([a], ([x]) => (x ?? 0) * 2)

		const promise = c.destroyed

		c.destroy()

		await expect(promise).resolves.toBeUndefined()

		a.destroy()
	})

	it('isDestroyed boolean is false before destroy', () => {
		const x = state('destroyed-bool-false', { default: 0 })

		expect(x.isDestroyed).toBe(false)

		x.destroy()
	})

	it('isDestroyed boolean is true after destroy', () => {
		const x = state('destroyed-bool-true', { default: 0 })

		x.destroy()

		expect(x.isDestroyed).toBe(true)
	})
})
