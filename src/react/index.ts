import { useCallback, useEffect, useState as useReactState, useSyncExternalStore } from 'react'
import type { BucketOptions, CollectionInstance, StateInstance, StateOptions } from '../index.js'
import { collection, state } from '../index.js'

// ---------------------------------------------------------------------------
// useStore — primary hook
//
// Returns [value, setter] just like React's useState, but scoped and
// persistent. The same key + scope returns the same instance everywhere —
// safe to call from multiple components simultaneously.
//
// For bucket scope, the hook starts with the default value and updates
// automatically once the bucket has initialized.
//
// ```tsx
// const [theme, setTheme] = useStore('theme', {
//   default: 'light',
//   scope: 'local',
// })
//
// // With storage bucket — isolated, expirable storage
// const [prefs, setPrefs] = useStore('prefs', {
//   default: { theme: 'light' },
//   scope: 'bucket',
//   bucket: { name: 'user-prefs', expires: '30d', persisted: true },
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
// useStateInstance — access the full instance
//
// Use when you need peek(), watch(), reset(), ready, or want to pass
// the instance to child components or utility functions.
// ---------------------------------------------------------------------------

export function useStateInstance<T>(key: string, options: StateOptions<T>): StateInstance<T> {
	const instance = state(key, options)

	useSyncExternalStore(
		useCallback((onStoreChange) => instance.subscribe(onStoreChange), [instance]),
		() => instance.get(),
		() => options.default,
	)

	return instance
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
// useWatch — subscribe to a specific key within object state
//
// Only triggers a re-render when the watched key changes, not on every
// update to the parent object.
//
// ```tsx
// const theme = useWatch(prefsState, 'theme')
// // re-renders only when prefs.theme changes
// ```
// ---------------------------------------------------------------------------

export function useWatch<T extends object, K extends keyof T>(
	instance: StateInstance<T>,
	key: K,
): T[K] {
	const getSnapshot = useCallback(() => instance.get()[key], [instance, key])

	return useSyncExternalStore(
		useCallback(
			(onStoreChange) => {
				// biome-ignore lint/suspicious/noExplicitAny: conditional keyof type doesn't narrow here
				return (instance.watch as any)(key, onStoreChange)
			},
			[instance, key],
		),
		getSnapshot,
	)
}

// ---------------------------------------------------------------------------
// useReady — resolves to true once an async scope (e.g. bucket) is ready
//
// Useful for showing loading states while a bucket initializes.
//
// ```tsx
// const isReady = useReady(prefsState)
//
// if (!isReady) return <Skeleton />
// ```
// ---------------------------------------------------------------------------

export function useReady(instance: StateInstance<unknown>): boolean {
	const [isReady, setIsReady] = useReactState(false)

	useEffect(() => {
		let cancelled = false

		instance.ready
			.then(() => {
				if (!cancelled) setIsReady(true)
			})
			.catch(() => {})

		return () => {
			cancelled = true
		}
	}, [instance])

	return isReady
}

// ---------------------------------------------------------------------------
// useSettled — resolves to true once the most recent write has persisted
//
// ```tsx
// const isSettled = useSettled(prefsState)
// ```
// ---------------------------------------------------------------------------

export function useSettled(instance: StateInstance<unknown>): boolean {
	const [isSettled, setIsSettled] = useReactState(false)

	useEffect(() => {
		let cancelled = false

		setIsSettled(false)

		instance.settled
			.then(() => {
				if (!cancelled) setIsSettled(true)
			})
			.catch(() => {})

		return () => {
			cancelled = true
		}
	}, [instance])

	return isSettled
}

// ---------------------------------------------------------------------------
// useHydrated — resolves to true once SSR hydration is complete
//
// ```tsx
// const isHydrated = useHydrated(themeState)
//
// if (!isHydrated) return <Skeleton />
// ```
// ---------------------------------------------------------------------------

export function useHydrated(instance: StateInstance<unknown>): boolean {
	const [isHydrated, setIsHydrated] = useReactState(false)

	useEffect(() => {
		let cancelled = false

		instance.hydrated
			.then(() => {
				if (!cancelled) setIsHydrated(true)
			})
			.catch(() => {})

		return () => {
			cancelled = true
		}
	}, [instance])

	return isHydrated
}

// ---------------------------------------------------------------------------
// useBucket — open a named storage bucket and get state bound to it
//
// A convenience hook that combines useStore with bucket scope, making
// the bucket options co-located with the component that needs them.
//
// Returns [value, setter, isReady] — isReady is false until the bucket
// has initialized and real stored values are available.
//
// ```tsx
// const [prefs, setPrefs, isReady] = useBucket('prefs', {
//   default: { theme: 'light', fontSize: 14 },
//   bucket: { name: 'user-prefs', expires: '30d', persisted: true },
// })
//
// if (!isReady) return <Skeleton />
// ```
// ---------------------------------------------------------------------------

export function useBucket<T>(
	key: string,
	options: Omit<StateOptions<T>, 'scope'> & { bucket: BucketOptions },
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
	const mergedOptions = { ...options, scope: 'bucket' as const }

	// state() returns the same instance for the same key+scope via the registry
	const instance = state(key, mergedOptions)

	const [value, set] = useStore(key, mergedOptions)

	const isReady = useReady(instance as StateInstance<unknown>)

	return [value, set, isReady]
}

// ---------------------------------------------------------------------------
// useCollection — reactive array state with mutation methods
//
// Returns the full CollectionInstance so add, remove, update etc. are
// all directly available. Re-renders when the array changes.
//
// ```tsx
// const todos = useCollection('todos', {
//   default: [] as Todo[],
//   scope: 'local',
// })
//
// todos.add({ id: '1', text: 'hello', done: false })
// todos.remove((t) => t.done)
// todos.get()  // Todo[]
// ```
// ---------------------------------------------------------------------------

export function useCollection<T>(key: string, options: StateOptions<T[]>): CollectionInstance<T> {
	const col = collection(key, options)

	useSyncExternalStore(
		useCallback((onStoreChange) => col.subscribe(onStoreChange), [col]),
		() => col.get(),
		() => options.default,
	)

	return col
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
	BucketOptions,
	ReadonlyInstance,
	Scope,
	StateInstance,
	StateOptions,
} from '../index.js'
export { batch, collection, computed, effect, state, withServerSession } from '../index.js'
