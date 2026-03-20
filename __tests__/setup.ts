import { afterEach } from 'vitest'
import { getRegistry } from '../src/registry.js'

afterEach(() => {
	// Destroy all registered instances and clear the registry between tests
	// so state from one test never bleeds into another
	for (const instance of getRegistry().values()) {
		instance.destroy()
	}
})
