import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	connectReduxDevTools,
	disableDevTools,
	disconnectReduxDevTools,
	enableDevTools,
	enableLogger,
	isDevToolsEnabled,
	isLoggerEnabled,
	isReduxDevToolsConnected,
} from '../src/devtools/index.js'
import { configure, state } from '../src/index.js'

// ---------------------------------------------------------------------------
// Mock Redux DevTools Extension
// ---------------------------------------------------------------------------

function createMockDevTools() {
	const actions: Array<{ action: unknown; state: unknown }> = []

	let subscriber: ((message: unknown) => void) | undefined

	const instance = {
		init: vi.fn(),
		send: vi.fn((action: unknown, globalState: unknown) => {
			actions.push({ action, state: globalState })
		}),
		subscribe: vi.fn((listener: (message: unknown) => void) => {
			subscriber = listener

			return () => {
				subscriber = undefined
			}
		}),
	}

	return {
		instance,
		actions,
		connect: vi.fn(() => instance),
		emit(message: unknown) {
			subscriber?.(message)
		},
	}
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
	configure({
		onChange: undefined,
		onReset: undefined,
		onRegister: undefined,
		onDestroy: undefined,
	})

	disableDevTools()

	// biome-ignore lint/suspicious/noExplicitAny: cleaning up test global
	delete (globalThis as any).__REDUX_DEVTOOLS_EXTENSION__
})

afterEach(() => {
	disableDevTools()

	// biome-ignore lint/suspicious/noExplicitAny: cleaning up test global
	delete (globalThis as any).__REDUX_DEVTOOLS_EXTENSION__
})

// ---------------------------------------------------------------------------
// Redux DevTools adapter
// ---------------------------------------------------------------------------

describe('Redux DevTools adapter', () => {
	it('connects to the extension and initializes with current state', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		const s = state('rdx-init', { default: 42 })

		connectReduxDevTools({ name: 'test-app' })

		expect(mock.connect).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-app' }))

		expect(mock.instance.init).toHaveBeenCalledWith(expect.objectContaining({ 'rdx-init': 42 }))

		expect(isReduxDevToolsConnected()).toBe(true)

		disconnectReduxDevTools()

		s.destroy()
	})

	it('dispatches set actions', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		enableDevTools({ logger: false })

		const s = state('rdx-set', { default: 0 })

		s.set(10)

		const setAction = mock.actions.find((a) => (a.action as { type: string }).type === 'set')

		expect(setAction).toBeDefined()

		expect(setAction?.action).toEqual(
			expect.objectContaining({ type: 'set', key: 'rdx-set', value: 10, previousValue: 0 }),
		)

		disableDevTools()

		s.destroy()
	})

	it('dispatches reset actions', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		enableDevTools({ logger: false })

		const s = state('rdx-reset', { default: 'initial' })

		s.set('changed')

		s.reset()

		const resetAction = mock.actions.find((a) => (a.action as { type: string }).type === 'reset')

		expect(resetAction).toBeDefined()

		expect((resetAction?.action as { key: string }).key).toBe('rdx-reset')

		disableDevTools()

		s.destroy()
	})

	it('dispatches register actions for new instances', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		enableDevTools({ logger: false })

		const s = state('rdx-register', { default: 'hello' })

		const registerAction = mock.actions.find(
			(a) => (a.action as { type: string }).type === 'register',
		)

		expect(registerAction).toBeDefined()

		expect((registerAction?.action as { key: string }).key).toBe('rdx-register')

		disableDevTools()

		s.destroy()
	})

	it('dispatches destroy actions', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		enableDevTools({ logger: false })

		const s = state('rdx-destroy', { default: 0 })

		s.destroy()

		const destroyAction = mock.actions.find(
			(a) => (a.action as { type: string }).type === 'destroy',
		)

		expect(destroyAction).toBeDefined()

		expect((destroyAction?.action as { key: string }).key).toBe('rdx-destroy')

		disableDevTools()
	})

	it('supports time-travel via JUMP_TO_STATE', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		const s = state('rdx-jump', { default: 0 })

		enableDevTools({ logger: false })

		s.set(10)

		s.set(20)

		// Simulate time-travel back to value 10
		mock.emit({
			type: 'DISPATCH',
			state: JSON.stringify({ 'rdx-jump': 10 }),
			payload: { type: 'JUMP_TO_STATE' },
		})

		expect(s.get()).toBe(10)

		disableDevTools()

		s.destroy()
	})

	it('supports time-travel via JUMP_TO_ACTION', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		const s = state('rdx-jump-action', { default: 'a' })

		enableDevTools({ logger: false })

		s.set('b')

		s.set('c')

		mock.emit({
			type: 'DISPATCH',
			state: JSON.stringify({ 'rdx-jump-action': 'b' }),
			payload: { type: 'JUMP_TO_ACTION', actionId: 1 },
		})

		expect(s.get()).toBe('b')

		disableDevTools()

		s.destroy()
	})

	it('no-ops when extension is not installed', () => {
		const disconnect = connectReduxDevTools()

		expect(isReduxDevToolsConnected()).toBe(false)

		// Should not throw
		disconnect()
	})

	it('prevents double connection', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		connectReduxDevTools()

		connectReduxDevTools()

		expect(mock.connect).toHaveBeenCalledTimes(1)

		disconnectReduxDevTools()
	})

	it('ignores DISPATCH messages without JUMP payload type', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		const s = state('rdx-ignore', { default: 0 })

		enableDevTools({ logger: false })

		s.set(10)

		// This should not throw or change state
		mock.emit({
			type: 'DISPATCH',
			payload: { type: 'COMMIT' },
		})

		expect(s.get()).toBe(10)

		disableDevTools()

		s.destroy()
	})

	it('ignores invalid JSON in time-travel state', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		const s = state('rdx-badjson', { default: 0 })

		enableDevTools({ logger: false })

		s.set(5)

		mock.emit({
			type: 'DISPATCH',
			state: 'not-valid-json{',
			payload: { type: 'JUMP_TO_STATE' },
		})

		expect(s.get()).toBe(5)

		disableDevTools()

		s.destroy()
	})
})

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

