import { useSyncExternalStore } from 'react'
import type { ReadonlyInstance } from '../types.js'

/**
 * Subscribe to a gjendje state instance in React.
 *
 * Returns the current value and re-renders when it changes.
 * Optionally accepts a selector to derive a slice — skips
 * re-renders when the selected value is unchanged (===).
 */
export function useGjendje<T>(instance: ReadonlyInstance<T>): T
export function useGjendje<T, U>(instance: ReadonlyInstance<T>, selector: (value: T) => U): U
export function useGjendje<T>(
	instance: ReadonlyInstance<T>,
	selector?: (value: T) => unknown,
): unknown {
	const getSnapshot = selector ? () => selector(instance.get()) : () => instance.get()

	return useSyncExternalStore(
		(onStoreChange) => instance.subscribe(onStoreChange),
		getSnapshot,
		getSnapshot,
	)
}
