import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, state } from '../src/index.js'
import { makeStorage } from './helpers.js'

type MessageHandler = (event: { data: unknown }) => void

class MockBroadcastChannel {
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
}

beforeEach(() => {
	MockBroadcastChannel.channels.clear()

	Object.defineProperty(globalThis, 'BroadcastChannel', {
		value: MockBroadcastChannel,
		configurable: true,
		writable: true,
	})

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
})

describe('sync option', () => {
	it('returns default value', () => {
		const x = state('sync-default', { default: 0, scope: 'local', sync: true })

		expect(x.get()).toBe(0)

		x.destroy()
	})

	it('persists to localStorage', () => {
		const x = state('sync-persist', { default: 0, scope: 'local', sync: true })

		x.set(42)

		expect(localStorage.getItem('sync-persist')).not.toBeNull()

		x.destroy()
	})

	it('broadcasts changes to other tabs via BroadcastChannel', () => {
		const a = state('sync-broadcast', { default: 0, scope: 'local', sync: true })

		const listener = vi.fn()

		a.subscribe(listener)

		// Simulate incoming broadcast from another tab
		const channels = MockBroadcastChannel.channels.get('state:sync-broadcast')
		const channel = channels ? [...channels][0] : undefined

		expect(channel).not.toBeUndefined()

		channel?.onmessage?.({ data: { value: 99 } })

		expect(listener).toHaveBeenCalledWith(99)
		expect(listener).toHaveBeenCalledTimes(1)

		a.destroy()
	})

	it('ignores malformed broadcast messages', () => {
		const a = state('sync-malformed', { default: 0, scope: 'local', sync: true })

		const listener = vi.fn()

		a.subscribe(listener)

		const channels = MockBroadcastChannel.channels.get('state:sync-malformed')
		const channel = channels ? [...channels][0] : undefined

		// Send various malformed messages — none should trigger the listener
		channel?.onmessage?.({ data: null })
		channel?.onmessage?.({ data: 'string' })
		channel?.onmessage?.({ data: 42 })
		channel?.onmessage?.({ data: {} })

		expect(listener).not.toHaveBeenCalled()

		a.destroy()
	})

	it('notifies local subscribers on set', () => {
		const x = state('sync-local-notify', { default: 0, scope: 'local', sync: true })

		const listener = vi.fn()

		x.subscribe(listener)
		x.set(1)

		expect(listener).toHaveBeenCalledWith(1)
		expect(listener).toHaveBeenCalledTimes(1)

		x.destroy()
	})

	it('persists broadcast values with version envelope when versioned', () => {
		const a = state('sync-versioned', {
			default: 0,
			scope: 'local',
			sync: true,
			version: 2,
		})

		// Simulate incoming broadcast from another tab
		const channels = MockBroadcastChannel.channels.get('state:sync-versioned')
		const channel = channels ? [...channels][0] : undefined

		channel?.onmessage?.({ data: { value: 42 } })

		// The value should be stored with the version envelope
		const raw = localStorage.getItem('sync-versioned')

		expect(raw).not.toBeNull()

		const parsed = JSON.parse(raw ?? '')

		expect(parsed).toEqual({ v: 2, data: 42 })

		a.destroy()
	})

	it('cleans up channel on destroy', () => {
		const x = state('sync-cleanup', { default: 0, scope: 'local', sync: true })

		x.destroy()

		const channels = MockBroadcastChannel.channels.get('state:sync-cleanup')

		expect(channels?.size ?? 0).toBe(0)
	})

	it('warns when used with unsupported scopes', () => {
		const originalWarn = console.warn
		const calls: unknown[][] = []

		console.warn = (...args: unknown[]) => {
			calls.push(args)
		}

		const x = state('sync-warn-memory', { default: 0, scope: 'memory', sync: true })

		expect(calls.length).toBeGreaterThan(0)
		expect(String(calls[0]?.[0])).toContain('sync: true is ignored for scope "memory"')

		x.destroy()
		console.warn = originalWarn
	})

	it('warns for tab scope and does not create BroadcastChannel', () => {
		const originalWarn = console.warn
		const calls: unknown[][] = []

		console.warn = (...args: unknown[]) => {
			calls.push(args)
		}

		const x = state('sync-warn-session', { default: 0, scope: 'session', sync: true })

		expect(calls.length).toBeGreaterThan(0)
		expect(String(calls[0]?.[0])).toContain('sync: true is ignored for scope "session"')

		// No BroadcastChannel should be created
		const channels = MockBroadcastChannel.channels.get('state:sync-warn-tab')

		expect(channels).toBeUndefined()

		x.destroy()
		console.warn = originalWarn
	})

	it('does not create BroadcastChannel when sync is false', () => {
		const x = state('sync-off', { default: 0, scope: 'local' })

		const channels = MockBroadcastChannel.channels.get('state:sync-off')

		expect(channels).toBeUndefined()

		x.destroy()
	})
})

// ---------------------------------------------------------------------------
// Sync adapter error handling
// ---------------------------------------------------------------------------

