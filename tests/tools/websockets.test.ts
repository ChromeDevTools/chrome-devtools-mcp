/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {McpContext} from '../../src/McpContext.js';
import type {McpResponse} from '../../src/McpResponse.js';
import {
  getWebSocketMessage,
  listWebSocketConnections,
  listWebSocketMessages,
} from '../../src/tools/websockets.js';
import {WebSocketConnection} from '../../src/WebSocketCollector.js';
import {serverHooks} from '../server.js';
import {html, waitExecutionFor, withMcpContext} from '../utils.js';

describe('WebSocketConnection retention', () => {
  function textFrame(payload: string) {
    return {opcode: 1, mask: false, payloadData: payload};
  }

  it('drops the oldest messages beyond the message count limit', () => {
    const connection = new WebSocketConnection('ws://example', {
      maxMessages: 3,
      maxPayloadLength: 100,
      maxPayloadTotal: 1000,
    });
    for (let i = 1; i <= 5; i++) {
      connection.addFrame('sent', textFrame(`message ${i}`));
    }
    assert.strictEqual(connection.droppedMessages, 2);
    assert.deepStrictEqual(
      connection.getMessages().map(message => message.id),
      [3, 4, 5],
    );
    assert.strictEqual(connection.getMessage(1), undefined);
    assert.strictEqual(connection.sentCount, 5);
  });

  it('drops the oldest messages beyond the payload budget', () => {
    const connection = new WebSocketConnection('ws://example', {
      maxMessages: 100,
      maxPayloadLength: 100,
      maxPayloadTotal: 25,
    });
    connection.addFrame('sent', textFrame('aaaaaaaaaa'));
    connection.addFrame('sent', textFrame('bbbbbbbbbb'));
    connection.addFrame('sent', textFrame('cccccccccc'));
    assert.strictEqual(connection.droppedMessages, 1);
    assert.deepStrictEqual(
      connection.getMessages().map(message => message.payload[0]),
      ['b', 'c'],
    );
  });

  it('always keeps the newest message even if over budget', () => {
    const connection = new WebSocketConnection('ws://example', {
      maxMessages: 100,
      maxPayloadLength: 100,
      maxPayloadTotal: 10,
    });
    connection.addFrame('received', textFrame('x'.repeat(50)));
    assert.strictEqual(connection.getMessages().length, 1);
    assert.strictEqual(connection.getMessage(1)?.payloadLength, 50);
  });

  it('truncates payloads beyond the per-message cap', () => {
    const connection = new WebSocketConnection('ws://example', {
      maxMessages: 100,
      maxPayloadLength: 5,
      maxPayloadTotal: 1000,
    });
    connection.addFrame('received', textFrame('abcdefghij'));
    const message = connection.getMessage(1);
    assert.strictEqual(message?.payload, 'abcde');
    assert.strictEqual(message.truncated, true);
    assert.strictEqual(message.payloadLength, 10);
  });

  it('ignores control frames', () => {
    const connection = new WebSocketConnection('ws://example');
    connection.addFrame('received', {opcode: 9, mask: false, payloadData: ''});
    connection.addFrame('received', {
      opcode: 10,
      mask: false,
      payloadData: '',
    });
    assert.strictEqual(connection.getMessages().length, 0);
    assert.strictEqual(connection.receivedCount, 0);
  });
});

