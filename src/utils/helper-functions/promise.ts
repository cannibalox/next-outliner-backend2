export const createPromise = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

export type PromiseWithResolve<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

export class PromiseLock {
  private locked: boolean = false;
  private waitingResolvers: Array<() => void> = [];

  // Acquire the lock
  acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        // Lock is available, acquire it immediately
        this.locked = true;
        resolve();
      } else {
        // Lock is not available, queue the resolver
        this.waitingResolvers.push(resolve);
      }
    });
  }

  // Release the lock
  release(): void {
    if (this.waitingResolvers.length > 0) {
      // There are waiting tasks, resolve the next one
      const nextResolver = this.waitingResolvers.shift();
      if (nextResolver) {
        nextResolver();
      }
    } else {
      // No waiting tasks, unlock
      this.locked = false;
    }
  }

  // Execute a function with the lock
  async withLock<T>(
    fn: () => Promise<T>,
    onAcquire?: () => void,
    onRelease?: () => void,
  ): Promise<T> {
    await this.acquire();
    try {
      onAcquire?.();
      return await fn();
    } finally {
      onRelease?.();
      this.release();
    }
  }
}

export const createPromiseLock = () => {
  return new PromiseLock();
};
