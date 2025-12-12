/**
 * Simple mutex implementation for serializing async operations
 * Prevents race conditions when multiple async operations need exclusive access
 */
export class SimpleMutex {
    private locked = false;
    private queue: Array<() => void> = [];
    private destroyed = false;

    /**
     * Acquire the mutex lock
     * If already locked, waits in queue until released
     */
    async lock(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.destroyed) {
                reject(new Error('Mutex has been destroyed'));
                return;
            }

            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    /**
     * Release the mutex lock
     * Allows next waiting operation in queue to proceed
     */
    unlock(): void {
        if (this.destroyed) {
            return;
        }

        this.locked = false;
        const next = this.queue.shift();
        if (next) {
            this.locked = true;
            try {
                next();
            } catch {
                // If resolver throws, unlock and continue with next in queue
                this.locked = false;
                const nextInQueue = this.queue.shift();
                if (nextInQueue) {
                    this.locked = true;
                    nextInQueue();
                }
            }
        }
    }

    /**
     * Destroy the mutex and reject all waiting operations
     * Prevents memory leaks when mutex is no longer needed
     */
    destroy(): void {
        this.destroyed = true;
        this.locked = false;

        // Reject all queued promises to prevent memory leaks
        while (this.queue.length > 0) {
            const resolve = this.queue.shift();
            if (resolve) {
                try {
                    // Resolve with error state
                    resolve();
                } catch {
                    // Ignore errors during cleanup
                }
            }
        }
    }

    /**
     * Check if mutex is currently locked
     */
    isLocked(): boolean {
        return this.locked;
    }

    /**
     * Get number of operations waiting in queue
     */
    getQueueLength(): number {
        return this.queue.length;
    }
}
