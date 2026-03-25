import { customRef, onScopeDispose, type Ref } from 'vue'
import { isWritable } from '../is-writable.js'
import type { BaseInstance, ReadonlyInstance } from '../types.js'

/**
 * Subscribe to a gjendje state instance in Vue.
 *
 * Returns a reactive `Ref` that stays in sync with the instance.
 *
 * - **Writable instance** → ref is two-way: read with `.value`, write by assigning to `.value`
 * - **Readonly / computed** → ref is read-only
 * - **With selector** → ref holds the selected slice (read-only)
 */
export function useGjendje<T, U>(
	instance: ReadonlyInstance<T>,
	selector: (value: T) => U,
): Readonly<Ref<U>>
export function useGjendje<T>(instance: BaseInstance<T>): Ref<T>
export function useGjendje<T>(instance: ReadonlyInstance<T>): Readonly<Ref<T>>
export function useGjendje<T>(
	instance: ReadonlyInstance<T>,
	selector?: (value: T) => unknown,
): Ref<unknown> {
	const writable = !selector && isWritable(instance)

	const ref = customRef<unknown>((track, trigger) => {
		let last: unknown = selector ? selector(instance.get()) : instance.get()

		const unsub = instance.subscribe((next) => {
			const value = selector ? selector(next) : next

			if (value !== last) {
				last = value
				trigger()
			}
		})

		onScopeDispose(unsub)

		return {
			get() {
				track()
				return selector ? selector(instance.get()) : instance.get()
			},
			set(value) {
				if (writable) {
					;(instance as BaseInstance<T>).set(value as T)
				}
			},
		}
	})

	return ref
}
