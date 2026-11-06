/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * A queue that the {@link TaskRunner} created. Tasks on one queue run one
 * at a time. Tasks on a queue and on its ancestors or descendants also run
 * one at a time. Tasks on unrelated queues run at the same time.
 */
export class TaskQueue {
    parent;
    #hooks;
    #disposed;
    constructor(hooks, parent) {
        this.#hooks = hooks;
        this.parent = parent;
    }
    /**
     * Schedules a task on this queue. Resolves when no earlier task on a
     * related queue runs, with a guard that holds the queue until it is
     * disposed. Rejects when the queue is disposed while the task waits. A
     * second dispose of the guard throws.
     */
    async scheduleTask() {
        if (this.#disposed) {
            throw this.#disposed;
        }
        return await this.#hooks.scheduleTask(this);
    }
    /**
     * Rejects the callers that wait on this queue with `reason`, and rejects
     * every later `scheduleTask()` call. The current holder keeps the queue.
     */
    dispose(reason) {
        this.#disposed = reason;
        this.#hooks.cancel(this, reason);
    }
    /** True when `other` is this queue, an ancestor, or a descendant. */
    isRelatedTo(other) {
        return this.#isAncestorOrSelf(other) || other.#isAncestorOrSelf(this);
    }
    #isAncestorOrSelf(other) {
        for (let queue = other; queue; queue = queue.parent) {
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
    #hooks = {
        scheduleTask: queue => this.#scheduleTask(queue),
        cancel: (queue, reason) => this.#cancel(queue, reason),
    };
    #root = new TaskQueue(this.#hooks, undefined);
    #entries = [];
    /**
     * Creates a queue. Tasks on the new queue and tasks on `parent` wait for
     * each other. Without `parent`, the queue is a child of the root, so only
     * `pause()` relates to it.
     */
    createQueue(parent = this.#root) {
        return new TaskQueue(this.#hooks, parent);
    }
    /**
     * Stops new tasks on every queue. The pause goes ahead of waiting tasks and
     * resolves when every running task has finished. Disposing the guard
     * resumes the runner.
     */
    async pause() {
        return await this.#scheduleTask(this.#root, 'high');
    }
    async #scheduleTask(queue, priority = 'normal') {
        const { guard, started } = this.#enter(queue, priority);
        await started;
        return guard;
    }
    #cancel(queue, reason) {
        for (const entry of [...this.#entries]) {
            if (entry.queue === queue && !entry.running) {
                this.#leave(entry);
                entry.reject(reason);
            }
        }
    }
    #enter(queue, priority) {
        const { promise, resolve, reject } = Promise.withResolvers();
        const entry = { queue, priority, running: false, resolve, reject };
        // A high-priority entry goes before the first waiting normal entry.
        const index = priority === 'high'
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
    #leave(entry) {
        const index = this.#entries.indexOf(entry);
        if (index === -1) {
            throw new Error('The guard was already disposed.');
        }
        this.#entries.splice(index, 1);
        this.#schedule();
    }
    #schedule() {
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
//# sourceMappingURL=TaskRunner.js.map