describe('sync error handling', () => {
	beforeEach(() => {
		configure({
			onError: undefined,
			onSync: undefined,
			logLevel: undefined,
		})
	})

	it('gracefully handles BroadcastChannel constructor throwing', () => {
		const onError = vi.fn()

		configure({ onError, logLevel: 'silent' })

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: class {
				constructor() {
					throw new Error('BroadcastChannel blocked')
				}
			},
			configurable: true,
			writable: true,
		})

		const x = state('sync-ctor-err', { default: 0, scope: 'local', sync: true })

		// State still works — just without cross-tab sync
		x.set(42)
		expect(x.get()).toBe(42)

		expect(onError).toHaveBeenCalledWith({
			key: 'sync-ctor-err',
			scope: 'local',
			error: expect.objectContaining({ name: 'SyncError' }),
		})

		x.destroy()
	})

	it('gracefully handles postMessage throwing', () => {
		const onError = vi.fn()

		configure({ onError, logLevel: 'silent' })

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: class {
				onmessage = null

				postMessage() {
					throw new Error('postMessage failed')
				}

				close() {}
			},
			configurable: true,
			writable: true,
		})

		const x = state('sync-post-err', { default: 0, scope: 'local', sync: true })

		// set() should still succeed locally even if broadcast fails
		x.set(99)
		expect(x.get()).toBe(99)

		expect(onError).toHaveBeenCalledWith({
			key: 'sync-post-err',
			scope: 'local',
			error: expect.objectContaining({ name: 'SyncError' }),
		})

		x.destroy()
	})

	it('throwing onSync callback does not crash sync message processing', () => {
		configure({
			onSync: () => {
				throw new Error('onSync boom')
			},
		})

		const a = state('sync-onsync-err', { default: 0, scope: 'local', sync: true })

		const listener = vi.fn()

		a.subscribe(listener)

		const channels = MockBroadcastChannel.channels.get('state:sync-onsync-err')
		const channel = channels ? [...channels][0] : undefined

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		// Simulate incoming broadcast — should not throw
		channel?.onmessage?.({ data: { value: 77 } })

		// Value was applied despite onSync throwing
		expect(listener).toHaveBeenCalledWith(77)

		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining('[gjendje] Config callback threw:'),
			expect.any(Error),
		)

		spy.mockRestore()
		a.destroy()
	})

	it('channel.close() failure does not prevent adapter cleanup', () => {
		let closeThrew = false

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: class {
				onmessage = null

				postMessage() {}

				close() {
					closeThrew = true
					throw new Error('close failed')
				}
			},
			configurable: true,
			writable: true,
		})

		const x = state('sync-close-err', { default: 0, scope: 'local', sync: true })

		// Destroy should not throw even if channel.close() fails
		expect(() => x.destroy()).not.toThrow()
		expect(closeThrew).toBe(true)
		expect(x.isDestroyed).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Sync edge cases
// ---------------------------------------------------------------------------

describe('sync edge cases', () => {
	beforeEach(() => {
		configure({ onError: undefined, onSync: undefined, logLevel: undefined })
	})

	it('silently drops messages received after destroy', () => {
		const a = state('sync-drop-after-destroy', { default: 0, scope: 'local', sync: true })

		const listener = vi.fn()

		a.subscribe(listener)

		const channels = MockBroadcastChannel.channels.get('state:sync-drop-after-destroy')
		const channel = channels ? [...channels][0] : undefined

		expect(channel).not.toBeUndefined()

		a.destroy()

		// Simulate a message arriving after destroy
		channel?.onmessage?.({ data: { value: 99 } })

		expect(listener).not.toHaveBeenCalled()
	})

	it('rejects messages with extra keys beyond value', () => {
		const a = state('sync-extra-keys', { default: 0, scope: 'local', sync: true })

		const listener = vi.fn()

		a.subscribe(listener)

		const channels = MockBroadcastChannel.channels.get('state:sync-extra-keys')
		const channel = channels ? [...channels][0] : undefined

		expect(channel).not.toBeUndefined()

		// Message has { value, extra } — Object.keys length is 2, not 1
		channel?.onmessage?.({ data: { value: 42, extra: 'bad' } })

		expect(listener).not.toHaveBeenCalled()

		a.destroy()
	})

	it('double destroy does not throw', () => {
		const x = state('sync-double-destroy', { default: 0, scope: 'local', sync: true })

		x.destroy()

		expect(() => x.destroy()).not.toThrow()
	})

	it('reports SyncError when adapter.set throws on remote message', () => {
		const onError = vi.fn()

		configure({ onError, logLevel: 'silent' })

		const x = state('sync-set-throw', { default: 0, scope: 'local', sync: true })

		const channels = MockBroadcastChannel.channels.get('state:sync-set-throw')
		const channel = channels ? [...channels][0] : undefined

		expect(channel).not.toBeUndefined()

		// Make localStorage.setItem throw after the state has been created
		vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new Error('storage full')
		})

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

		// Simulate incoming broadcast — adapter.set will throw because setItem throws
		channel?.onmessage?.({ data: { value: 77 } })

		expect(onError).toHaveBeenCalledWith({
			key: 'sync-set-throw',
			scope: 'local',
			error: expect.objectContaining({ name: 'SyncError' }),
		})

		spy.mockRestore()

		x.destroy()
	})

	it('fires onSync callback with source remote on incoming message', () => {
		const onSync = vi.fn()

		configure({ onSync })

		const a = state('sync-onsync-remote', { default: 0, scope: 'local', sync: true })

		const channels = MockBroadcastChannel.channels.get('state:sync-onsync-remote')
		const channel = channels ? [...channels][0] : undefined

		expect(channel).not.toBeUndefined()

		channel?.onmessage?.({ data: { value: 55 } })

		expect(onSync).toHaveBeenCalledWith({
			key: 'sync-onsync-remote',
			scope: 'local',
			value: 55,
			source: 'remote',
		})

		a.destroy()
	})
})
