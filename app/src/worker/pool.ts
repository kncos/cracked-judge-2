export interface PoolOptions<T> {
  /** The async task — called again after each settlement if not stopping. */
  worker: (id?: number) => Promise<T>;
  concurrency?: number;
  /** Once this returns true, no new workers are spawned and the pool drains. */
  shouldStop: () => boolean;
  onResult?: (result: T) => void;
  onError?: (error: unknown) => void;
}

export async function runPool<T>({
  worker,
  concurrency = 16,
  shouldStop,
  onResult,
  onError,
}: PoolOptions<T>): Promise<void> {
  const active = new Set<Promise<void>>();

  const spawn = (id: number): void => {
    if (shouldStop()) return; // drain mode — don't replace

    const task: Promise<void> = worker(id)
      .then((result) => onResult?.(result))
      .catch((error) => onError?.(error))
      .finally(() => {
        active.delete(task);
        spawn(id); // self-replacing: no-op once shouldStop() is true
      });

    active.add(task);
  };

  // Seed the pool
  for (let i = 0; i < concurrency; i++) {
    spawn(i);
  }

  // Drain: wait for all active tasks to settle
  while (active.size > 0) {
    await Promise.race(active);
  }
}
