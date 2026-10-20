/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import {executablePath} from 'puppeteer';

import {Client, type ClientCapabilities} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import type {TextContent} from '../src/third_party/index.js';

import {createTempDir} from './utils.js';

// Each test starts its own server process, so the tests run in parallel. Most
// of the test time is server start and waits, not CPU work.
describe('e2e', {concurrency: true}, () => {
  async function withClient(
    cb: (client: Client) => Promise<void>,
    extraArgs: string[] = [],
    options: {
      capabilities?: ClientCapabilities;
      versionNegotiation?: {mode: 'auto' | 'legacy' | {pin: string}};
    } = {},
  ) {
    let attempt = 1;
    while (attempt <= 3) {
      const transport = new StdioClientTransport({
        command: 'node',
        args: [
          'build/src/bin/chrome-devtools-mcp.js',
          '--headless',
          '--isolated',
          '--executable-path',
          await executablePath(),
          ...extraArgs,
        ],
        env: {...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
      });
      const client = new Client(
        {
          name: 'e2e-test',
          version: '1.0.0',
        },
        {
          capabilities: options.capabilities ?? {},
          ...(options.versionNegotiation
            ? {versionNegotiation: options.versionNegotiation}
            : {}),
        },
      );

      try {
        await client.connect(transport);
        await cb(client);
        return;
      } catch (error) {
        if (
          attempt === 3 ||
          !(error instanceof Error) ||
          (!error.message.includes('timed out') &&
            !error.message.includes('timeout'))
        ) {
          throw error;
        }
        attempt++;
        await new Promise(r => setTimeout(r, 1000));
      } finally {
        try {
          await client.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }
  it('connects and negotiates 2026-07-28 era', async () => {
    await withClient(
      async client => {
        const result = await client.callTool({
          name: 'list_pages',
          arguments: {},
        });
        assert.ok(result.content);
      },
      [],
      {versionNegotiation: {mode: 'auto'}},
    );
  });

  it('calls a tool', async t => {
    await withClient(async client => {
      const result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      t.assert.snapshot(JSON.stringify(result.content));
    });
  });

  it('calls a tool multiple times', async t => {
    await withClient(async client => {
      let result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      t.assert.snapshot(JSON.stringify(result.content));
    });
  });

  it('updates roots when client notifies', async () => {
    const roots = [{uri: 'file:///test-root', name: 'test-root'}];
    let resolvePromise: () => void;
    const promise = new Promise<void>(resolve => {
      resolvePromise = resolve;
    });

    await withClient(
      async client => {
        client.setRequestHandler('roots/list', () => {
          resolvePromise();
          return {roots};
        });

        await client.notification({
          method: 'notifications/roots/list_changed',
        });

        // Wait for the server to process the notification and request roots
        await promise;
      },
      [],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  it('combines configured filesystem roots with client roots', async () => {
    using configuredRoot = createTempDir('.configured-root-', os.homedir());
    using clientRoot = createTempDir('.client-root-', os.homedir());

    await withClient(
      async client => {
        client.setRequestHandler('roots/list', () => {
          return {
            roots: [
              {uri: pathToFileURL(clientRoot.path).href, name: 'client-root'},
            ],
          };
        });

        for (const outputPath of [
          path.join(configuredRoot.path, 'configured.png'),
          path.join(clientRoot.path, 'client.png'),
        ]) {
          const result = await client.callTool({
            name: 'take_screenshot',
            arguments: {pageId: 1, filePath: outputPath},
          });
          assert.strictEqual(result.isError, undefined);
          const content = result.content as TextContent[];
          assert.match(content[0].text, /Saved screenshot to/);
        }
      },
      [`--filesystem-root=${configuredRoot.path}`],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  it('denies file access if roots list is empty', async () => {
    await withClient(
      async client => {
        client.setRequestHandler('roots/list', () => {
          return {roots: []};
        });

        const result = await client.callTool({
          name: 'take_screenshot',
          arguments: {
            pageId: 1,
            filePath: path.resolve(os.homedir(), 'test.png'),
          },
        });

        assert.strictEqual(result.isError, true);
        const content = result.content as TextContent[];
        assert.match(content[0].text, /Access denied/);
      },
      [],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  it('allows file access if roots capability is missing', async () => {
    using tempDir = createTempDir();
    await withClient(
      async client => {
        // Use os.tmpdir() rather than a hardcoded /tmp path.
        // On macOS, os.tmpdir() returns /var/folders/... (not /tmp), so a
        // hardcoded /tmp path is outside the allowed root after the
        // validatePath fix and would be rejected with Access denied.
        const result = await client.callTool({
          name: 'take_screenshot',
          arguments: {
            pageId: 1,
            filePath: path.join(tempDir.path, 'test.png'),
          },
        });

        assert.strictEqual(result.isError, undefined);
        const content = result.content as TextContent[];
        assert.match(content[0].text, /Saved screenshot to/);
      },
      [],
      {
        capabilities: {},
      },
    );
  });

  it('makes concurrent first calls wait for the same roots/list', async () => {
    const fixturesRoot = path.resolve('tests/fixtures');
    await withClient(
      async client => {
        // Answers late enough that both calls start before the roots arrive.
        // Browserless tools hold no lock, so without a shared initial roots
        // request the second call validates its path against no roots.
        client.setRequestHandler('roots/list', async () => {
          await new Promise(resolve => setTimeout(resolve, 1_000));
          return {
            roots: [{uri: pathToFileURL(fixturesRoot).href, name: 'fixtures'}],
          };
        });

        const results = await Promise.all([
          client.callTool({
            name: 'get_heapsnapshot_summary',
            arguments: {
              filePath: path.join(fixturesRoot, 'example.heapsnapshot'),
            },
          }),
          client.callTool({
            name: 'get_heapsnapshot_summary',
            arguments: {
              filePath: path.join(fixturesRoot, 'example.heapsnapshot'),
            },
          }),
        ]);

        for (const result of results) {
          const content = result.content as TextContent[];
          assert.strictEqual(result.isError, undefined, content[0]?.text);
        }
      },
      ['--memoryDebugging'],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  it('does not block tools if the client never answers roots/list', async () => {
    await withClient(
      async client => {
        // A client that negotiates roots but never responds. getContext()
        // awaits updateRoots() while holding the context lock, so an unbounded
        // request would stall this call for the SDK default of 60s.
        client.setRequestHandler('roots/list', () => {
          return new Promise<never>(() => {
            // Intentionally never settles
          });
        });

        const start = Date.now();
        // Raise the client-side timeout above the SDK default so an unbounded
        // roots request surfaces as the assertion below rather than a timeout
        const result = await client.callTool(
          {
            name: 'list_pages',
            arguments: {},
          },
          {timeout: 90_000},
        );
        const elapsed = Date.now() - start;

        assert.strictEqual(result.isError, undefined);
        // Bounded roots request plus browser launch settles well under this,
        // leaving room for a slow CI runner while still catching the 60s stall
        assert.ok(
          elapsed < 45_000,
          `list_pages took ${elapsed}ms, expected the bounded roots request to settle well before the 60s SDK default`,
        );
      },
      [],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  it('still applies roots from a client slower than the bound', async () => {
    using workspace = createTempDir('.roots-slow-client-', os.homedir());
    await withClient(
      async client => {
        // Answers after the bound the blocking call uses, so the roots only
        // arrive via the background listing
        client.setRequestHandler('roots/list', async () => {
          await new Promise(resolve => setTimeout(resolve, 6_000));
          return {
            roots: [
              {uri: pathToFileURL(workspace.path).href, name: 'workspace'},
            ],
          };
        });

        await client.callTool({name: 'list_pages', arguments: {}});

        // Retries until the background listing delivers the roots, instead of
        // a fixed wait.
        const deadline = Date.now() + 10_000;
        let result: Awaited<ReturnType<Client['callTool']>>;
        do {
          result = await client.callTool({
            name: 'take_screenshot',
            arguments: {
              pageId: 1,
              filePath: path.join(workspace.path, 'shot.png'),
            },
          });
          if (!result.isError) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        } while (Date.now() < deadline);

        // Asserted before isError so a denial reports the path it rejected
        const content = result.content as TextContent[];
        assert.match(content[0].text, /Saved screenshot to/);
        assert.strictEqual(result.isError, undefined);
      },
      [],
      {
        capabilities: {
          roots: {listChanged: true},
        },
      },
    );
  });

  describe('Dialogs', {concurrency: true}, () => {
    function getFirstText(
      result: Awaited<ReturnType<Client['callTool']>>,
    ): string {
      const first = Array.isArray(result.content)
        ? result.content[0]
        : undefined;
      return first && 'text' in first && typeof first.text === 'string'
        ? first.text
        : '';
    }

    async function createNewPageAndTriggerDialog(client: Client) {
      // Navigate to a page with a button that triggers a dialog on click
      const newPageResult = await client.callTool({
        name: 'new_page',
        arguments: {
          url: `data:text/html,<button id="test" onclick="alert('test dialog')">Click me</button>`,
        },
      });
      if (newPageResult.isError) {
        throw new Error(getFirstText(newPageResult));
      }

      const snapshotResult = await client.callTool({
        name: 'take_snapshot',
        arguments: {
          pageId: 2,
        },
      });
      if (snapshotResult.isError) {
        throw new Error(getFirstText(snapshotResult));
      }

      const snapshotText = getFirstText(snapshotResult);
      const match = snapshotText.match(/uid=(\d+_\d+)\s+button "Click me"/);
      const uid = match ? match[1] : '1_1';

      // Trigger the dialog
      const result = await client.callTool({
        name: 'click',
        arguments: {
          pageId: 2,
          uid,
        },
      });
      if (result.isError) {
        throw new Error(getFirstText(result));
      }

      return result;
    }

    it('returns blocked message when dialog is opened during tool execution', async t => {
      await withClient(async client => {
        const result = await createNewPageAndTriggerDialog(client);
        t.assert.snapshot(JSON.stringify(result));
      });
    });

    it('when dialog is open and tool is blocked, returns an error', async t => {
      await withClient(async client => {
        await createNewPageAndTriggerDialog(client);
        const result = await client.callTool({
          name: 'take_screenshot',
          arguments: {
            pageId: 2,
            // Use os.tmpdir() so validatePath passes on macOS/Windows before
            // reaching the dialog-blocked check.
            filePath: path.join(os.tmpdir(), 'test.png'),
          },
        });

        t.assert.snapshot(JSON.stringify(result));
      });
    });

    it('when dialog is open and tool is not blocked, executes tool', async t => {
      await withClient(async client => {
        await createNewPageAndTriggerDialog(client);
        const result = await client.callTool({
          name: 'new_page',
          arguments: {
            url: `data:text/html,<h1>New</h1>`,
          },
        });

        t.assert.snapshot(JSON.stringify(result));
      });
    });

    it('when dialog is open, evaluate_script returns an error', async () => {
      await withClient(async client => {
        await createNewPageAndTriggerDialog(client);
        const result = await client.callTool(
          {
            name: 'evaluate_script',
            arguments: {
              pageId: 2,
              function: '() => 1',
            },
          },
          {timeout: 10_000},
        );

        assert.strictEqual(result.isError, true);
        assert.match(
          getFirstText(result),
          /A dialog is open \(alert: test dialog\)\./,
        );
      });
    });
  });
});
