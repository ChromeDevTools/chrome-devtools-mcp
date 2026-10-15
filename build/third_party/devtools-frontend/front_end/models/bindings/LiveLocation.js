// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class LiveLocationWithPool {
    #updateDelegate;
    #locationPool;
    #updatePromise;
    constructor(updateDelegate, locationPool) {
        this.#updateDelegate = updateDelegate;
        this.#locationPool = locationPool;
        this.#locationPool.add(this);
        this.#updatePromise = null;
    }
    async update() {
        if (!this.#updateDelegate) {
            return;
        }
        // The following is a basic scheduling algorithm, guaranteeing that
        // {#updateDelegate} is always run atomically. That is, we always
        // wait for an update to finish before we trigger the next run.
        if (this.#updatePromise) {
            await this.#updatePromise.then(() => this.update());
        }
        else {
            this.#updatePromise = this.#updateDelegate(this);
            await this.#updatePromise;
            this.#updatePromise = null;
        }
    }
    async uiLocation() {
        throw new Error('Not implemented');
    }
    dispose() {
        this.#locationPool.delete(this);
        this.#updateDelegate = null;
    }
    isDisposed() {
        return !this.#locationPool.has(this);
    }
}
export class LiveLocationPool {
    #locations;
    constructor() {
        this.#locations = new Set();
    }
    add(location) {
        this.#locations.add(location);
    }
    delete(location) {
        this.#locations.delete(location);
    }
    has(location) {
        return this.#locations.has(location);
    }
    disposeAll() {
        for (const location of this.#locations) {
            location.dispose();
        }
    }
}
//# sourceMappingURL=LiveLocation.js.map