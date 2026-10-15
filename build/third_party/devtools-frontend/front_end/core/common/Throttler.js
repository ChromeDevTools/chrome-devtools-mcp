// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class Throttler {
    #timeout;
    #isRunningProcess;
    #asSoonAsPossible;
    #process;
    #lastCompleteTime;
    #scheduler = Promise.withResolvers();
    #processTimeout;
    constructor(timeout) {
        this.#timeout = timeout;
        this.#isRunningProcess = false;
        this.#asSoonAsPossible = false;
        this.#process = null;
        this.#lastCompleteTime = 0;
    }
    #processCompleted() {
        this.#lastCompleteTime = this.#getTime();
        this.#isRunningProcess = false;
        if (this.#process) {
            this.#schedule(false);
        }
    }
    get process() {
        return this.#process;
    }
    get processCompleted() {
        return this.#process ? this.#scheduler.promise : null;
    }
    #onTimeout() {
        this.#processTimeout = undefined;
        this.#asSoonAsPossible = false;
        this.#isRunningProcess = true;
        void Promise.resolve()
            .then(this.#process)
            .catch(console.error.bind(console))
            .then(this.#processCompleted.bind(this))
            .then(this.#scheduler.resolve);
        this.#scheduler = Promise.withResolvers();
        this.#process = null;
    }
    async schedule(process, scheduling = "Default" /* Scheduling.DEFAULT */) {
        // Deliberately skip previous #process.
        this.#process = process;
        // Run the first scheduled task instantly.
        const hasScheduledTasks = Boolean(this.#processTimeout) || this.#isRunningProcess;
        const okToFire = this.#getTime() - this.#lastCompleteTime > this.#timeout;
        const asSoonAsPossible = scheduling === "AsSoonAsPossible" /* Scheduling.AS_SOON_AS_POSSIBLE */ ||
            (scheduling === "Default" /* Scheduling.DEFAULT */ && !hasScheduledTasks && okToFire);
        const forceTimerUpdate = asSoonAsPossible && !this.#asSoonAsPossible;
        this.#asSoonAsPossible = this.#asSoonAsPossible || asSoonAsPossible;
        this.#schedule(forceTimerUpdate);
        await this.#scheduler.promise;
    }
    #schedule(forceTimerUpdate) {
        if (this.#isRunningProcess) {
            return;
        }
        if (this.#processTimeout && !forceTimerUpdate) {
            return;
        }
        clearTimeout(this.#processTimeout);
        const timeout = this.#asSoonAsPossible ? 0 : this.#timeout;
        this.#processTimeout = setTimeout(this.#onTimeout.bind(this), timeout);
    }
    #getTime() {
        return performance.now();
    }
}
//# sourceMappingURL=Throttler.js.map