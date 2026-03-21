import { beforeEach, describe, expect, it, vi } from 'vitest'
import { state } from '../src/index.js'
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

		const x = state('sync-warn-render', { default: 0, scope: 'render', sync: true })

		expect(calls.length).toBeGreaterThan(0)
		expect(String(calls[0]?.[0])).toContain('sync: true is ignored for scope "render"')

		x.destroy()
		console.warn = originalWarn
	})

	it('warns for tab scope and does not create BroadcastChannel', () => {
		const originalWarn = console.warn
		const calls: unknown[][] = []

		console.warn = (...args: unknown[]) => {
			calls.push(args)
		}

		const x = state('sync-warn-tab', { default: 0, scope: 'tab', sync: true })

		expect(calls.length).toBeGreaterThan(0)
		expect(String(calls[0]?.[0])).toContain('sync: true is ignored for scope "tab"')

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