describe('Logger', () => {
	it('logs state changes to the console', () => {
		const groupCollapsed = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {})

		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

		const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {})

		enableDevTools({ reduxDevTools: false })

		const s = state('log-set', { default: 0 })

		s.set(42)

		expect(groupCollapsed).toHaveBeenCalled()

		expect(logSpy).toHaveBeenCalledWith('%cprev', expect.any(String), 0)

		expect(logSpy).toHaveBeenCalledWith('%cnext', expect.any(String), 42)

		expect(groupEnd).toHaveBeenCalled()

		disableDevTools()

		s.destroy()

		groupCollapsed.mockRestore()

		logSpy.mockRestore()

		groupEnd.mockRestore()
	})

	it('supports custom logger function', () => {
		const customLogger = vi.fn()

		enableDevTools({
			reduxDevTools: false,
			loggerOptions: { logger: customLogger },
		})

		const s = state('log-custom', { default: 'hello' })

		s.set('world')

		expect(customLogger).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'set',
				key: 'log-custom',
				value: 'world',
				previousValue: 'hello',
			}),
		)

		disableDevTools()

		s.destroy()
	})

	it('supports filter function', () => {
		const customLogger = vi.fn()

		enableDevTools({
			reduxDevTools: false,
			loggerOptions: {
				logger: customLogger,
				filter: (key) => key.startsWith('filtered-'),
			},
		})

		const s1 = state('filtered-yes', { default: 0 })

		const s2 = state('nope', { default: 0 })

		s1.set(1)

		s2.set(2)

		const setCalls = customLogger.mock.calls.filter(
			(call) => (call[0] as { type: string }).type === 'set',
		)

		expect(setCalls).toHaveLength(1)

		expect(setCalls[0]).toBeDefined()

		expect((setCalls[0]?.[0] as { key: string }).key).toBe('filtered-yes')

		disableDevTools()

		s1.destroy()

		s2.destroy()
	})

	it('logs register and destroy events', () => {
		const customLogger = vi.fn()

		enableDevTools({
			reduxDevTools: false,
			loggerOptions: { logger: customLogger },
		})

		const s = state('log-lifecycle', { default: 0 })

		const registerCall = customLogger.mock.calls.find(
			(call) => (call[0] as { type: string }).type === 'register',
		)

		expect(registerCall).toBeDefined()

		s.destroy()

		const destroyCall = customLogger.mock.calls.find(
			(call) => (call[0] as { type: string }).type === 'destroy',
		)

		expect(destroyCall).toBeDefined()

		disableDevTools()
	})

	it('logs reset events', () => {
		const customLogger = vi.fn()

		enableDevTools({
			reduxDevTools: false,
			loggerOptions: { logger: customLogger },
		})

		const s = state('log-reset', { default: 'default' })

		s.set('changed')

		s.reset()

		const resetCall = customLogger.mock.calls.find(
			(call) => (call[0] as { type: string }).type === 'reset',
		)

		expect(resetCall).toBeDefined()

		expect((resetCall?.[0] as { previousValue: string }).previousValue).toBe('changed')

		disableDevTools()

		s.destroy()
	})

	it('can be enabled and disabled independently', () => {
		const disable = enableLogger()

		expect(isLoggerEnabled()).toBe(true)

		disable()

		expect(isLoggerEnabled()).toBe(false)
	})

	it('uses non-collapsed groups when collapsed: false', () => {
		const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {})

		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

		vi.spyOn(console, 'groupEnd').mockImplementation(() => {})

		enableDevTools({
			reduxDevTools: false,
			loggerOptions: { collapsed: false },
		})

		const s = state('log-uncollapsed', { default: 0 })

		s.set(1)

		expect(groupSpy).toHaveBeenCalled()

		disableDevTools()

		s.destroy()

		groupSpy.mockRestore()

		logSpy.mockRestore()

		vi.spyOn(console, 'groupEnd').mockRestore()
	})
})

