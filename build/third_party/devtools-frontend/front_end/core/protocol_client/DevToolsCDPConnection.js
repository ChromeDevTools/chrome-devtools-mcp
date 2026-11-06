// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { CDPErrorStatus, } from './CDPConnection.js';
import { InspectorBackend, test } from './InspectorBackend.js';
export class DevToolsCDPConnection {
    #transport;
    #lastMessageId = 1;
    #callbacks = new Map();
    #observers = new Set();
    constructor(transport) {
        this.#transport = transport;
        test.sendRawMessage = this.sendRawMessageForTesting.bind(this);
        this.#transport.setOnMessage(this.onMessage.bind(this));
        this.#transport.setOnDisconnect(reason => {
            this.#observers.forEach(observer => observer.onDisconnect(reason));
        });
    }
    observe(observer) {
        this.#observers.add(observer);
    }
    unobserve(observer) {
        this.#observers.delete(observer);
    }
    send(method, params, sessionId) {
        const messageId = ++this.#lastMessageId;
        const messageObject = {
            id: messageId,
            method,
        };
        if (params) {
            messageObject.params = params;
        }
        if (sessionId) {
            messageObject.sessionId = sessionId;
        }
        if (test.dumpProtocol) {
            test.dumpProtocol('frontend: ' + JSON.stringify(messageObject));
        }
        if (test.onMessageSent) {
            const domain = method.split('.')[0];
            const paramsObject = JSON.parse(JSON.stringify(params || {}));
            test.onMessageSent({ domain, method, params: paramsObject, id: messageId, sessionId });
        }
        return new Promise(resolve => {
            this.#callbacks.set(messageId, { resolve, method, sessionId });
            this.#transport.sendRawMessage(JSON.stringify(messageObject));
        });
    }
    resolvePendingCalls(sessionId) {
        for (const { resolve, method, sessionId: callbackSessionId } of this.#callbacks.values()) {
            if (sessionId !== callbackSessionId) {
                continue;
            }
            resolve({
                error: {
                    message: `Session is unregistering, can\'t dispatch pending call to ${method}`,
                    code: CDPErrorStatus.SESSION_NOT_FOUND,
                },
            });
        }
    }
    sendRawMessageForTesting(method, params, callback, sessionId = '') {
        void this.send(method, params, sessionId).then(response => {
            if ('error' in response && response.error) {
                callback?.(response.error, null);
            }
            else if ('result' in response) {
                callback?.(null, response.result);
            }
        });
    }
    onMessage(message) {
        if (test.dumpProtocol) {
            test.dumpProtocol('backend: ' + ((typeof message === 'string') ? message : JSON.stringify(message)));
        }
        if (test.onMessageReceived) {
            const messageObjectCopy = JSON.parse((typeof message === 'string') ? message : JSON.stringify(message));
            test.onMessageReceived(messageObjectCopy);
        }
        const messageObject = ((typeof message === 'string') ? JSON.parse(message) : message);
        if ('id' in messageObject && messageObject.id !== undefined) { // just a response for some request
            const callback = this.#callbacks.get(messageObject.id);
            this.#callbacks.delete(messageObject.id);
            if (!callback) {
                // Ignore messages with unknown IDs, we might see puppeteer proxied messages here.
                return;
            }
            // DevTools inconsistently uses empty string or undefined to denote root
            // session. Generally, empty string should not be used for the root
            // session but to avoid potentially breaking callers we use '' for
            // comparison here if the sessionId is undefined.
            if ((callback.sessionId ?? '') !== (messageObject.sessionId ?? '')) {
                // Ignore messages where ID does not match the session.
                return;
            }
            callback.resolve(messageObject);
        }
        else if ('method' in messageObject) {
            this.#observers.forEach(observer => observer.onEvent(messageObject));
        }
        else {
            InspectorBackend.reportProtocolError('Protocol Error: the message without method', messageObject);
        }
    }
}
//# sourceMappingURL=DevToolsCDPConnection.js.map