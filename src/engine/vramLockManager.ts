export interface QueuedVramTask {
  taskId: string;
  vramRequired: number;
  resolve: () => void;
  reject: (reason?: Error) => void;
  queuedAt: number;
}

export interface ActiveVramLock {
  taskId: string;
  vramRequired: number;
  acquiredAt: number;
}

/**
 * Resource lock manager for background task queueing with a hard capacity ceiling
 * of 64GB VRAM (matching M1 Max capacity).
 */
export class VramLockManager {
  private readonly capacity: number;
  private activeVram: number = 0;
  private activeLocks: Map<string, ActiveVramLock> = new Map();
  private queue: QueuedVramTask[] = [];

  constructor(capacityGB: number = 64) {
    this.capacity = capacityGB;
  }

  /**
   * Returns the hard capacity ceiling in GB (default: 64).
   */
  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Returns total active VRAM in GB currently allocated to running tasks.
   */
  public getActiveVram(): number {
    return this.activeVram;
  }

  /**
   * Returns available VRAM headroom in GB.
   */
  public getAvailableVram(): number {
    return Math.max(0, this.capacity - this.activeVram);
  }

  /**
   * Returns number of tasks currently blocked in queue waiting for VRAM.
   */
  public getQueuedCount(): number {
    return this.queue.length;
  }

  /**
   * Returns list of task IDs currently holding active VRAM locks.
   */
  public getActiveTaskIds(): string[] {
    return Array.from(this.activeLocks.keys());
  }

  /**
   * Returns true if the specified taskId currently holds an active VRAM lock.
   */
  public isLocked(taskId: string): boolean {
    return this.activeLocks.has(taskId);
  }

  /**
   * Returns snapshot array of active locks.
   */
  public getActiveLocks(): ActiveVramLock[] {
    return Array.from(this.activeLocks.values());
  }

  /**
   * Returns snapshot of queued task details.
   */
  public getQueuedTasks(): Array<{ taskId: string; vramRequired: number; queuedAt: number }> {
    return this.queue.map(q => ({
      taskId: q.taskId,
      vramRequired: q.vramRequired,
      queuedAt: q.queuedAt,
    }));
  }

  /**
   * Acquires a VRAM lock for the given taskId and VRAM amount.
   * Blocks in queue if total active VRAM + task VRAM > 64GB until headroom becomes available.
   */
  public async acquire(taskId: string, vramRequired: number): Promise<void> {
    if (vramRequired <= 0) {
      throw new Error(`Invalid VRAM requirement (${vramRequired}GB). Must be greater than 0.`);
    }

    if (vramRequired > this.capacity) {
      throw new Error(
        `Task '${taskId}' requires ${vramRequired}GB VRAM, which exceeds maximum capacity (${this.capacity}GB).`
      );
    }

    if (this.activeLocks.has(taskId)) {
      throw new Error(`Task '${taskId}' has already acquired a VRAM lock.`);
    }

    // Check if headroom is available AND no prior tasks are waiting ahead in the FIFO queue
    if (this.queue.length === 0 && this.activeVram + vramRequired <= this.capacity) {
      this.grantLock(taskId, vramRequired);
      return;
    }

    // Otherwise, block in queue
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        taskId,
        vramRequired,
        resolve,
        reject,
        queuedAt: Date.now(),
      });
    });
  }

  /**
   * Releases VRAM lock for the specified taskId and processes queued tasks.
   */
  public release(taskId: string, vramRequired?: number): void {
    const lock = this.activeLocks.get(taskId);
    if (!lock) {
      // If task was in queue waiting, cancel its lock request
      const qIndex = this.queue.findIndex(item => item.taskId === taskId);
      if (qIndex !== -1) {
        const item = this.queue.splice(qIndex, 1)[0];
        item.reject(new Error(`VRAM lock request for task '${taskId}' was cancelled.`));
      }
      return;
    }

    const releasedAmount = vramRequired ?? lock.vramRequired;
    this.activeLocks.delete(taskId);
    this.activeVram = Math.max(0, this.activeVram - releasedAmount);

    this.processQueue();
  }

  /**
   * Helper to grant lock to task.
   */
  private grantLock(taskId: string, vramRequired: number): void {
    this.activeLocks.set(taskId, {
      taskId,
      vramRequired,
      acquiredAt: Date.now(),
    });
    this.activeVram += vramRequired;
  }

  /**
   * Processes queue in strict FIFO order as long as headroom allows.
   */
  private processQueue(): void {
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (this.activeVram + head.vramRequired <= this.capacity) {
        this.queue.shift();
        this.grantLock(head.taskId, head.vramRequired);
        head.resolve();
      } else {
        // Not enough headroom for the head of queue
        break;
      }
    }
  }

  /**
   * Resets internal state, rejecting queued lock requests.
   */
  public reset(): void {
    this.activeVram = 0;
    this.activeLocks.clear();
    for (const q of this.queue) {
      q.reject(new Error('VramLockManager reset.'));
    }
    this.queue = [];
  }
}

export const defaultVramLockManager = new VramLockManager(64);
