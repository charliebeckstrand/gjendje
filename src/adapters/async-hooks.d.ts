// This file provides types for node:async_hooks in environments where
// @types/node is not installed (e.g. CI type-checking without node_modules).
// In a real project with @types/node this file is redundant but harmless.
declare module 'node:async_hooks' {
	export class AsyncLocalStorage<T> {
		getStore(): T | undefined
		run<R>(store: T, callback: () => R): R
		run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R
	}
}
