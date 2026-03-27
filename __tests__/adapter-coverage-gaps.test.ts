// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withSync } from '../src/adapters/sync.js'
import {
	connectReduxDevTools,
	disableDevTools,
	disableLogger,
	disconnectReduxDevTools,
	enableDevTools,
	enableLogger,
	isReduxDevToolsConnected,
} from '../src/devtools/index.js'
import { logChange, logDestroy, logReset } from '../src/devtools/logger.js'
import { configure, state } from '../src/index.js'
import { MockBroadcastChannel, makeStorage } from './helpers.js'

// ---------------------------------------------------------------------------
// 1. StorageEvent handler (storage.ts lines 125-131)
// ---------------------------------------------------------------------------

describe('StorageEvent handler', () => {
	it('updates value when a matching StorageEvent fires', () => {
		const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>()
		const storage = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		Object.defineProperty(globalThis, 'sessionStorage', {
			value: makeStorage(),
			configurable: true,
		})

		Object.defineProperty(globalThis, 'window', {
			value: {
				addEventListener(event: string, handler: (...args: unknown[]) => void) {
					if (!eventListeners.has(event)) {
						eventListeners.set(event, new Set())
					}
					eventListeners.get(event)?.add(handler)
				},
				removeEventListener(event: string, handler: (...args: unknown[]) => void) {
					eventListeners.get(event)?.delete(handler)
				},
			},
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

		const s = state('storage-event-test', { default: 0, scope: 'local' })

		const listener = vi.fn()

		s.subscribe(listener)

		// Simulate another tab writing to localStorage
		storage.setItem('storage-event-test', '42')

		// Dispatch a StorageEvent with matching storageArea and key
		const storageHandlers = eventListeners.get('storage')
		expect(storageHandlers).toBeDefined()
		expect(storageHandlers?.size).toBeGreaterThan(0)

		for (const handler of storageHandlers ?? []) {
			handler({
				storageArea: storage,
				key: 'storage-event-test',
			})
		}

		expect(listener).toHaveBeenCalled()
		expect(s.get()).toBe(42)

		s.destroy()
	})

	it('ignores StorageEvent with non-matching key', () => {
		const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>()
		const storage = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: storage,
			configurable: true,
		})

		Object.defineProperty(globalThis, 'window', {
			value: {
				addEventListener(event: string, handler: (...args: unknown[]) => void) {
					if (!eventListeners.has(event)) {
						eventListeners.set(event, new Set())
					}
					eventListeners.get(event)?.add(handler)
				},
				removeEventListener(event: string, handler: (...args: unknown[]) => void) {
					eventListeners.get(event)?.delete(handler)
				},
			},
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

		const s = state('storage-event-ignore', { default: 0, scope: 'local' })

		const listener = vi.fn()

		s.subscribe(listener)

		for (const handler of eventListeners.get('storage') ?? []) {
			handler({
				storageArea: storage,
				key: 'some-other-key',
			})
		}

		expect(listener).not.toHaveBeenCalled()

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 2. Sync error handling (sync.ts lines 66-71)
// ---------------------------------------------------------------------------

describe('sync error handling on incoming message', () => {
	beforeEach(() => {
		MockBroadcastChannel.clear()

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: MockBroadcastChannel,
			configurable: true,
			writable: true,
		})

		Object.defineProperty(globalThis, 'window', {
			value: { addEventListener: () => {}, removeEventListener: () => {} },
			configurable: true,
			writable: true,
		})
	})

	it('reports SyncError when adapter.set throws on incoming sync message', () => {
		const onError = vi.fn()
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		configure({ onError, logLevel: 'error' })

		// Create a base adapter whose set() throws
		const RESOLVED = Promise.resolve()

		const throwingAdapter = {
			ready: RESOLVED,
			get: () => 0,
			set: () => {
				throw new Error('adapter write failed')
			},
			subscribe: () => () => {},
			destroy: () => {},
		}

		// Wrap with sync — this creates a BroadcastChannel
		const synced = withSync(throwingAdapter, 'sync-throw-key', 'local')

		// Find the channel and trigger onmessage directly
		const channels = MockBroadcastChannel.channels.get('state:sync-throw-key')
		expect(channels).toBeDefined()

		for (const ch of channels ?? []) {
			if (ch.onmessage) {
				ch.onmessage({ data: { value: 99 } })
			}
		}

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'sync-throw-key',
				scope: 'local',
			}),
		)
		expect(errorSpy).toHaveBeenCalled()

		synced.destroy?.()
		errorSpy.mockRestore()
		configure({ onError: undefined, logLevel: undefined })
	})
})

// ---------------------------------------------------------------------------
// 3. URL scope unavailable (url.ts line 14)
// ---------------------------------------------------------------------------

describe('URL scope unavailability', () => {
	it('throws when window is undefined', () => {
		// In Node environment, window should not be defined by default
		// Remove window if it was set by a previous test
		const hadWindow = 'window' in globalThis

		if (hadWindow) {
			Object.defineProperty(globalThis, 'window', {
				value: undefined,
				configurable: true,
				writable: true,
			})
		}

		expect(() => {
			state('url-no-window', { default: '', scope: 'url' })
		}).toThrow('[gjendje] URL scope is not available in this environment.')

		if (hadWindow) {
			// Restore for later tests
			Object.defineProperty(globalThis, 'window', {
				value: { addEventListener: () => {}, removeEventListener: () => {} },
				configurable: true,
				writable: true,
			})
		}
	})
})

// ---------------------------------------------------------------------------
// 4. popstate handler (url.ts lines 100-104)
// ---------------------------------------------------------------------------

describe('URL popstate handler', () => {
	it('updates value when popstate event fires', () => {
		const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>()

		const location = { pathname: '/app', search: '', hash: '' }

		Object.defineProperty(globalThis, 'window', {
			value: {
				location,
				history: {
					pushState(_: unknown, __: string, url: string) {
						const parsed = new URL(url, 'http://localhost')
						location.pathname = parsed.pathname
						location.search = parsed.search
						location.hash = parsed.hash
					},
				},
				addEventListener(event: string, handler: (...args: unknown[]) => void) {
					if (!eventListeners.has(event)) {
						eventListeners.set(event, new Set())
					}
					eventListeners.get(event)?.add(handler)
				},
				removeEventListener(event: string, handler: (...args: unknown[]) => void) {
					eventListeners.get(event)?.delete(handler)
				},
			},
			configurable: true,
			writable: true,
		})

		const s = state('url-popstate', { default: 1, scope: 'url' })

		const listener = vi.fn()

		s.subscribe(listener)

		// Set a value to put something in the URL
		s.set(42)
		expect(listener).toHaveBeenCalledTimes(1)

		// Simulate browser back navigation — change URL and fire popstate
		location.search = '?url-popstate=99'

		const popstateHandlers = eventListeners.get('popstate')
		expect(popstateHandlers).toBeDefined()

		for (const handler of popstateHandlers ?? []) {
			handler()
		}

		expect(listener).toHaveBeenCalledTimes(2)
		expect(s.get()).toBe(99)

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 5. getExtension returns undefined (redux-devtools.ts line 67)
// ---------------------------------------------------------------------------

describe('Redux DevTools getExtension returns undefined', () => {
	afterEach(() => {
		disconnectReduxDevTools()
	})

	it('connectReduxDevTools no-ops when extension is not installed', () => {
		// Ensure __REDUX_DEVTOOLS_EXTENSION__ is not defined
		Object.defineProperty(globalThis, '__REDUX_DEVTOOLS_EXTENSION__', {
			value: undefined,
			configurable: true,
			writable: true,
		})

		const disconnect = connectReduxDevTools()

		expect(isReduxDevToolsConnected()).toBe(false)

		// Should return a no-op function
		disconnect()
	})
})

// ---------------------------------------------------------------------------
// 6. Logger collapsed option (logger.ts line 56)
// ---------------------------------------------------------------------------

describe('Logger collapsed option', () => {
	afterEach(() => {
		disableLogger()
	})

	it('uses console.group when collapsed is false', () => {
		const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {})
		const groupCollapsedSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {})
		const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

		enableLogger({ collapsed: false })

		// Trigger a log entry with type 'set' (which uses grouping)
		logChange('test-key', 'memory', 'new', 'old')

		expect(groupSpy).toHaveBeenCalled()
		expect(groupCollapsedSpy).not.toHaveBeenCalled()

		groupSpy.mockRestore()
		groupCollapsedSpy.mockRestore()
		groupEndSpy.mockRestore()
		logSpy.mockRestore()
	})

	it('uses console.groupCollapsed when collapsed is true (default)', () => {
		const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {})
		const groupCollapsedSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {})
		const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

		enableLogger()

		logChange('test-key', 'memory', 'new', 'old')

		expect(groupCollapsedSpy).toHaveBeenCalled()
		expect(groupSpy).not.toHaveBeenCalled()

		groupSpy.mockRestore()
		groupCollapsedSpy.mockRestore()
		groupEndSpy.mockRestore()
		logSpy.mockRestore()
	})
})

// ---------------------------------------------------------------------------
// 7. logReset filter mismatch (logger.ts line 170)
// ---------------------------------------------------------------------------

describe('Logger filter — logReset', () => {
	afterEach(() => {
		disableLogger()
	})

	it('skips logging when filter excludes the key on reset', () => {
		const customLogger = vi.fn()

		enableLogger({
			filter: (key) => key.startsWith('allowed-'),
			logger: customLogger,
		})

		// This should be filtered out (key does not start with 'allowed-')
		logReset('excluded-key', 'memory', 'prev-value')

		expect(customLogger).not.toHaveBeenCalled()

		// This should pass the filter
		logReset('allowed-key', 'memory', 'prev-value')

		expect(customLogger).toHaveBeenCalledTimes(1)
	})
})

// ---------------------------------------------------------------------------
// 8. logDestroy filter mismatch (logger.ts line 188)
// ---------------------------------------------------------------------------

describe('Logger filter — logDestroy', () => {
	afterEach(() => {
		disableLogger()
	})

	it('skips logging when filter excludes the key on destroy', () => {
		const customLogger = vi.fn()

		enableLogger({
			filter: (key) => key.startsWith('allowed-'),
			logger: customLogger,
		})

		// This should be filtered out
		logDestroy('excluded-key', 'memory')

		expect(customLogger).not.toHaveBeenCalled()

		// This should pass the filter
		logDestroy('allowed-key', 'memory')

		expect(customLogger).toHaveBeenCalledTimes(1)
	})
})

// ---------------------------------------------------------------------------
// 9. enableDevTools without name (devtools/index.ts line 195)
// ---------------------------------------------------------------------------

describe('enableDevTools without name', () => {
	afterEach(() => {
		disableDevTools()

		Object.defineProperty(globalThis, '__REDUX_DEVTOOLS_EXTENSION__', {
			value: undefined,
			configurable: true,
			writable: true,
		})

		configure({
			onChange: undefined,
			onReset: undefined,
			onRegister: undefined,
			onDestroy: undefined,
		})
	})

	it('calls connectReduxDevTools with undefined when no name provided', () => {
		const instance = {
			init: vi.fn(),
			send: vi.fn(),
			subscribe: vi.fn(() => () => {}),
		}

		const mockExtension = {
			connect: vi.fn(() => instance),
		}

		Object.defineProperty(globalThis, '__REDUX_DEVTOOLS_EXTENSION__', {
			value: mockExtension,
			configurable: true,
			writable: true,
		})

		enableDevTools()

		// connectReduxDevTools should have been called, and the extension.connect
		// should have been called with the default name 'gjendje'
		expect(mockExtension.connect).toHaveBeenCalledWith(expect.objectContaining({ name: 'gjendje' }))
	})

	it('passes custom name when provided', () => {
		const instance = {
			init: vi.fn(),
			send: vi.fn(),
			subscribe: vi.fn(() => () => {}),
		}

		const mockExtension = {
			connect: vi.fn(() => instance),
		}

		Object.defineProperty(globalThis, '__REDUX_DEVTOOLS_EXTENSION__', {
			value: mockExtension,
			configurable: true,
			writable: true,
		})

		enableDevTools({ name: 'My App' })

		expect(mockExtension.connect).toHaveBeenCalledWith(expect.objectContaining({ name: 'My App' }))
	})
})

// ---------------------------------------------------------------------------
// 10. hadUserWrite during bucket init (bucket.ts line 198)
// ---------------------------------------------------------------------------

describe('bucket — hadUserWrite during init', () => {
	it('migrates user-written value into bucket storage after init', async () => {
		const bucketStorage = makeStorage()

		const mockBucket = {
			localStorage: async () => bucketStorage,
		}

		const mockManager = {
			open: vi.fn().mockResolvedValue(mockBucket),
		}

		Object.defineProperty(globalThis, 'navigator', {
			value: { storageBuckets: mockManager },
			configurable: true,
			writable: true,
		})

		const fallback = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: fallback,
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

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: class {
				onmessage = null
				postMessage() {}
				close() {}
			},
			configurable: true,
		})

		const s = state('bkt-user-write', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		// Write before bucket opens — this makes hadUserWrite = true
		s.set('dark')

		expect(s.get()).toBe('dark')

		// Now let the bucket init complete
		await s.ready

		// The bucket storage should now have the user-written value
		expect(bucketStorage.getItem('bkt-user-write')).toBe('"dark"')

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// 11. Stored value differs from default after bucket opens (bucket.ts 214-216)
// ---------------------------------------------------------------------------

describe('bucket — stored value differs from default after open', () => {
	it('notifies subscribers when bucket has different stored value', async () => {
		const bucketStorage = makeStorage()

		// Pre-populate bucket storage with a value different from default
		bucketStorage.setItem('bkt-stored-diff', '"dark"')

		const mockBucket = {
			localStorage: async () => bucketStorage,
		}

		const mockManager = {
			open: vi.fn().mockResolvedValue(mockBucket),
		}

		Object.defineProperty(globalThis, 'navigator', {
			value: { storageBuckets: mockManager },
			configurable: true,
			writable: true,
		})

		const fallback = makeStorage()

		Object.defineProperty(globalThis, 'localStorage', {
			value: fallback,
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

		Object.defineProperty(globalThis, 'BroadcastChannel', {
			value: class {
				onmessage = null
				postMessage() {}
				close() {}
			},
			configurable: true,
		})

		const s = state('bkt-stored-diff', {
			default: 'light',
			scope: 'bucket',
			bucket: { name: 'test-bucket' },
		})

		const listener = vi.fn()

		s.subscribe(listener)

		// Before ready, the value comes from fallback (which has default)
		expect(s.get()).toBe('light')

		// After ready, bucket storage has 'dark' — should notify
		await s.ready

		expect(listener).toHaveBeenCalled()
		expect(s.get()).toBe('dark')

		s.destroy()
	})
})
