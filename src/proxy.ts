/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  StdioServerTransport,
  StreamableHTTPClientTransport,
  type JSONRPCMessage,
  type RequestId,
} from './third_party/index.js';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getProtocolVersion(message: JSONRPCMessage): string | undefined {
  if (!isJSONRPCResultResponse(message)) {
    return undefined;
  }

  const result: unknown = message.result;
  if (
    result === null ||
    typeof result !== 'object' ||
    !('protocolVersion' in result)
  ) {
    return undefined;
  }

  const protocolVersion = result.protocolVersion;
  return typeof protocolVersion === 'string' ? protocolVersion : undefined;
}
const INITIALIZATION_CLOSE_WAIT_MS = 1_000;

/**
 * Runs a transparent JSON-RPC bridge from process stdio to a Streamable HTTP
 * MCP endpoint. The two transports remain deliberately unwrapped: request
 * IDs, capabilities, roots traffic, notifications, tool results and errors
 * all pass through unchanged.
 */
export async function runStdioProxy(serverUrl: URL): Promise<void> {
  const stdioTransport = new StdioServerTransport();
  let initializedNotificationComplete = false;
  const httpTransport = new StreamableHTTPClientTransport(serverUrl);
  const initializeRequestIds = new Set<RequestId>();
  let initializationComplete = false;
  let initializeSendPending = false;
  let remoteSendChain = Promise.resolve();

  let closing = false;
  let closePromise: Promise<void> | undefined;
  let doneSettled = false;
  const doneResolvers = Promise.withResolvers<void>();
  const done = doneResolvers.promise;

  const stdin = process.stdin;
  function onStdinEnd(): void {
    void closeBridge(undefined, true);
  }
  function onStdinClose(): void {
    void closeBridge(undefined, true);
  }

  function closeBridge(
    error: Error | undefined,
    terminateSession: boolean,
  ): Promise<void> {
    if (closePromise !== undefined) {
      return closePromise;
    }

    closing = true;
    closePromise = (async () => {
      const cleanupErrors: Error[] = [];
      if (terminateSession && initializeSendPending) {
        const initializeWait = Promise.withResolvers<void>();
        const initializeTimeout = setTimeout(
          initializeWait.resolve,
          INITIALIZATION_CLOSE_WAIT_MS,
        );
        try {
          await Promise.race([remoteSendChain, initializeWait.promise]);
        } finally {
          clearTimeout(initializeTimeout);
        }
      }

      if (terminateSession) {
        try {
          await httpTransport.terminateSession();
        } catch (cleanupError) {
          cleanupErrors.push(toError(cleanupError));
        }
      }

      try {
        await httpTransport.close();
      } catch (cleanupError) {
        cleanupErrors.push(toError(cleanupError));
      }

      try {
        await stdioTransport.close();
      } catch (cleanupError) {
        cleanupErrors.push(toError(cleanupError));
      }

      stdin.off('end', onStdinEnd);
      stdin.off('close', onStdinClose);

      for (const cleanupError of cleanupErrors) {
        console.error(`MCP stdio proxy cleanup error: ${cleanupError.message}`);
      }

      if (doneSettled) {
        return;
      }
      doneSettled = true;
      if (error === undefined) {
        doneResolvers.resolve();
      } else {
        doneResolvers.reject(error);
      }
    })();

    return closePromise;
  }

  const fail = (side: string, error: unknown): void => {
    if (closing) {
      return;
    }

    const normalizedError = toError(error);
    console.error(`MCP stdio proxy ${side} error: ${normalizedError.message}`);
    void closeBridge(normalizedError, true);
  };

  let localSendChain = Promise.resolve();
  const sendToStdio = (message: JSONRPCMessage): void => {
    if (closing) {
      return;
    }

    const nextSend = localSendChain.then(async () => {
      if (!closing) {
        await stdioTransport.send(message);
      }
    });
    localSendChain = nextSend.catch(error => {
      fail('stdio', error);
    });
  };

  const sendToHTTP = (message: JSONRPCMessage): void => {
    const isInitializeRequest =
      isJSONRPCRequest(message) && message.method === 'initialize';
    const isInitializedNotification =
      isJSONRPCNotification(message) &&
      message.method === 'notifications/initialized';
    if (closing && !isInitializeRequest) {
      return;
    }
    if (isInitializeRequest) {
      initializeSendPending = true;
    }

    const nextSend = remoteSendChain.then(() => {
      if (closing && !isInitializeRequest) {
        return;
      }

      const sendPromise = httpTransport.send(message);
      if (isInitializeRequest) {
        return sendPromise.then(
          () => {
            initializeSendPending = false;
          },
          error => {
            initializeSendPending = false;
            throw error;
          },
        );
      }
      if (isInitializedNotification) {
        return sendPromise.then(() => {
          if (initializationComplete) {
            initializedNotificationComplete = true;
          }
        });
      }
      if (initializationComplete && initializedNotificationComplete) {
        void sendPromise.catch(error => {
          fail('HTTP', error);
        });
        return;
      }
      return sendPromise;
    });
    remoteSendChain = nextSend.catch(error => {
      fail('HTTP', error);
    });
  };

  stdioTransport.onmessage = message => {
    if (isJSONRPCRequest(message) && message.method === 'initialize') {
      initializeRequestIds.add(message.id);
    }
    sendToHTTP(message);
  };
  stdioTransport.onerror = error => {
    fail('stdio', error);
  };
  stdioTransport.onclose = () => {
    if (!closing) {
      void closeBridge(undefined, true);
    }
  };

  httpTransport.onmessage = message => {
    if (
      isJSONRPCResultResponse(message) &&
      initializeRequestIds.delete(message.id)
    ) {
      const protocolVersion = getProtocolVersion(message);
      if (protocolVersion !== undefined) {
        httpTransport.setProtocolVersion(protocolVersion);
        initializationComplete = true;
      }
    }
    sendToStdio(message);
  };
  httpTransport.onerror = error => {
    fail('HTTP', error);
  };
  httpTransport.onclose = () => {
    if (!closing) {
      void closeBridge(undefined, false);
    }
  };

  stdin.once('end', onStdinEnd);
  stdin.once('close', onStdinClose);

  try {
    await Promise.all([stdioTransport.start(), httpTransport.start()]);
  } catch (error) {
    const normalizedError = toError(error);
    fail('startup', normalizedError);
    await closeBridge(normalizedError, true);
    await done;
  }

  await done;
}
