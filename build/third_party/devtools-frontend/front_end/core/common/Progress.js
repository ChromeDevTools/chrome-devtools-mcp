// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class Progress {
    totalWork = 0;
    worked = 0;
    title;
    canceled = false;
    done = false;
}
export class CompositeProgress {
    parent;
    #children;
    #childrenDone;
    constructor(parent) {
        this.parent = parent;
        this.#children = [];
        this.#childrenDone = 0;
        this.parent.totalWork = 1;
        this.parent.worked = 0;
    }
    childDone() {
        if (++this.#childrenDone !== this.#children.length) {
            return;
        }
        this.parent.done = true;
    }
    createSubProgress(weight) {
        const child = new SubProgress(this, weight);
        this.#children.push(child);
        return child;
    }
    update() {
        let totalWeights = 0;
        let done = 0;
        for (let i = 0; i < this.#children.length; ++i) {
            const child = this.#children[i];
            if (child.totalWork) {
                done += child.weight * child.worked / child.totalWork;
            }
            totalWeights += child.weight;
        }
        this.parent.worked = done / totalWeights;
    }
}
export class SubProgress {
    #composite;
    #weight;
    #worked;
    #totalWork;
    constructor(composite, weight) {
        this.#composite = composite;
        this.#weight = weight || 1;
        this.#worked = 0;
        this.#totalWork = 0;
    }
    get canceled() {
        return this.#composite.parent.canceled;
    }
    set title(title) {
        this.#composite.parent.title = title;
    }
    set done(done) {
        if (!done) {
            return;
        }
        this.worked = this.#totalWork;
        this.#composite.childDone();
    }
    set totalWork(totalWork) {
        this.#totalWork = totalWork;
        this.#composite.update();
    }
    set worked(worked) {
        this.#worked = worked;
        this.#composite.update();
    }
    get weight() {
        return this.#weight;
    }
    get worked() {
        return this.#worked;
    }
    get totalWork() {
        return this.#totalWork;
    }
}
export class ProgressProxy {
    #delegate;
    #doneCallback;
    #updateCallback;
    constructor(delegate, doneCallback, updateCallback) {
        this.#delegate = delegate;
        this.#doneCallback = doneCallback;
        this.#updateCallback = updateCallback;
    }
    get canceled() {
        return this.#delegate ? this.#delegate.canceled : false;
    }
    set title(title) {
        if (this.#delegate) {
            this.#delegate.title = title;
        }
        if (this.#updateCallback) {
            this.#updateCallback();
        }
    }
    get title() {
        return this.#delegate?.title ?? '';
    }
    set done(done) {
        if (this.#delegate) {
            this.#delegate.done = done;
        }
        if (done && this.#doneCallback) {
            this.#doneCallback();
        }
    }
    get done() {
        return this.#delegate ? this.#delegate.done : false;
    }
    set totalWork(totalWork) {
        if (this.#delegate) {
            this.#delegate.totalWork = totalWork;
        }
        if (this.#updateCallback) {
            this.#updateCallback();
        }
    }
    get totalWork() {
        return this.#delegate ? this.#delegate.totalWork : 0;
    }
    set worked(worked) {
        if (this.#delegate) {
            this.#delegate.worked = worked;
        }
        if (this.#updateCallback) {
            this.#updateCallback?.();
        }
    }
    get worked() {
        return this.#delegate ? this.#delegate.worked : 0;
    }
}
//# sourceMappingURL=Progress.js.map