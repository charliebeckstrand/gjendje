import type { BaseInstance, ReadonlyInstance } from './types.js'

/** Runtime check for writable instances (has a real `set` function, not shadowed by `readonly`). */
export function isWritable<T>(instance: ReadonlyInstance<T>): instance is BaseInstance<T> {
	return typeof (instance as BaseInstance<T>).set === 'function'
}
