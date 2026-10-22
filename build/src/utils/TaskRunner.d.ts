/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
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
export declare class TaskQueue {
    #private;
    readonly parent?: TaskQueue;
    constructor(hooks: QueueHooks, parent: TaskQueue | undefined);
    /**
     * Schedules a task on this queue. Resolves when no earlier task on a
     * related queue runs, with a guard that holds the queue until it is
     * disposed. Rejects when the queue is disposed while the task waits. A
     * second dispose of the guard throws.
     */
    scheduleTask(): Promise<Disposable>;
    /**
     * Rejects the callers that wait on this queue with `reason`, and rejects
     * every later `scheduleTask()` call. The current holder keeps the queue.
     */
    dispose(reason: Error): void;
    /** True when `other` is this queue, an ancestor, or a descendant. */
    isRelatedTo(other: TaskQueue): boolean;
}
/**
 * Runs every task of the server from one ordered list. Each task names the
 * queue it runs on. A task starts when every earlier task on a related queue
 * has finished. Waiting tasks count, so a waiting task blocks later related
 * tasks and no task starves. `pause()` enters the list ahead of waiting tasks
 * and relates to every queue.
 */
export declare class TaskRunner {
    #private;
    /**
     * Creates a queue. Tasks on the new queue and tasks on `parent` wait for
     * each other. Without `parent`, the queue is a child of the root, so only
     * `pause()` relates to it.
     */
    createQueue(parent?: TaskQueue): TaskQueue;
    /**
     * Stops new tasks on every queue. The pause goes ahead of waiting tasks and
     * resolves when every running task has finished. Disposing the guard
     * resumes the runner.
     */
    pause(): Promise<Disposable>;
}
export {};
