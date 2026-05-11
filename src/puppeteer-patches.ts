/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './third_party/index.js';

import {
  InternalConnection as Connection,
  type InternalCallbackRegistry as CallbackRegistry,
} from './third_party/index.js';

// 1. Map active command IDs directly to their sessionId
const idToSessionIdMap = new Map<number, string>();

// 2. Intercept _rawSend to map request IDs to their sessionIds
const originalRawSend = Connection.prototype._rawSend;
Connection.prototype._rawSend = function (
  this: Connection,
  ...args: Parameters<typeof Connection.prototype._rawSend>
) {
  const [callbacks, method, params, sessionId, options] = args;

  const wrappedCallbacks = Object.create(callbacks) as CallbackRegistry;
  wrappedCallbacks.create = function (
    label: string,
    timeout: number | undefined,
    request: (id: number) => void,
  ) {
    const wrappedRequest = (id: number) => {
      if (sessionId) {
        idToSessionIdMap.set(id, sessionId);
      }
      return request(id);
    };
    return callbacks.create(label, timeout, wrappedRequest);
  };

  return originalRawSend.call(
    this,
    wrappedCallbacks,
    method,
    params,
    sessionId,
    options,
  );
};

// 3. Repair missing sessionId in Chrome error responses
const onMessageDescriptor = Object.getOwnPropertyDescriptor(
  Connection.prototype,
  'onMessage',
);

if (onMessageDescriptor && typeof onMessageDescriptor.value === 'function') {
  const originalOnMessage = onMessageDescriptor.value;
  const patchedOnMessage = async function (this: Connection, message: string) {
    try {
      const object = JSON.parse(message);
      if (object.id) {
        let modified = false;
        const sessionId = idToSessionIdMap.get(object.id);
        if (sessionId) {
          if (!object.sessionId) {
            object.sessionId = sessionId;
            modified = true;
          }
          idToSessionIdMap.delete(object.id);
        }
        // Clear "session not found" errors coming from dead sessions to prevent uncaught exceptions
        if (
          object.error &&
          (object.error.code === -32001 ||
            object.error.message?.includes('Session with given id not found.'))
        ) {
          delete object.error;
          object.result = {};
          modified = true;
        }
        if (modified) {
          message = JSON.stringify(object);
        }
      }
    } catch {
      // Suppress JSON parsing errors to let the original handler deal with them
    }
    if (typeof originalOnMessage === 'function') {
      return originalOnMessage.call(this, message);
    }
  };

  Object.defineProperty(Connection.prototype, 'onMessage', {
    ...onMessageDescriptor,
    value: patchedOnMessage,
  });
}
