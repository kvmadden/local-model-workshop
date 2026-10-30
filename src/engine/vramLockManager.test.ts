import { describe, it, expect, beforeEach } from 'vitest';
import { VramLockManager, defaultVramLockManager } from './vramLockManager';

describe('VramLockManager — R1 VRAM-Aware Queueing Engine', () => {
  let manager: VramLockManager;

  beforeEach(() => {
    manager = new VramLockManager(64);
  });

  it('initializes with 64GB capacity ceiling matching M1 Max capacity', () => {
    expect(manager.getCapacity()).toBe(64);
    expect(manager.getActiveVram()).toBe(0);
    expect(manager.getAvailableVram()).toBe(64);
    expect(manager.getQueuedCount()).toBe(0);
    expect(manager.getActiveTaskIds()).toEqual([]);
  });

  it('allows single task within capacity ceiling to acquire lock immediately', async () => {
    await manager.acquire('task-small', 16);
    expect(manager.getActiveVram()).toBe(16);
    expect(manager.getAvailableVram()).toBe(48);
    expect(manager.isLocked('task-small')).toBe(true);
    expect(manager.getActiveTaskIds()).toEqual(['task-small']);

    manager.release('task-small');
    expect(manager.getActiveVram()).toBe(0);
    expect(manager.getAvailableVram()).toBe(64);
    expect(manager.isLocked('task-small')).toBe(false);
  });

  it('VERIFICATION: blocks two high-VRAM tasks (40GB each) so they run sequentially without OOM crash', async () => {
    const executionOrder: string[] = [];

    // Task 1 requires 40GB VRAM
    await manager.acquire('task-1-40gb', 40);
    executionOrder.push('task-1-start');
    expect(manager.getActiveVram()).toBe(40);
    expect(manager.getAvailableVram()).toBe(24);

    let task2Acquired = false;

    // Task 2 requires 40GB VRAM. 40GB + 40GB = 80GB > 64GB, so it MUST block in queue.
    const task2Promise = manager.acquire('task-2-40gb', 40).then(() => {
      task2Acquired = true;
      executionOrder.push('task-2-start');
    });

    // Check immediately after calling acquire for task 2: it should NOT have acquired yet.
    expect(task2Acquired).toBe(false);
    expect(manager.getQueuedCount()).toBe(1);
    expect(manager.getActiveVram()).toBe(40);
    expect(executionOrder).toEqual(['task-1-start']);

    // Simulate async execution time for Task 1, then release Task 1
    await new Promise(res => setTimeout(res, 30));
    executionOrder.push('task-1-complete');
    manager.release('task-1-40gb', 40);

    // Wait for Task 2's acquire promise to resolve
    await task2Promise;

    expect(task2Acquired).toBe(true);
    expect(manager.getQueuedCount()).toBe(0);
    expect(manager.getActiveVram()).toBe(40);
    expect(manager.isLocked('task-2-40gb')).toBe(true);
    expect(executionOrder).toEqual([
      'task-1-start',
      'task-1-complete',
      'task-2-start',
    ]);

    // Clean up Task 2
    manager.release('task-2-40gb', 40);
    expect(manager.getActiveVram()).toBe(0);
  });

  it('rejects tasks requesting > 64GB VRAM ceiling directly', async () => {
    await expect(manager.acquire('task-huge', 70)).rejects.toThrow(
      'exceeds maximum capacity (64GB)'
    );
  });

  it('rejects zero or negative VRAM requests', async () => {
    await expect(manager.acquire('task-invalid', 0)).rejects.toThrow(
      'Invalid VRAM requirement'
    );
    await expect(manager.acquire('task-negative', -10)).rejects.toThrow(
      'Invalid VRAM requirement'
    );
  });

  it('rejects duplicate acquire for an active task ID', async () => {
    await manager.acquire('task-dup', 20);
    await expect(manager.acquire('task-dup', 20)).rejects.toThrow(
      "Task 'task-dup' has already acquired a VRAM lock."
    );
    manager.release('task-dup');
  });

  it('processes multiple queued tasks in FIFO order as VRAM frees up', async () => {
    const log: string[] = [];

    // Fill capacity to 50GB
    await manager.acquire('t1', 50);

    // Queue t2 (20GB -> needs 50+20=70GB > 64GB)
    const p2 = manager.acquire('t2', 20).then(() => log.push('t2'));

    // Queue t3 (30GB -> needs 50+30=80GB > 64GB)
    const p3 = manager.acquire('t3', 30).then(() => log.push('t3'));

    expect(manager.getQueuedCount()).toBe(2);

    // Release t1 (50GB free). Head is t2 (20GB), which acquires (20GB active).
    // Tail is t3 (30GB), 20 + 30 = 50GB <= 64GB so t3 also acquires!
    manager.release('t1');
    await Promise.all([p2, p3]);

    expect(log).toEqual(['t2', 't3']);
    expect(manager.getActiveVram()).toBe(50);

    manager.release('t2');
    manager.release('t3');
    expect(manager.getActiveVram()).toBe(0);
  });

  it('exports defaultVramLockManager instance with 64GB capacity', () => {
    expect(defaultVramLockManager.getCapacity()).toBe(64);
  });
});
