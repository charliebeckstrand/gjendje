declare module 'react' {
	// biome-ignore lint/suspicious/noExplicitAny: matches React's own useCallback signature
	export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: unknown[]): T

	export function useSyncExternalStore<T>(
		subscribe: (onStoreChange: () => void) => () => void,
		getSnapshot: () => T,
		getServerSnapshot?: () => T,
	): T

	export function useState<T>(
		initialState: T | (() => T),
	): [T, (value: T | ((prev: T) => T)) => void]

	export function useEffect(effect: () => undefined | (() => void), deps?: unknown[]): void

	export function useRef<T>(initialValue: T): { current: T }
	export function useRef<T>(initialValue: T | null): { current: T | null }
}
