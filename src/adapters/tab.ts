import type { Adapter, StateOptions } from '../types.js'
import { createStorageAdapter } from './storage.js'

export function createTabAdapter<T>(key: string, options: StateOptions<T>): Adapter<T> {
	if (typeof sessionStorage === 'undefined') {
		throw new Error(
			'[state] sessionStorage is not available. Use ssr: true or scope: "render" for server environments.',
		)
	}

	return createStorageAdapter(sessionStorage, key, options)
}
