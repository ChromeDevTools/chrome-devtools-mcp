// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class ObjectWrapper {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners;
    addEventListener(eventType, listener, thisObject) {
        if (!this.listeners) {
            this.listeners = new Map();
        }
        let listenersForEventType = this.listeners.get(eventType);
        if (!listenersForEventType) {
            listenersForEventType = new Set();
            this.listeners.set(eventType, listenersForEventType);
        }
        listenersForEventType.add({ thisObject, listener });
        return { eventTarget: this, eventType, thisObject, listener };
    }
    once(eventType) {
        return new Promise(resolve => {
            const descriptor = this.addEventListener(eventType, event => {
                this.removeEventListener(eventType, descriptor.listener);
                resolve(event.data);
            });
        });
    }
    removeEventListener(eventType, listener, thisObject) {
        const listeners = this.listeners?.get(eventType);
        if (!listeners) {
            return;
        }
        for (const listenerTuple of listeners) {
            if (listenerTuple.listener === listener && listenerTuple.thisObject === thisObject) {
                listenerTuple.disposed = true;
                listeners.delete(listenerTuple);
            }
        }
        if (!listeners.size) {
            this.listeners?.delete(eventType);
        }
    }
    hasEventListeners(eventType) {
        return Boolean(this.listeners?.has(eventType));
    }
    dispatchEventToListeners(eventType, ...[eventData]) {
        const listeners = this.listeners?.get(eventType);
        if (!listeners) {
            return;
        }
        // `eventData` is typed as `Events[T] | undefined`:
        //   - `undefined` when `Events[T]` is void.
        //   - `Events[T]` otherwise.
        // We cast it to `Events[T]` which is the correct type in all instances, as
        // `void` will be cast and used as `undefined`.
        const event = { data: eventData, source: this };
        // Work on a snapshot of the current listeners, callbacks might remove/add
        // new listeners.
        for (const listener of [...listeners]) {
            if (!listener.disposed) {
                try {
                    listener.listener.call(listener.thisObject, event);
                }
                catch (err) {
                    console.error(`Event listener for ${String(eventType)} throw an error:`, err);
                }
            }
        }
    }
}
export function eventMixin(base) {
    return class EventHandling extends base {
        // Note that the weird name is due to TSC disallowing private/protected fields in
        // anonmous exported classes. We use a `__` prefix to prevent clashes with `base`.
        // eslint-disable-next-line @devtools/no-underscored-properties, @typescript-eslint/naming-convention
        __events = new ObjectWrapper();
        addEventListener(eventType, listener, thisObject) {
            return this.__events.addEventListener(eventType, listener, thisObject);
        }
        once(eventType) {
            return this.__events.once(eventType);
        }
        removeEventListener(eventType, listener, thisObject) {
            this.__events.removeEventListener(eventType, listener, thisObject);
        }
        hasEventListeners(eventType) {
            return this.__events.hasEventListeners(eventType);
        }
        dispatchEventToListeners(eventType, ...eventData) {
            this.__events.dispatchEventToListeners(eventType, ...eventData);
            if (typeof this.dispatchDOMEvent === 'function') {
                this.dispatchDOMEvent(new CustomEvent(eventType, { detail: eventData[0] }));
            }
        }
    };
}
//# sourceMappingURL=Object.js.map