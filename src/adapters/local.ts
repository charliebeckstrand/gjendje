import type { Adapter, StateOptions } from '../types.js'
import { createStorageAdapter } from './storage.js'

export function createLocalAdapter<T>(key: string, options: StateOptions<T>): Adapter<T> {
	if (typeof localStorage === 'undefined') {
		throw new Error(
			'[state] localStorage is not available. Use ssr: true or scope: "server" for server environments.',
		)
	}

	return createStorageAdapter(localStorage, key, options)
}
