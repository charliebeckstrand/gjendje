import type { Listener } from '../src/types.js'

export function makeStorage(): Storage {
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

// ---------------------------------------------------------------------------
// Browser environment setup helpers
// ---------------------------------------------------------------------------

/** Minimal no-op BroadcastChannel for tests that don't need cross-tab sync. */
class StubBroadcastChannel {
	onmessage = null
	postMessage() {}
	close() {}
}

/**
 * Sets up localStorage, window, and BroadcastChannel on globalThis.
 * Suitable for most tests that only need localStorage.
 */
export function setupBrowserEnv(): void {
	Object.defineProperty(globalThis, 'localStorage', {
		value: makeStorage(),
		configurable: true,
	})

	Object.defineProperty(globalThis, 'window', {
		value: { addEventListener: () => {}, removeEventListener: () => {} },
		configurable: true,
		writable: true,
	})

	Object.defineProperty(globalThis, 'BroadcastChannel', {
		value: StubBroadcastChannel,
		configurable: true,
	})
}

/**
 * Sets up localStorage, sessionStorage, window, and BroadcastChannel on globalThis.
 * Use when tests need both storage types.
 */
export function setupFullBrowserEnv(): void {
	setupBrowserEnv()

	Object.defineProperty(globalThis, 'sessionStorage', {
		value: makeStorage(),
		configurable: true,
	})
}

// ---------------------------------------------------------------------------
// Mock BroadcastChannel with real message routing (for sync tests)
// ---------------------------------------------------------------------------

type MessageHandler = (event: { data: unknown }) => void

export class MockBroadcastChannel {
	static channels = new Map<string, Set<MockBroadcastChannel>>()

	onmessage: MessageHandler | null = null

	constructor(public name: string) {
		if (!MockBroadcastChannel.channels.has(name)) {
			MockBroadcastChannel.channels.set(name, new Set())
		}

		MockBroadcastChannel.channels.get(name)?.add(this)
	}

	postMessage(data: unknown) {
		const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set()

		for (const channel of peers) {
			if (channel !== this && channel.onmessage) {
				channel.onmessage({ data })
			}
		}
	}

	close() {
		MockBroadcastChannel.channels.get(this.name)?.delete(this)
	}

	static clear() {
		MockBroadcastChannel.channels.clear()
	}
}

// ---------------------------------------------------------------------------
// Instance tracking helper
// ---------------------------------------------------------------------------

export function createInstanceTracker() {
	const instances: Array<{ destroy(): void }> = []

	return {
		track<T extends { destroy(): void }>(instance: T): T {
			instances.push(instance)
			return instance
		},

		cleanup() {
			for (const instance of instances) instance.destroy()
			instances.length = 0
		},
	}
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Spy on console.warn, run fn, assert warning was emitted, then restore.
 * Returns the spy for additional assertions if needed.
 */
export async function expectConsoleWarning(
	fn: () => void | Promise<void>,
	expectedMessage: string,
): Promise<void> {
	const { vi, expect } = await import('vitest')

	const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

	await fn()

	expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(expectedMessage))

	warnSpy.mockRestore()
}

/**
 * Assert that subscribing, mutating, then unsubscribing works correctly.
 */
export async function expectUnsubscribeStopsNotifying<T>(
	instance: { subscribe: (fn: Listener<T>) => () => void; set: (v: T) => void },
	firstValue: T,
	secondValue: T,
): Promise<void> {
	const { vi, expect } = await import('vitest')

	const listener = vi.fn()

	const unsub = instance.subscribe(listener)

	instance.set(firstValue)
	expect(listener).toHaveBeenCalledTimes(1)

	unsub()

	instance.set(secondValue)
	expect(listener).toHaveBeenCalledTimes(1)
}
