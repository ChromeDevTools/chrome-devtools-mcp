/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, before, beforeEach, describe, it} from 'node:test';

import {AggregatedIssue} from '../../node_modules/chrome-devtools-frontend/mcp/mcp.js';
import {setIssuesEnabled} from '../../src/features.js';
import {loadIssueDescriptions} from '../../src/issue-descriptions.js';
import {McpResponse} from '../../src/McpResponse.js';
import {
  getConsoleMessage,
  listConsoleMessages,
} from '../../src/tools/console.js';
import {serverHooks} from '../server.js';
import {withMcpContext} from '../utils.js';

describe('console', () => {
  before(async () => {
    await loadIssueDescriptions();
  });
  describe('list_console_messages', () => {
    it('list messages', async () => {
      await withMcpContext(async (response, context) => {
        await listConsoleMessages.handler({params: {}}, response, context);
        assert.ok(response.includeConsoleData);
      });
    });

    it('lists error messages', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(
          '<script>console.error("This is an error")</script>',
        );
        await listConsoleMessages.handler({params: {}}, response, context);
        const formattedResponse = await response.handle('test', context);
        const textContent = formattedResponse[0] as {text: string};
        assert.ok(
          textContent.text.includes('msgid=1 [error] This is an error'),
        );
      });
    });

    it('work with primitive unhandled errors', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent('<script>throw undefined;</script>');
        await listConsoleMessages.handler({params: {}}, response, context);
        const formattedResponse = await response.handle('test', context);
        const textContent = formattedResponse[0] as {text: string};
        assert.ok(
          textContent.text.includes('msgid=1 [error] undefined (0 args)'),
        );
      });
    });

    describe('issues', () => {
      beforeEach(() => {
        setIssuesEnabled(true);
      });
      afterEach(() => {
        setIssuesEnabled(false);
      });
      it('lists issues', async () => {
        await withMcpContext(async (response, context) => {
          const page = await context.newPage();
          const issuePromise = new Promise<void>(resolve => {
            page.once('issue', () => {
              resolve();
            });
          });
          await page.setContent('<input type="text" name="username" />');
          await issuePromise;
          await listConsoleMessages.handler({params: {}}, response, context);
          const formattedResponse = await response.handle('test', context);
          const textContent = formattedResponse[0] as {text: string};
          assert.ok(
            textContent.text.includes(
              `msgid=1 [issue] An element doesn't have an autocomplete attribute (count: 1)`,
            ),
          );
        });
      });

      it('lists issues after a page reload', async () => {
        await withMcpContext(async (response, context) => {
          const page = await context.newPage();
          const issuePromise = new Promise<void>(resolve => {
            page.once('issue', () => {
              resolve();
            });
          });

          await page.setContent('<input type="text" name="username" />');
          await issuePromise;
          await listConsoleMessages.handler({params: {}}, response, context);
          {
            const formattedResponse = await response.handle('test', context);
            const textContent = formattedResponse[0] as {text: string};
            assert.ok(
              textContent.text.includes(
                `msgid=1 [issue] An element doesn't have an autocomplete attribute (count: 1)`,
              ),
            );
          }

          const anotherIssuePromise = new Promise<void>(resolve => {
            page.once('issue', () => {
              resolve();
            });
          });
          await page.reload();
          await page.setContent('<input type="text" name="username" />');
          await anotherIssuePromise;
          {
            const formattedResponse = await response.handle('test', context);
            const textContent = formattedResponse[0] as {text: string};
            assert.ok(
              textContent.text.includes(
                `msgid=2 [issue] An element doesn't have an autocomplete attribute (count: 1)`,
              ),
            );
          }
        });
      });
    });
  });

  describe('get_console_message', () => {
    it('gets a specific console message', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(
          '<script>console.error("This is an error")</script>',
        );
        // The list is needed to populate the console messages in the context.
        await listConsoleMessages.handler({params: {}}, response, context);
        await getConsoleMessage.handler(
          {params: {msgid: 1}},
          response,
          context,
        );
        const formattedResponse = await response.handle('test', context);
        const textContent = formattedResponse[0] as {text: string};
        assert.ok(
          textContent.text.includes('msgid=1 [error] This is an error'),
          'Should contain console message body',
        );
      });
    });

    describe('issues type', () => {
      const server = serverHooks();
      beforeEach(() => {
        setIssuesEnabled(true);
      });
      afterEach(() => {
        setIssuesEnabled(false);
      });

      it('gets issue details with node id parsing', async t => {
        await withMcpContext(async (response, context) => {
          const page = await context.newPage();
          const issuePromise = new Promise<void>(resolve => {
            page.once('issue', () => {
              resolve();
            });
          });
          await page.setContent('<input type="text" name="username" />');
          await context.createTextSnapshot();
          await issuePromise;
          await listConsoleMessages.handler({params: {}}, response, context);
          const response2 = new McpResponse();
          await getConsoleMessage.handler(
            {params: {msgid: 1}},
            response2,
            context,
          );
          const formattedResponse = await response2.handle('test', context);
          t.assert.snapshot?.(formattedResponse[0].text);
        });
      });
      it('gets issue details with request id parsing', async t => {
        server.addRoute('/data.json', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({data: 'test data'}));
        });

        await withMcpContext(async (response, context) => {
          const page = await context.newPage();
          const issuePromise = new Promise<void>(resolve => {
            page.once('issue', () => {
              resolve();
            });
          });

          const url = server.getRoute('/data.json');
          await page.setContent(`
            <script>
              fetch('${url}', {
                  method: 'GET',
                  headers: {
                      'Content-Type': 'application/json',
                      'X-Custom-Header': 'MyValue'
                  }
              });
            </script>
          `);
          await context.createTextSnapshot();
          await issuePromise;
          const messages = context.getConsoleData();
          let issueMsg;
          for (const message of messages) {
            if (message instanceof AggregatedIssue) {
              issueMsg = message;
              break;
            }
          }
          assert.ok(issueMsg);
          const id = context.getConsoleMessageStableId(issueMsg);
          assert.ok(id);
          await listConsoleMessages.handler(
            {params: {types: ['issue']}},
            response,
            context,
          );
          const response2 = new McpResponse();
          await getConsoleMessage.handler(
            {params: {msgid: id}},
            response2,
            context,
          );
          const formattedResponse = await response2.handle('test', context);
          const rawText = formattedResponse[0].text as string;
          const sanitizedText = rawText
            .replaceAll(/ID: \d+/g, 'ID: <ID>')
            .replaceAll(/reqid=\d+/g, 'reqid=<reqid>')
            .replaceAll(/localhost:\d+/g, 'hostname:port');
          t.assert.snapshot?.(sanitizedText);
        });
      });
    });
  });
});
