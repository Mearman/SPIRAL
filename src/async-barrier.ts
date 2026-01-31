// SPIRAL Async Barrier
// Fork-join synchronization primitive for async parallel execution

export class AsyncBarrier {
	private count: number;
	private waiting: (() => void)[] = [];
	private releaseInProgress = false;

	constructor(count: number) {
		if (count <= 0) {
			throw new Error("Barrier count must be positive");
		}
		this.count = count;
	}

	async wait(): Promise<void> {
		this.count--;

		if (this.count === 0) {
			// Last task to arrive - release all waiting tasks in FIFO order
			if (!this.releaseInProgress) {
				this.releaseInProgress = true;
				// Release all waiters in FIFO order
				const waiters = [...this.waiting];
				this.waiting = [];
				for (const waiter of waiters) {
					waiter();
				}
				this.releaseInProgress = false;
			}
		} else {
			// Wait for the last task to arrive
			return new Promise<void>((resolve) => {
				this.waiting.push(resolve);
			});
		}
	}

	reset(count: number): void {
		if (count <= 0) {
			throw new Error("Barrier count must be positive");
		}
		this.count = count;
		this.waiting = [];
		this.releaseInProgress = false;
	}
}
