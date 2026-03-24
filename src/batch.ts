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

function flush(): void {
	while (queue.length > 0) {
		generation++

		const current = queue

		queue = []

		depth++

		try {
			for (let i = 0; i < current.length; i++) {
				const fn = current[i]

				if (fn) fn()
			}
		} finally {
			depth--
		}
	}
}
