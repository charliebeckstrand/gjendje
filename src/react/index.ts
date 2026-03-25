import { useSyncExternalStore } from 'react'
import type { BaseInstance, ReadonlyInstance } from '../types.js'

/**
 * Reactive result tuple for writable instances.
 * Mirrors the familiar [value, set, reset] shape of React's useState.
 */
export type UseGjendjeResult<T> = readonly [
	value: T,
	set: (value: T | ((prev: T) => T)) => void,
	reset: () => void,
]

function isWritable<T>(instance: ReadonlyInstance<T>): instance is BaseInstance<T> {
	return typeof (instance as BaseInstance<T>).set === 'function'
}

/**
 * Subscribe to a gjendje state instance in React.
 *
 * - **Writable instance** → returns `[value, set, reset]`
 * - **Readonly / computed** → returns `value`
 * - **With selector** → returns the selected slice
 */
export function useGjendje<T, U>(instance: ReadonlyInstance<T>, selector: (value: T) => U): U
export function useGjendje<T>(instance: BaseInstance<T>): UseGjendjeResult<T>
export function useGjendje<T>(instance: ReadonlyInstance<T>): T
export function useGjendje<T>(
	instance: ReadonlyInstance<T>,
	selector?: (value: T) => unknown,
): unknown {
	const getSnapshot = selector ? () => selector(instance.get()) : () => instance.get()

	const value = useSyncExternalStore(
		(onStoreChange) => instance.subscribe(onStoreChange),
		getSnapshot,
		getSnapshot,
	)

	if (selector) return value

	if (isWritable(instance)) {
		return [value, (v: T | ((prev: T) => T)) => instance.set(v), () => instance.reset()] as const
	}

	return value
}
