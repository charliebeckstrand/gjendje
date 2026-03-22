/**
 * True when running on the server (no window/document).
 */
export function isServer(): boolean {
	return typeof window === 'undefined' || typeof document === 'undefined'
}

/**
 * The browser scopes that require window/localStorage/sessionStorage.
 * These will throw on the server without SSR handling.
 */
export const BROWSER_SCOPES = new Set(['session', 'tab', 'local', 'url', 'bucket'])

/**
 * Runs a callback after the browser has hydrated.
 * On the server this is a no-op and returns an already-resolved promise.
 * On the client it runs after the current microtask queue clears,
 * giving React time to complete its hydration pass.
 *
 * Returns a promise that resolves after the callback has executed.
 */
export function afterHydration(fn: () => void): Promise<void> {
	if (isServer()) return Promise.resolve()

	// Use a microtask + rAF to ensure we're past React's hydration
	return new Promise<void>((resolve) => {
		Promise.resolve().then(() => {
			if (typeof requestAnimationFrame !== 'undefined') {
				requestAnimationFrame(() => {
					fn()
					resolve()
				})
			} else {
				setTimeout(() => {
					fn()
					resolve()
				}, 0)
			}
		})
	})
}
