type Notification = () => void

let depth = 0

const queue = new Set<Notification>()

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
		queue.add(fn)

		return
	}

	fn()
}

function flush(): void {
	while (queue.size > 0) {
		const pending = new Set(queue)

		queue.clear()

		depth++

		try {
			for (const notification of pending) {
				notification()
			}
		} finally {
			depth--
		}
	}
}
