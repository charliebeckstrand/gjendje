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
		// Snapshot to a temporary array to avoid iterator invalidation,
		// using a pre-allocated array to reduce GC pressure.
		const size = queue.size

		if (size > flushBuf.length) {
			flushBuf = new Array(size)
		}

		let i = 0

		for (const notification of queue) {
			flushBuf[i++] = notification
		}

		queue.clear()

		depth++

		try {
			for (let j = 0; j < size; j++) {
				flushBuf[j]!()
			}
		} finally {
			depth--

			// Clear references to avoid retaining closures
			for (let j = 0; j < size; j++) {
				flushBuf[j] = undefined as unknown as Notification
			}
		}
	}
}

// Pre-allocated flush buffer — grows as needed, never shrinks
let flushBuf: Notification[] = new Array(16)
