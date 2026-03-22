import { useCallback, useRef, useSyncExternalStore } from 'react'

import type { ReadonlyInstance, StateInstance } from './types.js'

// ---------------------------------------------------------------------------
// useValue
// ---------------------------------------------------------------------------

/**
 * Subscribe to any gjendje instance and return its current value.
 * Re-renders the component whenever the value changes.
 *
 * Works with every instance type: computed, select, collection,
 * previous, readonly, withHistory, and plain state instances.
 *
 * ```tsx
 * const count = state('count', { default: 0 })
 *
 * function Counter() {
 *   const value = useValue(count)
 *   return <span>{value}</span>
 * }
 * ```
 */
export function useValue<T>(instance: ReadonlyInstance<T>): T {
	return useSyncExternalStore(instance.subscribe, instance.get, instance.get)
}

// ---------------------------------------------------------------------------
// useSelector
// ---------------------------------------------------------------------------

/**
 * Subscribe to a derived slice of an instance. Only re-renders when the
 * selected value changes (compared via `isEqual`, defaulting to `Object.is`).
 *
 * ```tsx
 * const user = state('user', { default: { name: 'Jane', age: 30 } })
 *
 * function Name() {
 *   // Only re-renders when `name` changes — ignores `age` updates
 *   const name = useSelector(user, (u) => u.name)
 *   return <span>{name}</span>
 * }
 * ```
 */
export function useSelector<T, S>(
	instance: ReadonlyInstance<T>,
	selector: (value: T) => S,
	isEqual?: (a: S, b: S) => boolean,
): S {
	const prev = useRef<{ value: S; selector: (value: T) => S } | undefined>(undefined)

	const getSnapshot = useCallback(() => {
		const next = selector(instance.get())

		if (prev.current && prev.current.selector === selector) {
			const equal = isEqual ?? Object.is

			if (equal(prev.current.value, next)) {
				return prev.current.value
			}
		}

		prev.current = { value: next, selector }

		return next
	}, [instance, selector, isEqual])

	return useSyncExternalStore(instance.subscribe, getSnapshot, getSnapshot)
}

// ---------------------------------------------------------------------------
// useWatch
// ---------------------------------------------------------------------------

/**
 * Watch a specific key within an object-valued state instance.
 * Only re-renders when that key's value changes.
 *
 * ```tsx
 * const settings = state('settings', {
 *   default: { theme: 'light', fontSize: 14 },
 * })
 *
 * function ThemeDisplay() {
 *   const theme = useWatch(settings, 'theme')
 *   return <span>{theme}</span>
 * }
 * ```
 */
export function useWatch<T extends object, K extends keyof T>(
	instance: StateInstance<T>,
	key: K,
): T[K] {
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			return instance.watch(
				key as unknown as T extends object ? keyof T : never,
				onStoreChange as never,
			)
		},
		[instance, key],
	)

	const getSnapshot = useCallback(() => {
		return instance.get()[key]
	}, [instance, key])

	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