describe('websockets', () => {
  const server = serverHooks();

  function setupRoutes() {
    server.addHtmlRoute('/', html`<h1>ws test</h1>`);
    server.addWebSocketEchoRoute('/ws');
  }

  function webSocketUrl(): string {
    return `${server.baseUrl.replace('http://', 'ws://')}/ws`;
  }

  async function openWebSocket(context: McpContext): Promise<void> {
    const page = context.getSelectedMcpPage().pptrPage;
    await page.goto(server.getRoute('/'));
    await page.evaluate(`new Promise((resolve, reject) => {
      const ws = new WebSocket('${webSocketUrl()}');
      window.__testWs = ws;
      ws.onopen = () => resolve('open');
      ws.onerror = () => reject(new Error('WebSocket failed to connect'));
    })`);
  }

  async function sendAndAwaitEcho(
    context: McpContext,
    text: string,
  ): Promise<unknown> {
    const page = context.getSelectedMcpPage().pptrPage;
    return await page.evaluate(`new Promise(resolve => {
      window.__testWs.onmessage = e => resolve(e.data);
      window.__testWs.send(${JSON.stringify(text)});
    })`);
  }

  async function callToolUntil(
    response: McpResponse,
    context: McpContext,
    call: () => Promise<void>,
    predicate: () => boolean,
  ): Promise<void> {
    await waitExecutionFor(async () => {
      response.resetResponseLineForTesting();
      await call();
      if (!predicate()) {
        throw new Error(
          `Tool response did not match yet:\n${response.responseLines.join('\n')}`,
        );
      }
    }, 5000);
  }

  it('captures sent and received messages', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      await openWebSocket(context);
      const echo = await sendAndAwaitEcho(context, 'hello there');
      assert.strictEqual(echo, 'echo: hello there');

      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketConnections.handler(
            {params: {}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
        () =>
          response.responseLines[0]?.includes('wsId=1') &&
          response.responseLines[0].includes('[open]') &&
          response.responseLines[0].includes('/ws') &&
          response.responseLines[0].includes('1 sent, 1 received'),
      );

      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketMessages.handler(
            {params: {wsId: 1}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
        () => {
          const text = response.responseLines.join('\n');
          return (
            text.includes('#1 [sent') &&
            text.includes('hello there') &&
            text.includes('#2 [received') &&
            text.includes('echo: hello there')
          );
        },
      );
    });
  });

  it('filters messages by direction and text', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      await openWebSocket(context);
      await sendAndAwaitEcho(context, 'alpha message');
      await sendAndAwaitEcho(context, 'beta message');

      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketMessages.handler(
            {
              params: {wsId: 1, direction: 'sent', filter: 'alpha'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
        () => {
          const text = response.responseLines.join('\n');
          return (
            text.includes('1 message(s)') &&
            text.includes('alpha message') &&
            !text.includes('beta') &&
            !text.includes('echo:')
          );
        },
      );
    });
  });

  it('truncates large payloads and returns the stored payload', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      await openWebSocket(context);
      const bigPayload = 'x'.repeat(120_000);
      await sendAndAwaitEcho(context, bigPayload);

      await callToolUntil(
        response,
        context,
        () =>
          getWebSocketMessage.handler(
            {
              params: {wsId: 1, messageId: 1},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
        () =>
          response.responseLines[0]?.includes(
            'truncated from 120000 to 100000',
          ) === true,
      );
      const payloadLine = response.responseLines[2];
      assert.strictEqual(payloadLine, 'x'.repeat(100_000));
    });
  });

  it('keeps connections visible across same-document navigations', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      await openWebSocket(context);
      const page = context.getSelectedMcpPage().pptrPage;
      await sendAndAwaitEcho(context, 'before pushState');

      // Single-page apps rewrite the URL during boot; this must neither
      // hide the connection nor stop the recording of its messages.
      await page.evaluate(`history.pushState({}, '', '/pushed-route')`);
      await sendAndAwaitEcho(context, 'after pushState');

      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketConnections.handler(
            {params: {}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
        () =>
          response.responseLines[0]?.includes('wsId=1') === true &&
          response.responseLines[0].includes('[open]') &&
          response.responseLines[0].includes('2 sent, 2 received'),
      );

      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketMessages.handler(
            {params: {wsId: 1}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
        () => {
          const text = response.responseLines.join('\n');
          return (
            text.includes('before pushState') &&
            text.includes('after pushState')
          );
        },
      );
    });
  });

  it('preserves closed connections over navigations', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      await openWebSocket(context);
      await sendAndAwaitEcho(context, 'from the first page');

      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/'));

      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketConnections.handler(
            {
              params: {includePreservedConnections: true},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
        () => {
          const text = response.responseLines.join('\n');
          return text.includes('wsId=1') && text.includes('[closed]');
        },
      );
    });
  });

  it('drops old messages and marks closed connections', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      await openWebSocket(context);
      const page = context.getSelectedMcpPage().pptrPage;
      // 520 round trips = 1040 messages; only the last 500 are retained.
      await page.evaluate(`new Promise(resolve => {
        let received = 0;
        window.__testWs.onmessage = () => {
          received++;
          if (received === 520) resolve(received);
        };
        for (let i = 0; i < 520; i++) {
          window.__testWs.send('bulk message ' + i);
        }
      })`);

      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketConnections.handler(
            {params: {}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
        () =>
          response.responseLines[0]?.includes('520 sent, 520 received') ===
            true &&
          response.responseLines[0].includes('540 oldest messages dropped'),
      );

      await assert.rejects(
        getWebSocketMessage.handler(
          {params: {wsId: 1, messageId: 1}, page: context.getSelectedMcpPage()},
          response,
          context,
        ),
        /No message with id 1 is retained/,
      );

      await page.evaluate(`window.__testWs.close()`);
      await callToolUntil(
        response,
        context,
        () =>
          listWebSocketConnections.handler(
            {params: {}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
        () => response.responseLines[0]?.includes('[closed]') === true,
      );
    });
  });

  it('reports an error for an unknown connection', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/'));
      await assert.rejects(
        listWebSocketMessages.handler(
          {params: {wsId: 42}, page: context.getSelectedMcpPage()},
          response,
          context,
        ),
        /No WebSocket connection with wsId=42/,
      );
    });
  });
});
