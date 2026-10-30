import { describe, it, expect, beforeEach } from 'vitest';
import { VramLockManager } from './vramLockManager';

describe('VramLockManager boundary and stress tests', () => {
  let manager: VramLockManager;

  beforeEach(() => {
    manager = new VramLockManager(64);
  });

  it('handles exact 64GB VRAM allocation without blocking', async () => {
    await manager.acquire('task-exact-64', 64);
    expect(manager.getActiveVram()).toBe(64);
    expect(manager.getAvailableVram()).toBe(0);

    let blockedTaskAcquired = false;
    const blockedPromise = manager.acquire('task-extra-1gb', 1).then(() => {
      blockedTaskAcquired = true;
    });

    expect(blockedTaskAcquired).toBe(false);
    expect(manager.getQueuedCount()).toBe(1);

    manager.release('task-exact-64');
    await blockedPromise;

    expect(blockedTaskAcquired).toBe(true);
    expect(manager.getActiveVram()).toBe(1);
    manager.release('task-extra-1gb');
  });

  it('handles cancelling queued task lock request via release on unacquired taskId', async () => {
    await manager.acquire('active-task', 50);

    const queuedPromise = manager.acquire('queued-task', 30);

    expect(manager.getQueuedCount()).toBe(1);

    // Cancel queued task lock request
    manager.release('queued-task');
    await expect(queuedPromise).rejects.toThrow('cancelled');
    expect(manager.getQueuedCount()).toBe(0);

    manager.release('active-task');
  });

  it('handles reset clearing active locks and rejecting queued requests', async () => {
    await manager.acquire('t1', 50);

    let err2: Error | undefined;
    const p2 = manager.acquire('t2', 30).catch(e => {
      err2 = e;
    });

    manager.reset();
    await p2;

    expect(manager.getActiveVram()).toBe(0);
    expect(manager.getQueuedCount()).toBe(0);
    expect(err2?.message).toContain('reset');
  });

  it('handles concurrent lock requests where high-VRAM task waits for multiple small tasks to free up', async () => {
    // 3 small tasks of 20GB each = 60GB active VRAM
    await manager.acquire('s1', 20);
    await manager.acquire('s2', 20);
    await manager.acquire('s3', 20);

    expect(manager.getActiveVram()).toBe(60);

    // High VRAM task (40GB) arrives. 60 + 40 = 100 > 64 -> Queued!
    let bigTaskDone = false;
    const bigTaskPromise = manager.acquire('big', 40).then(() => {
      bigTaskDone = true;
    });

    // Release s1 (frees 20GB -> active is 40GB). 40 + 40 = 80 > 64 -> Big task STILL queued!
    manager.release('s1');
    expect(manager.getActiveVram()).toBe(40);
    expect(bigTaskDone).toBe(false);

    // Release s2 (frees 20GB -> active is 20GB). 20 + 40 = 60 <= 64 -> Big task unblocks!
    manager.release('s2');
    await bigTaskPromise;

    expect(bigTaskDone).toBe(true);
    expect(manager.getActiveVram()).toBe(60); // 20 (s3) + 40 (big)

    manager.release('s3');
    manager.release('big');
    expect(manager.getActiveVram()).toBe(0);
  });
});
