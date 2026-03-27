import { getRegistry } from '../registry.js'
import type { Scope } from '../types.js'

// ---------------------------------------------------------------------------
// Redux DevTools Extension types
// ---------------------------------------------------------------------------

interface DevToolsAction {
	type: string
	key: string
	scope: Scope
	value?: unknown
	previousValue?: unknown
}

interface DevToolsMessage {
	type: string
	state?: string
	payload?: { type: string; index?: number; actionId?: number }
}

interface DevToolsInstance {
	init(state: Record<string, unknown>): void
	send(action: DevToolsAction, state: Record<string, unknown>): void
	subscribe(listener: (message: DevToolsMessage) => void): (() => void) | undefined
}

interface DevToolsExtension {
	connect(options?: { name?: string; features?: Record<string, boolean> }): DevToolsInstance
}

declare global {
	var __REDUX_DEVTOOLS_EXTENSION__: DevToolsExtension | undefined
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let devTools: DevToolsInstance | undefined

let unsubscribeDevTools: (() => void) | undefined

let connected = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGlobalState(): Record<string, unknown> {
	const result: Record<string, unknown> = {}

	for (const instance of getRegistry().values()) {
		if (!instance.isDestroyed) {
			result[instance.key] = instance.get()
		}
	}

	return result
}

function getExtension(): DevToolsExtension | undefined {
	if (typeof globalThis !== 'undefined') {
		return globalThis.__REDUX_DEVTOOLS_EXTENSION__
	}

	return undefined
}

// ---------------------------------------------------------------------------
// Time-travel support
// ---------------------------------------------------------------------------

function handleDevToolsMessage(message: DevToolsMessage): void {
	if (message.type !== 'DISPATCH') return

	const payloadType = message.payload?.type

	if (payloadType === 'JUMP_TO_STATE' || payloadType === 'JUMP_TO_ACTION') {
		if (!message.state) return

		let parsed: Record<string, unknown>

		try {
			parsed = JSON.parse(message.state) as Record<string, unknown>
		} catch {
			return
		}

		const registry = getRegistry()

		for (const instance of registry.values()) {
			if (instance.isDestroyed) continue

			const key = instance.key

			if (key in parsed) {
				instance.set(parsed[key])
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect to the Redux DevTools Extension.
 *
 * Once connected, all state changes (set, patch, reset) are dispatched as
 * actions to the DevTools timeline. Time-travel debugging is supported:
 * jumping to a previous state in DevTools replays values into gjendje instances.
 *
 * Returns a disconnect function. Call it to stop sending events.
 *
 * ```ts
 * import { connectReduxDevTools } from 'gjendje/devtools'
 *
 * const disconnect = connectReduxDevTools({ name: 'My App' })
 *
 * // Later, to disconnect:
 * disconnect()
 * ```
 *
 * No-ops silently when the Redux DevTools Extension is not installed.
 */
export function connectReduxDevTools(options?: { name?: string }): () => void {
	if (connected) {
		return disconnectReduxDevTools
	}

	const extension = getExtension()

	if (!extension) return () => {}

	devTools = extension.connect({
		name: options?.name ?? 'gjendje',
		features: { jump: true, skip: false, reorder: false },
	})

	devTools.init(getGlobalState())

	unsubscribeDevTools = devTools.subscribe(handleDevToolsMessage) ?? undefined

	connected = true

	return disconnectReduxDevTools
}

/**
 * Disconnect from the Redux DevTools Extension.
 * Stops dispatching actions and listening for time-travel events.
 */
export function disconnectReduxDevTools(): void {
	unsubscribeDevTools?.()
	unsubscribeDevTools = undefined
	devTools = undefined
	connected = false
}

/**
 * Whether the Redux DevTools adapter is currently connected.
 */
export function isReduxDevToolsConnected(): boolean {
	return connected
}

// ---------------------------------------------------------------------------
// Integration hooks — called from the devtools orchestrator
// ---------------------------------------------------------------------------

function safeSend(action: DevToolsAction): void {
	if (!devTools) return

	try {
		devTools.send(action, getGlobalState())
	} catch (err) {
		console.error('[gjendje] Redux DevTools send failed:', err)
	}
}

/** @internal */
export function dispatchChange(
	key: string,
	scope: Scope,
	value: unknown,
	previousValue: unknown,
): void {
	safeSend({ type: 'set', key, scope, value, previousValue })
}

/** @internal */
export function dispatchReset(key: string, scope: Scope, previousValue: unknown): void {
	safeSend({ type: 'reset', key, scope, previousValue })
}

/** @internal */
export function dispatchRegister(key: string, scope: Scope): void {
	safeSend({ type: 'register', key, scope })
}

/** @internal */
export function dispatchDestroy(key: string, scope: Scope): void {
	safeSend({ type: 'destroy', key, scope })
}
