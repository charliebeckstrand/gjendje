import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { isWritable } from '../is-writable.js'
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
	// Stabilize the selector ref so getSnapshot identity doesn't change
	// when the caller passes an inline arrow.
	const selectorRef = useRef(selector)
	selectorRef.current = selector

	const subscribe = useCallback(
		(onStoreChange: () => void) => instance.subscribe(onStoreChange),
		[instance],
	)

	const getSnapshot = useCallback(
		() => (selectorRef.current ? selectorRef.current(instance.get()) : instance.get()),
		[instance],
	)

	const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

	const writable = !selector && isWritable(instance)

	const set = useCallback(
		(v: T | ((prev: T) => T)) => (instance as BaseInstance<T>).set(v),
		[instance],
	)

	const reset = useCallback(() => (instance as BaseInstance<T>).reset(), [instance])

	return useMemo(
		() => (writable ? ([value, set, reset] as const) : value),
		[writable, value, set, reset],
	)
}
