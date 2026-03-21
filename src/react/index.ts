import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { StateInstance, StateOptions } from '../index.js'
import { state } from '../index.js'

// ---------------------------------------------------------------------------
// useStore — primary hook
//
// Returns [value, setter] just like React's useState, but scoped and
// persistent. The same key + scope returns the same instance everywhere —
// safe to call from multiple components simultaneously.
//
// ```tsx
// const [theme, setTheme] = useStore('theme', {
//   default: 'light',
//   scope: 'local',
// })
// ```
// ---------------------------------------------------------------------------

export function useStore<T>(
	key: string,
	options: StateOptions<T>,
): [T, (value: T | ((prev: T) => T)) => void] {
	const instance = state(key, options)

	const value = useSyncExternalStore(
		useCallback((onStoreChange) => instance.subscribe(onStoreChange), [instance]),
		() => instance.get(),
		() => options.default,
	)

	const set = useCallback(
		(valueOrUpdater: T | ((prev: T) => T)) => {
			instance.set(valueOrUpdater)
		},
		[instance],
	)

	return [value, set]
}

// ---------------------------------------------------------------------------
// useSharedState — consume a module-level instance
//
// The recommended pattern for app-wide shared state. Define once at
// module level, consume anywhere.
//
// ```ts
// // state.ts
// export const themeState = state('theme', {
//   default: 'light',
//   scope: 'local',
// })
//
// // ThemeToggle.tsx
// const [theme, setTheme] = useSharedState(themeState)
// ```
// ---------------------------------------------------------------------------

export function useSharedState<T>(
	instance: StateInstance<T>,
): [T, (value: T | ((prev: T) => T)) => void] {
	const value = useSyncExternalStore(
		useCallback((onStoreChange) => instance.subscribe(onStoreChange), [instance]),
		() => instance.get(),
		() => instance.get(),
	)

	const set = useCallback(
		(valueOrUpdater: T | ((prev: T) => T)) => {
			instance.set(valueOrUpdater)
		},
		[instance],
	)

	return [value, set]
}

// ---------------------------------------------------------------------------
// useSelector — derived value with equality-gated re-renders
//
// Selects a slice of state and only re-renders when that slice changes.
// Accepts an optional equality function (defaults to Object.is).
//
// ```tsx
// const theme = useSelector(prefsState, (p) => p.theme)
// // re-renders only when prefs.theme changes
// ```
// ---------------------------------------------------------------------------

export function useSelector<T, S>(
	instance: StateInstance<T>,
	selector: (value: T) => S,
	isEqual: (a: S, b: S) => boolean = Object.is,
): S {
	const selectorRef = useRef(selector)
	const isEqualRef = useRef(isEqual)

	selectorRef.current = selector
	isEqualRef.current = isEqual

	const getSnapshot = useCallback(() => {
		return selectorRef.current(instance.get())
	}, [instance])

	return useSyncExternalStore(
		useCallback(
			(onStoreChange) => {
				let prev = selectorRef.current(instance.get())

				return instance.subscribe(() => {
					const next = selectorRef.current(instance.get())

					if (!isEqualRef.current(prev, next)) {
						prev = next
						onStoreChange()
					}
				})
			},
			[instance],
		),
		getSnapshot,
	)
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
	BaseInstance,
	BucketOptions,
	ComputedInstance,
	Listener,
	ReadonlyInstance,
	Scope,
	StateInstance,
	StateOptions,
	Unsubscribe,
} from '../index.js'
export {
	batch,
	collection,
	computed,
	configure,
	effect,
	shallowEqual,
	snapshot,
	state,
	withHistory,
	withServerSession,
	withWatch,
} from '../index.js'