// ---------------------------------------------------------------------------
// enableDevTools / disableDevTools orchestrator
// ---------------------------------------------------------------------------

describe('enableDevTools', () => {
	it('returns a disable function', () => {
		const disable = enableDevTools({ reduxDevTools: false, logger: false })

		expect(isDevToolsEnabled()).toBe(true)

		disable()

		expect(isDevToolsEnabled()).toBe(false)
	})

	it('prevents double enable', () => {
		enableDevTools({ reduxDevTools: false, logger: false })

		enableDevTools({ reduxDevTools: false, logger: false })

		expect(isDevToolsEnabled()).toBe(true)

		disableDevTools()

		expect(isDevToolsEnabled()).toBe(false)
	})

	it('chains with existing config callbacks', () => {
		const existingOnChange = vi.fn()

		configure({ onChange: existingOnChange })

		enableDevTools({ reduxDevTools: false, logger: false })

		const s = state('chain-test', { default: 0 })

		s.set(1)

		expect(existingOnChange).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'chain-test', value: 1, previousValue: 0 }),
		)

		disableDevTools()

		s.destroy()
	})

	it('restores original callbacks on disable', () => {
		const originalOnChange = vi.fn()

		configure({ onChange: originalOnChange })

		enableDevTools({ reduxDevTools: false, logger: false })

		disableDevTools()

		const s = state('restore-test', { default: 0 })

		s.set(1)

		// Original callback should still work after disable
		expect(originalOnChange).toHaveBeenCalled()

		s.destroy()

		configure({ onChange: undefined })
	})

	it('enables both Redux DevTools and logger by default', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		const logSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {})

		vi.spyOn(console, 'log').mockImplementation(() => {})

		vi.spyOn(console, 'groupEnd').mockImplementation(() => {})

		enableDevTools()

		expect(isReduxDevToolsConnected()).toBe(true)

		expect(isLoggerEnabled()).toBe(true)

		disableDevTools()

		expect(isReduxDevToolsConnected()).toBe(false)

		expect(isLoggerEnabled()).toBe(false)

		logSpy.mockRestore()

		vi.spyOn(console, 'log').mockRestore()

		vi.spyOn(console, 'groupEnd').mockRestore()
	})

	it('can enable Redux DevTools only', () => {
		const mock = createMockDevTools()

		// biome-ignore lint/suspicious/noExplicitAny: DevTools extension uses untyped global
		;(globalThis as any).__REDUX_DEVTOOLS_EXTENSION__ = mock

		enableDevTools({ logger: false })

		expect(isReduxDevToolsConnected()).toBe(true)

		expect(isLoggerEnabled()).toBe(false)

		disableDevTools()
	})

	it('can enable logger only', () => {
		enableDevTools({ reduxDevTools: false })

		expect(isReduxDevToolsConnected()).toBe(false)

		expect(isLoggerEnabled()).toBe(true)

		disableDevTools()
	})

	it('disable is idempotent', () => {
		enableDevTools({ reduxDevTools: false, logger: false })

		disableDevTools()

		disableDevTools()

		expect(isDevToolsEnabled()).toBe(false)
	})
})
