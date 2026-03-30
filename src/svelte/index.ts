import { isWritable } from '../is-writable.js'
import type { BaseInstance, ReadonlyInstance } from '../types.js'

/**
 * Svelte-compatible readable store contract.
 * Structurally compatible with `svelte/store`'s `Readable<T>`.
 */
export interface GjendjeReadable<T> {
	subscribe(run: (value: T) => void): () => void
}

/**
 * Svelte-compatible writable store contract.
 * Structurally compatible with `svelte/store`'s `Writable<T>`.
 */
export interface GjendjeWritable<T> extends GjendjeReadable<T> {
	set(value: T): void
	update(updater: (value: T) => T): void
}

/**
 * Create a Svelte-compatible store from a gjendje state instance.
 *
 * - **Writable instance** → returns a writable store (set, update, subscribe)
 * - **Readonly / computed** → returns a readable store (subscribe only)
 * - **With selector** → returns a readable store holding the selected slice
 */
export function useGjendje<T, U>(
	instance: ReadonlyInstance<T>,
	selector: (value: T) => U,
): GjendjeReadable<U>
export function useGjendje<T>(instance: BaseInstance<T>): GjendjeWritable<T>
export function useGjendje<T>(instance: ReadonlyInstance<T>): GjendjeReadable<T>
export function useGjendje<T>(
	instance: ReadonlyInstance<T>,
	selector?: (value: T) => unknown,
): GjendjeReadable<unknown> | GjendjeWritable<unknown> {
	const w = !selector && isWritable(instance)

	const store: GjendjeReadable<unknown> = {
		subscribe(run: (value: unknown) => void) {
			if (selector) {
				let last: unknown = selector(instance.get())

				run(last)

				return instance.subscribe((next) => {
					const value = selector(next)

					if (!Object.is(value, last)) {
						last = value
						run(value)
					}
				})
			}

			run(instance.get())

			return instance.subscribe(run)
		},
	}

	if (w) {
		return {
			...store,
			set(value: unknown) {
				;(instance as BaseInstance<T>).set(value as T)
			},
			update(updater: (value: unknown) => unknown) {
				;(instance as BaseInstance<T>).set(updater(instance.get()) as T)
			},
		}
	}

	return store
}
