import { reportError } from './config.js'

type Notification = () => void

let depth = 0

let generation = 0

let queue: Notification[] = []

const lastGen = new WeakMap<Notification, number>()

/**
 * Runs all state updates inside fn as a single batch.
 * Subscribers are notified once after all updates complete,
 * rather than once per individual update.
 *
 * Nested batch() calls are safe — notifications flush only
 * when the outermost batch completes.
 *
 * ```ts
 * batch(() => {
 *   firstName.set('John')
 *   lastName.set('Doe')
 *   age.set(30)
 * })
 * // subscribers fire once, not three times
 * ```
 */
export function batch(fn: () => void): void {
	depth++

	try {
		fn()
	} finally {
		depth--

		if (depth === 0) flush()
	}
}

/**
 * Enqueue a notification to fire after the current batch completes.
 * If not currently batching, fires immediately.
 */
export function notify(fn: Notification): void {
	if (depth > 0) {
		if (lastGen.get(fn) !== generation) {
			lastGen.set(fn, generation)

			queue.push(fn)
		}

		return
	}

	fn()
}

const MAX_FLUSH_ITERATIONS = 100

function flush(): void {
	let iterations = 0

	while (queue.length > 0) {
		if (++iterations > MAX_FLUSH_ITERATIONS) {
			console.error(
				'[gjendje] Batch flush exceeded maximum iterations — possible infinite loop. ' +
					'Delivering remaining notifications once before stopping.',
			)

			// Best-effort delivery: fire each remaining notification exactly once
			// so subscribers see the final state. Any new notifications enqueued
			// during this pass are discarded to guarantee termination.
			const remaining = queue

			queue = []

			for (let i = 0; i < remaining.length; i++) {
				const fn = remaining[i]

				try {
					if (fn) fn()
				} catch (err) {
					console.error('[gjendje] Notification threw during best-effort delivery:', err)
					reportError('batch', 'memory', err)
				}
			}

			queue = []

			break
		}

		generation++

		const current = queue

		queue = []

		depth++

		try {
			for (let i = 0; i < current.length; i++) {
				const fn = current[i]

				try {
					if (fn) fn()
				} catch (err) {
					console.error('[gjendje] Notification threw:', err)

					reportError('batch', 'memory', err)
				}
			}
		} finally {
			depth--
		}
	}
}
