/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type Priority = 'normal' | 'high';

interface Entry {
  queue: TaskQueue;
  priority: Priority;
  running: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

/** The runner methods a queue uses. Not part of the public API. */
interface QueueHooks {
  scheduleTask(queue: TaskQueue): Promise<Disposable>;
  cancel(queue: TaskQueue, reason: Error): void;
}

/**
 * A queue that the {@link TaskRunner} created. Tasks on one queue run one
 * at a time. Tasks on a queue and on its ancestors or descendants also run
 * one at a time. Tasks on unrelated queues run at the same time.
 */
export class TaskQueue {
  readonly parent?: TaskQueue;
  readonly #hooks: QueueHooks;
  #disposed?: Error;

  constructor(hooks: QueueHooks, parent: TaskQueue | undefined) {
    this.#hooks = hooks;
    this.parent = parent;
  }

  /**
   * Schedules a task on this queue. Resolves when no earlier task on a
   * related queue runs, with a guard that holds the queue until it is
   * disposed. Rejects when the queue is disposed while the task waits. A
   * second dispose of the guard throws.
   */
  async scheduleTask(): Promise<Disposable> {
    if (this.#disposed) {
      throw this.#disposed;
    }
    return await this.#hooks.scheduleTask(this);
  }

  /**
   * Rejects the callers that wait on this queue with `reason`, and rejects
   * every later `scheduleTask()` call. The current holder keeps the queue.
   */
  dispose(reason: Error): void {
    this.#disposed = reason;
    this.#hooks.cancel(this, reason);
  }

  /** True when `other` is this queue, an ancestor, or a descendant. */
  isRelatedTo(other: TaskQueue): boolean {
    return this.#isAncestorOrSelf(other) || other.#isAncestorOrSelf(this);
  }

  #isAncestorOrSelf(other: TaskQueue): boolean {
    for (
      let queue: TaskQueue | undefined = other;
      queue;
      queue = queue.parent
    ) {
      if (queue === this) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Runs every task of the server from one ordered list. Each task names the
 * queue it runs on. A task starts when every earlier task on a related queue
 * has finished. Waiting tasks count, so a waiting task blocks later related
 * tasks and no task starves. `pause()` enters the list ahead of waiting tasks
 * and relates to every queue.
 */
export class TaskRunner {
  readonly #hooks: QueueHooks = {
    scheduleTask: queue => this.#scheduleTask(queue),
    cancel: (queue, reason) => this.#cancel(queue, reason),
  };
  readonly #root = new TaskQueue(this.#hooks, undefined);
  #entries: Entry[] = [];

  /**
   * Creates a queue. Tasks on the new queue and tasks on `parent` wait for
   * each other. Without `parent`, the queue is a child of the root, so only
   * `pause()` relates to it.
   */
  createQueue(parent: TaskQueue = this.#root): TaskQueue {
    return new TaskQueue(this.#hooks, parent);
  }

  /**
   * Stops new tasks on every queue. The pause goes ahead of waiting tasks and
   * resolves when every running task has finished. Disposing the guard
   * resumes the runner.
   */
  async pause(): Promise<Disposable> {
    return await this.#scheduleTask(this.#root, 'high');
  }

  async #scheduleTask(
    queue: TaskQueue,
    priority: Priority = 'normal',
  ): Promise<Disposable> {
    const {guard, started} = this.#enter(queue, priority);
    await started;
    return guard;
  }

  #cancel(queue: TaskQueue, reason: Error): void {
    for (const entry of [...this.#entries]) {
      if (entry.queue === queue && !entry.running) {
        this.#leave(entry);
        entry.reject(reason);
      }
    }
  }

  #enter(
    queue: TaskQueue,
    priority: Priority,
  ): {guard: Disposable; started: Promise<void>} {
    const {promise, resolve, reject} = Promise.withResolvers<void>();
    const entry: Entry = {queue, priority, running: false, resolve, reject};
    // A high-priority entry goes before the first waiting normal entry.
    const index =
      priority === 'high'
        ? this.#entries.findIndex(e => !e.running && e.priority === 'normal')
        : -1;
    this.#entries.splice(index === -1 ? this.#entries.length : index, 0, entry);
    this.#schedule();
    return {
      started: promise,
      guard: {
        [Symbol.dispose]: () => {
          this.#leave(entry);
        },
      },
    };
  }

  #leave(entry: Entry): void {
    const index = this.#entries.indexOf(entry);
    if (index === -1) {
      throw new Error('The guard was already disposed.');
    }
    this.#entries.splice(index, 1);
    this.#schedule();
  }

  #schedule(): void {
    for (const [index, entry] of this.#entries.entries()) {
      if (entry.running) {
        continue;
      }
      const blocked = this.#entries
        .slice(0, index)
        .some(earlier => earlier.queue.isRelatedTo(entry.queue));
      if (!blocked) {
        entry.running = true;
        entry.resolve();
      }
    }
  }
}
