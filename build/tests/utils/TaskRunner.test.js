/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import assert from 'node:assert';
import { describe, it } from 'node:test';
import sinon from 'sinon';
import { TaskRunner } from '../../src/utils/TaskRunner.js';
async function settle() {
    await new Promise(resolve => setImmediate(resolve));
}
/** Acquires `queue` and holds it until `finish()` is called. */
function start(queue) {
    const { promise: release, resolve: finish } = Promise.withResolvers();
    const controlled = {
        started: false,
        done: Promise.resolve(),
        finish,
    };
    controlled.done = (async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const guard = __addDisposableResource(env_1, await queue.scheduleTask(), false);
            controlled.started = true;
            await release;
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    })();
    return controlled;
}
function createTree() {
    const runner = new TaskRunner();
    const parent = runner.createQueue();
    const childA = runner.createQueue(parent);
    const childB = runner.createQueue(parent);
    return { runner, parent, childA, childB };
}
describe('TaskRunner', () => {
    it('runs tasks on unrelated queues at the same time', async () => {
        const { childA, childB } = createTree();
        const a = start(childA);
        const b = start(childB);
        await settle();
        assert.strictEqual(a.started, true);
        assert.strictEqual(b.started, true);
        a.finish();
        b.finish();
        await Promise.all([a.done, b.done]);
    });
    it('runs tasks on queues of different roots at the same time', async () => {
        const runner = new TaskRunner();
        const a = start(runner.createQueue());
        const b = start(runner.createQueue());
        await settle();
        assert.strictEqual(a.started, true);
        assert.strictEqual(b.started, true);
        a.finish();
        b.finish();
        await Promise.all([a.done, b.done]);
    });
    it('serializes holders of one queue in FIFO order', async () => {
        const queue = new TaskRunner().createQueue();
        const order = [];
        await Promise.all([1, 2, 3].map(async (id) => {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const guard = __addDisposableResource(env_2, await queue.scheduleTask(), false);
                await settle();
                order.push(id);
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        }));
        assert.deepStrictEqual(order, [1, 2, 3]);
    });
    it('orders by queue, not by task duration', async () => {
        const clock = sinon.useFakeTimers();
        try {
            const runner = new TaskRunner();
            const order = [];
            const run = async (queue, name, ms) => {
                const env_3 = { stack: [], error: void 0, hasError: false };
                try {
                    const guard = __addDisposableResource(env_3, await queue.scheduleTask(), false);
                    await new Promise(resolve => setTimeout(resolve, ms));
                    order.push(name);
                }
                catch (e_3) {
                    env_3.error = e_3;
                    env_3.hasError = true;
                }
                finally {
                    __disposeResources(env_3);
                }
            };
            const shared = runner.createQueue();
            const sameQueue = Promise.all([
                run(shared, 'slow', 300),
                run(shared, 'fast', 100),
            ]);
            await clock.tickAsync(1_000);
            await sameQueue;
            assert.deepStrictEqual(order, ['slow', 'fast']);
            order.length = 0;
            const unrelated = Promise.all([
                run(runner.createQueue(), 'slow', 300),
                run(runner.createQueue(), 'fast', 100),
            ]);
            await clock.tickAsync(1_000);
            await unrelated;
            assert.deepStrictEqual(order, ['fast', 'slow']);
        }
        finally {
            clock.restore();
        }
    });
    it('makes a parent task wait for a running child task', async () => {
        const { parent, childA } = createTree();
        const child = start(childA);
        const parentTask = start(parent);
        await settle();
        assert.strictEqual(parentTask.started, false);
        child.finish();
        await settle();
        assert.strictEqual(parentTask.started, true);
        parentTask.finish();
        await Promise.all([child.done, parentTask.done]);
    });
    it('makes a child task wait for a running parent task', async () => {
        const { parent, childA } = createTree();
        const parentTask = start(parent);
        const child = start(childA);
        await settle();
        assert.strictEqual(child.started, false);
        parentTask.finish();
        await settle();
        assert.strictEqual(child.started, true);
        child.finish();
        await Promise.all([child.done, parentTask.done]);
    });
    it('blocks a later child task behind a waiting parent task', async () => {
        const { parent, childA, childB } = createTree();
        const a = start(childA);
        const parentTask = start(parent);
        const b = start(childB);
        await settle();
        assert.strictEqual(b.started, false);
        a.finish();
        await settle();
        assert.strictEqual(parentTask.started, true);
        assert.strictEqual(b.started, false);
        parentTask.finish();
        await settle();
        assert.strictEqual(b.started, true);
        b.finish();
        await Promise.all([a.done, parentTask.done, b.done]);
    });
    it('throws when a guard is disposed twice', async () => {
        const queue = new TaskRunner().createQueue();
        const guard = await queue.scheduleTask();
        guard[Symbol.dispose]();
        assert.throws(() => guard[Symbol.dispose](), /The guard was already disposed\./);
    });
    it('releases the queue when the holder throws', async () => {
        const queue = new TaskRunner().createQueue();
        await assert.rejects((async () => {
            const env_4 = { stack: [], error: void 0, hasError: false };
            try {
                const guard = __addDisposableResource(env_4, await queue.scheduleTask(), false);
                throw new Error('task failed');
            }
            catch (e_4) {
                env_4.error = e_4;
                env_4.hasError = true;
            }
            finally {
                __disposeResources(env_4);
            }
        })(), /task failed/);
        const next = start(queue);
        await settle();
        assert.strictEqual(next.started, true);
        next.finish();
        await next.done;
    });
    describe('pause', () => {
        it('stops new tasks and resolves after running tasks finish', async () => {
            const { runner, childA, childB } = createTree();
            const running = start(childA);
            await settle();
            let paused = false;
            const pause = runner.pause().then(guard => {
                paused = true;
                return guard;
            });
            const late = start(childB);
            await settle();
            assert.strictEqual(paused, false);
            assert.strictEqual(late.started, false);
            running.finish();
            await running.done;
            const guard = await pause;
            await settle();
            assert.strictEqual(late.started, false);
            guard[Symbol.dispose]();
            await settle();
            assert.strictEqual(late.started, true);
            late.finish();
            await late.done;
        });
        it('goes ahead of waiting tasks', async () => {
            const { runner, childA } = createTree();
            const running = start(childA);
            const waiting = start(childA);
            await settle();
            const pause = runner.pause();
            running.finish();
            const guard = await pause;
            await settle();
            assert.strictEqual(waiting.started, false);
            guard[Symbol.dispose]();
            await settle();
            assert.strictEqual(waiting.started, true);
            waiting.finish();
            await Promise.all([running.done, waiting.done]);
        });
    });
    describe('dispose', () => {
        it('rejects waiting tasks with the reason and keeps the running task', async () => {
            const queue = new TaskRunner().createQueue();
            const running = start(queue);
            const waiting = start(queue);
            await settle();
            queue.dispose(new Error('Page 1 is closed.'));
            await assert.rejects(waiting.done, /Page 1 is closed\./);
            assert.strictEqual(running.started, true);
            running.finish();
            await running.done;
        });
        it('rejects a later scheduleTask()', async () => {
            const queue = new TaskRunner().createQueue();
            queue.dispose(new Error('Page 1 is closed.'));
            await assert.rejects(queue.scheduleTask(), /Page 1 is closed\./);
        });
        it('lets a parent task run after a waiting child task is rejected', async () => {
            const { parent, childA } = createTree();
            const running = start(childA);
            const waiting = start(childA);
            await settle();
            childA.dispose(new Error('closed'));
            await assert.rejects(waiting.done, /closed/);
            running.finish();
            await running.done;
            const parentTask = start(parent);
            await settle();
            assert.strictEqual(parentTask.started, true);
            parentTask.finish();
            await parentTask.done;
        });
    });
});
//# sourceMappingURL=TaskRunner.test.js.map