/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import http from 'node:http';
import {describe, it} from 'node:test';

import {Client, InMemoryTransport} from '@modelcontextprotocol/client';
import sinon from 'sinon';

import {BrowserManager} from '../../src/BrowserManager.js';
import type {ParsedArguments} from '../../src/config/mcp-options.js';
import {McpServer} from '../../src/index.js';
import {McpContext} from '../../src/McpContext.js';
import {McpResponse} from '../../src/McpResponse.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import {zod} from '../../src/third_party/index.js';
import {click} from '../../src/tools/input.js';
import {
  isBrowserlessTool,
  isPageScopedTool,
  type AnyToolDefinition,
} from '../../src/tools/ToolDefinition.js';
import {createTools} from '../../src/tools/tools.js';
import {
  createHandlerMocks,
  createMockElementHandle,
  createMockParsedArguments,
  createMockPuppeteerBrowser,
  createMockPuppeteerTarget,
  createMockServerConfig,
} from '../mocks.js';
import {serverHooks} from '../server.js';
import {createTempFile, html, withBrowser, withMcpContext} from '../utils.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getReplEvaluateTool(args: ParsedArguments): AnyToolDefinition {
  const tool = createTools(args).find(
    entry => entry.name === 'evaluate_script',
  );
  assert.ok(tool, 'Expected evaluate_script tool in createTools(args)');
  return tool;
}

async function runReplEvaluate(
  args: ParsedArguments,
  params: Record<string, unknown>,
  response: McpResponse,
  context: McpContext,
): Promise<void> {
  const tool = getReplEvaluateTool(args);
  const parsedParams = zod.object(tool.schema).parse(params);
  if (isPageScopedTool(tool)) {
    const pageId =
      typeof params.pageId === 'number' ? params.pageId : undefined;
    const page =
      pageId !== undefined
        ? context.getPageById(pageId)
        : context.getSelectedMcpPage();
    await page.init({emulateFocus: true});
    if (tool.blockedByDialog) {
      page.throwIfDialogOpen();
    }
    await tool.handler({params: parsedParams, page}, response, context);
    return;
  }
  if (isBrowserlessTool(tool)) {
    await tool.handler({params: parsedParams}, response, context);
    return;
  }
  await tool.handler({params: parsedParams}, response, context);
}

function parseJsonBlockFromText(text: string): Record<string, unknown> {
  const match = text.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(
    match && match[1] !== undefined,
    `Expected \`\`\`json block in response text, got:\n${text}`,
  );
  const parsed: unknown = JSON.parse(match[1]);
  assert.ok(
    isPlainObject(parsed),
    `Expected JSON object result, got: ${JSON.stringify(parsed)}`,
  );
  return parsed;
}

function parseEvaluatedJson(response: McpResponse): Record<string, unknown> {
  return parseJsonBlockFromText(response.responseLines.join('\n'));
}

function getClientResultText(
  result: Awaited<ReturnType<Client['callTool']>>,
): string {
  if (!Array.isArray(result.content)) {
    return '';
  }
  const parts: string[] = [];
  for (const item of result.content) {
    if (
      isPlainObject(item) &&
      item.type === 'text' &&
      typeof item.text === 'string'
    ) {
      parts.push(item.text);
    }
  }
  return parts.join('\n');
}

describe('repl mode (evaluate_script with --repl)', () => {
  const httpServer = serverHooks();

  it('exposes the compact McpTools declaration, file-only sourcePath verification, and pageId routing on evaluate_script when repl is true', () => {
    const standardTool = getReplEvaluateTool(
      createMockParsedArguments({repl: false, pageIdRouting: true}),
    );
    assert.doesNotMatch(standardTool.description, /\binterface\s+McpTools\b/);

    const replTool = getReplEvaluateTool(
      createMockParsedArguments({repl: true, pageIdRouting: true}),
    );
    assert.match(replTool.description, /\binterface\s+McpTools\b/);
    assert.match(replTool.description, /\bgetElement\s*\(/);
    assert.match(replTool.description, /\bgetEventListeners\s*\(/);

    assert.ok('function' in replTool.schema);
    assert.ok('sourcePath' in replTool.schema);

    const sourcePathVerify = replTool.verifyFilesSchema.sourcePath;
    assert.ok(
      sourcePathVerify !== undefined,
      'Expected verifyFilesSchema.sourcePath to be configured',
    );
    const allowsRemoteUrl =
      typeof sourcePathVerify === 'object' && sourcePathVerify !== null
        ? Boolean(sourcePathVerify.allowUrl)
        : false;
    assert.strictEqual(
      allowsRemoteUrl,
      false,
      'Expected verifyFilesSchema.sourcePath not to set allowUrl: true in REPL mode',
    );

    const strictSchema = zod.object(replTool.schema).strict();
    assert.strictEqual(
      strictSchema.safeParse({function: 'async (mcp) => 1'}).success,
      false,
      'Expected pageId to be required when pageIdRouting is true',
    );
    assert.strictEqual(
      strictSchema.safeParse({pageId: 1, function: 'async (mcp) => 1'}).success,
      true,
    );
    assert.strictEqual(
      strictSchema.safeParse({pageId: 1, sourcePath: '/tmp/repl-script.js'})
        .success,
      true,
    );
  });

  it('executes in the cd4a_repl isolated world by default without main-world pollution or JSON intrinsic poisoning across sequential calls', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <button id="iso-btn">Isolated Button</button>
          <script>
            window.secretMainGlobal = 42;
            window.JSON.stringify = () => '"poisoned"';
            console.info('logged-from-main');
          </script>
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const logs = await mcp.list_console_messages();
              return {
                replGlobalBindingType: typeof globalThis.__mcpCallTool,
                replWindowBindingType: typeof window.__mcpCallTool,
                replSecretGlobalType: typeof window.secretMainGlobal,
                isLogsArray: Array.isArray(logs.consoleMessages),
                hasLoggedMain: logs.consoleMessages.some(
                  entry => typeof entry.text === 'string' && entry.text.includes('logged-from-main'),
                ),
              };
            }`,
          },
          response,
          context,
        );

        const first = parseEvaluatedJson(response);
        assert.strictEqual(first.replGlobalBindingType, 'undefined');
        assert.strictEqual(first.replWindowBindingType, 'undefined');
        assert.strictEqual(first.replSecretGlobalType, 'undefined');
        assert.strictEqual(first.isLogsArray, true);
        assert.strictEqual(first.hasLoggedMain, true);

        const mainWorldCheck = await mcpPage.pptrPage.evaluate(() => ({
          mainBindingType: typeof Reflect.get(window, '__mcpCallTool'),
          mainSecretValue: Reflect.get(window, 'secretMainGlobal'),
        }));
        assert.strictEqual(mainWorldCheck.mainBindingType, 'undefined');
        assert.strictEqual(mainWorldCheck.mainSecretValue, 42);

        response.resetResponseLineForTesting();
        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const snap = await mcp.take_snapshot();
              return {
                hasSnapshot: Boolean(snap.snapshot),
                replSecretGlobalType: typeof window.secretMainGlobal,
              };
            }`,
          },
          response,
          context,
        );

        const second = parseEvaluatedJson(response);
        assert.strictEqual(second.hasSnapshot, true);
        assert.strictEqual(second.replSecretGlobalType, 'undefined');
      },
      {},
      {repl: true, replMainWorld: false},
    );
  });

  it('executes in the page main world when replMainWorld is true', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <button id="mw-btn">Main World Button</button>
          <script>
            window.secretMainGlobal = 42;
          </script>
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => ({
              secret: window.secretMainGlobal,
              snap: (await mcp.take_snapshot()).ok,
            })`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.strictEqual(result.secret, 42);
        assert.strictEqual(result.snap, true);
      },
      {},
      {repl: true, replMainWorld: true},
    );
  });

  it('executes outer navigate_page then evaluate_script with inner mcp.* calls via McpServer without TaskRunner deadlock and returns structuredContent', async () => {
    httpServer.addHtmlRoute(
      '/server-repl',
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:," />
    <title>REPL Server Page</title>
  </head>
  <body>
    <main><h1>REPL Server Page</h1><button>Go</button></main>
  </body>
</html>`,
    );

    await withBrowser(async browser => {
      TextSnapshot.resetCounter();
      McpContext.resetPageIdsForTesting();
      McpContext.resetWorkerIdsForTesting();

      const browserManager = sinon.createStubInstance(BrowserManager);
      browserManager.ensureBrowser.resolves(browser);
      browserManager.close.resolves();

      const config = createMockServerConfig({
        repl: true,
        experimentalStructuredContent: false,
      });
      const mcpServer = await McpServer.from(config, {browserManager});
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await mcpServer.connect(serverTransport);
      const client = new Client({name: 'repl-e2e-client', version: '1.0.0'});
      await client.connect(clientTransport);

      try {
        const listRes = await client.callTool({
          name: 'list_pages',
          arguments: {},
        });
        const listText = getClientResultText(listRes);
        const pageIdMatch = listText.match(/(\d+): .* \[selected\]/);
        assert.ok(pageIdMatch);
        const pageId = Number(pageIdMatch[1]);

        const navRes = await client.callTool(
          {
            name: 'navigate_page',
            arguments: {pageId, url: httpServer.getRoute('/server-repl')},
          },
          {timeout: 10_000},
        );
        assert.strictEqual(
          navRes.isError,
          undefined,
          getClientResultText(navRes),
        );

        const evalRes = await client.callTool(
          {
            name: 'evaluate_script',
            arguments: {
              pageId,
              function: `async (mcp) => {
                const snap = await mcp.take_snapshot();
                const logs = await mcp.list_console_messages();
                const reqs = await mcp.list_network_requests();
                return {
                  snapOk: snap.ok,
                  hasSnapshot: Boolean(snap.snapshot),
                  isLogsArray: Array.isArray(logs.consoleMessages),
                  logsCount: Array.isArray(logs.consoleMessages) ? logs.consoleMessages.length : -1,
                  isReqsArray: Array.isArray(reqs.networkRequests),
                };
              }`,
            },
          },
          {timeout: 10_000},
        );
        assert.strictEqual(
          evalRes.isError,
          undefined,
          getClientResultText(evalRes),
        );

        const parsed = parseJsonBlockFromText(getClientResultText(evalRes));
        assert.strictEqual(parsed.snapOk, true);
        assert.strictEqual(parsed.hasSnapshot, true);
        assert.strictEqual(parsed.isLogsArray, true);
        assert.strictEqual(parsed.logsCount, 0);
        assert.strictEqual(parsed.isReqsArray, true);
      } finally {
        await client.close();
        await mcpServer.close();
      }
    });
  });

  it('provides DevTools Console Utilities after await without globalThis leaks and bridges main-world listeners via mcp.getEventListeners', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <button
            id="buy-btn"
            aria-label="Buy Now"
            >Purchase</button
          >
          <ul>
            <li class="item-row">Item 1</li>
            <li class="item-row">Item 2</li>
          </ul>
          <script>
            document.getElementById('buy-btn').addEventListener('click', () => {
              document.body.dataset.bought = 'true';
            });
          </script>
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              await mcp.wait_for({ text: ['Buy Now'] });
              const btn = $('#buy-btn');
              const rows = $$('.item-row');
              const xpathMatches = $x('//button[@id="buy-btn"]');
              const accName = getAccessibleName(btn);
              const accRole = getAccessibleRole(btn);
              const listeners = await mcp.getEventListeners({ element: btn });
              return {
                accName,
                accRole,
                rowCount: rows.length,
                xpathFoundSame: xpathMatches[0] === btn,
                globalDollarType: typeof globalThis.$,
                globalAccNameType: typeof globalThis.getAccessibleName,
                hasClickListener: Array.isArray(listeners) && listeners.some(entry => entry.type === 'click'),
              };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.strictEqual(result.accName, 'Buy Now');
        assert.strictEqual(result.accRole, 'button');
        assert.strictEqual(result.rowCount, 2);
        assert.strictEqual(result.xpathFoundSame, true);
        assert.strictEqual(result.globalDollarType, 'undefined');
        assert.strictEqual(result.globalAccNameType, 'undefined');
        assert.strictEqual(result.hasClickListener, true);
      },
      {},
      {repl: true, replMainWorld: false},
    );
  });

  it('rejects outer-only tools on mcp.* with guidance to return first', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Outer Guardrails</h1></main>`,
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              let navError = '';
              try {
                await mcp.navigate_page({ url: 'about:blank' });
              } catch (err) {
                navError = err instanceof Error ? err.message : String(err);
              }

              let dialogError = '';
              try {
                await mcp.handle_dialog({ action: 'accept' });
              } catch (err) {
                dialogError = err instanceof Error ? err.message : String(err);
              }

              return { navError, dialogError };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.ok(typeof result.navError === 'string');
        assert.match(result.navError, /outer MCP tool/i);
        assert.doesNotMatch(result.navError, /is not a function/i);

        assert.ok(typeof result.dialogError === 'string');
        assert.match(result.dialogError, /outer MCP tool/i);
        assert.doesNotMatch(result.dialogError, /is not a function/i);
      },
      {},
      {repl: true},
    );
  });

  it('rejects disabled inner tools on mcp.*', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Disabled Tool Check</h1></main>`,
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              let disabledError = '';
              try {
                await mcp.click_at({ x: 10, y: 10 });
              } catch (err) {
                disabledError = err instanceof Error ? err.message : String(err);
              }
              return { disabledError };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.ok(typeof result.disabledError === 'string');
        assert.match(result.disabledError, /disabled/i);
        assert.doesNotMatch(result.disabledError, /is not a function/i);
      },
      {},
      {repl: true, experimentalVision: false},
    );
  });

  it('rejects stripped host-file parameters on inner mcp.* calls', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Stripped Param Check</h1></main>`,
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              let filePathError = '';
              try {
                await mcp.take_snapshot({ filePath: '/tmp/leak.txt' });
              } catch (err) {
                filePathError = err instanceof Error ? err.message : String(err);
              }
              return { filePathError };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.ok(typeof result.filePathError === 'string');
        assert.match(result.filePathError, /filePath/);
      },
      {},
      {repl: true},
    );
  });

  it('attaches inner mcp.take_screenshot images to the outer response', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Screenshot Check</h1></main>`,
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              await mcp.take_screenshot();
              return { captured: true };
            }`,
          },
          response,
          context,
        );

        assert.strictEqual(parseEvaluatedJson(response).captured, true);
        assert.strictEqual(response.images.length, 1);
        assert.strictEqual(response.images[0]?.mimeType, 'image/png');
        assert.ok((response.images[0]?.data.length ?? 0) > 0);
      },
      {},
      {repl: true},
    );
  });

  it('drains un-awaited inner mcp.* calls before evaluate_script returns on the normal success path', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Drain In-Flight Check</h1></main>`,
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              void mcp.take_screenshot();
              return { returnedImmediately: true };
            }`,
          },
          response,
          context,
        );

        assert.strictEqual(
          parseEvaluatedJson(response).returnedImmediately,
          true,
        );
        assert.strictEqual(response.images.length, 1);
        assert.strictEqual(response.images[0]?.mimeType, 'image/png');
      },
      {},
      {repl: true},
    );
  });

  it('waits for stable DOM by default on normal completion unless waitForStableDom is false', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Stable DOM Default Check</h1></main>`,
        );

        const waitSpy = sinon.spy(mcpPage, 'createWaitForHelper');
        try {
          await runReplEvaluate(
            args,
            {
              pageId: mcpPage.id,
              function: `async () => ({ ok: 1 })`,
            },
            response,
            context,
          );
          sinon.assert.calledOnce(waitSpy);

          waitSpy.resetHistory();
          response.resetResponseLineForTesting();

          await runReplEvaluate(
            args,
            {
              pageId: mcpPage.id,
              waitForStableDom: false,
              function: `async () => ({ ok: 2 })`,
            },
            response,
            context,
          );
          sinon.assert.notCalled(waitSpy);
        } finally {
          waitSpy.restore();
        }
      },
      {},
      {repl: true},
    );
  });

  it('serializes concurrent Promise.all inner calls without clobbering multi-element handles', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <input
            id="input-a"
            type="text"
          />
          <input
            id="input-b"
            type="text"
          />
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const inputA = document.getElementById('input-a');
              const inputB = document.getElementById('input-b');
              await Promise.all([
                mcp.fill({ element: inputA, value: 'alpha' }),
                mcp.fill({ element: inputB, value: 'beta' }),
              ]);
              return {
                valueA: inputA.value,
                valueB: inputB.value,
              };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.strictEqual(result.valueA, 'alpha');
        assert.strictEqual(result.valueB, 'beta');
      },
      {},
      {repl: true},
    );
  });

  it('bridges live DOM Element handles (including same-origin iframes) without prior take_snapshot and resolves snapshot uids via mcp.getElement', async () => {
    httpServer.addHtmlRoute(
      '/bridge',
      html`
        <style>
          #main-btn {
            color: rgb(255, 0, 0);
          }
        </style>
        <button
          id="main-btn"
          onclick="this.dataset.clicked = 'main-ok'"
        >
          Main Target
        </button>
        <iframe
          id="same-origin-frame"
          srcdoc="<button id='iframe-btn' onclick='this.dataset.clicked = &quot;iframe-ok&quot;'>Iframe Target</button>"
        ></iframe>
      `,
    );

    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.goto(httpServer.getRoute('/bridge'));
        assert.strictEqual(mcpPage.textSnapshot, null);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const mainBtn = document.getElementById('main-btn');
              await mcp.click({ element: mainBtn });
              const styles = await mcp.get_css_styles({ element: mainBtn });

              const frame = document.getElementById('same-origin-frame');
              const iframeBtn = frame.contentDocument.querySelector('button');
              await mcp.click({ element: iframeBtn });

              const { snapshot } = await mcp.take_snapshot();
              function findUid(node, targetName) {
                if (!node || typeof node !== 'object') {
                  return null;
                }
                if (node.name === targetName && typeof node.id === 'string') {
                  return node.id;
                }
                for (const child of node.children ?? []) {
                  const found = findUid(child, targetName);
                  if (found) {
                    return found;
                  }
                }
                return null;
              }
              const mainUid = findUid(snapshot, 'Main Target');
              const resolvedMainEl = mainUid ? await mcp.getElement(mainUid) : null;

              return {
                mainClicked: mainBtn.dataset.clicked,
                iframeClicked: iframeBtn.dataset.clicked,
                hasMatchedStyles: Boolean(styles && styles.matchedStyles),
                mainUid,
                sameIdentity: resolvedMainEl === mainBtn,
              };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.strictEqual(result.mainClicked, 'main-ok');
        assert.strictEqual(result.iframeClicked, 'iframe-ok');
        assert.strictEqual(result.hasMatchedStyles, true);
        assert.strictEqual(typeof result.mainUid, 'string');
        assert.strictEqual(result.sameIdentity, true);
      },
      {},
      {repl: true},
    );
  });

  it('fills text inputs, textareas, and native selects by option value via mcp.fill', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <input
            id="email-input"
            type="text"
            value=""
          />
          <textarea id="notes-area"></textarea>
          <select id="plan-select">
            <option value="free">Free Tier</option>
            <option value="pro">Pro Plan</option>
          </select>
          <script>
            window.trackedState = {};
            function instrumentValueTracker(el) {
              const proto = Object.getPrototypeOf(el);
              const desc = Object.getOwnPropertyDescriptor(proto, 'value');
              let trackerValue = String(el.value);
              Object.defineProperty(el, 'value', {
                configurable: true,
                enumerable: desc.enumerable,
                get() {
                  return desc.get.call(this);
                },
                set(next) {
                  trackerValue = String(next);
                  desc.set.call(this, next);
                },
              });
              el._valueTracker = {
                getValue() {
                  return trackerValue;
                },
                setValue(next) {
                  trackerValue = String(next);
                },
              };
              const onEvent = () => {
                const current = el.value;
                if (el._valueTracker.getValue() !== current) {
                  el._valueTracker.setValue(current);
                  window.trackedState[el.id] = current;
                }
              };
              el.addEventListener('input', onEvent);
              el.addEventListener('change', onEvent);
            }

            for (const id of ['email-input', 'notes-area', 'plan-select']) {
              instrumentValueTracker(document.getElementById(id));
            }
          </script>
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const email = document.getElementById('email-input');
              const notes = document.getElementById('notes-area');
              const plan = document.getElementById('plan-select');

              await mcp.fill({ element: email, value: 'ada@example.com' });
              const firstFillOk = email.value === 'ada@example.com';

              await mcp.fill({ element: email, value: 'grace@example.com' });
              const overwriteOk = email.value === 'grace@example.com';

              await mcp.fill({ element: notes, value: 'Updated concise note' });
              const notesOk = notes.value === 'Updated concise note';

              await mcp.fill({ element: plan, value: 'pro' });
              const selectOk = plan.value === 'pro';

              return { firstFillOk, overwriteOk, notesOk, selectOk };
            }`,
          },
          response,
          context,
        );

        const domResult = parseEvaluatedJson(response);
        assert.strictEqual(domResult.firstFillOk, true);
        assert.strictEqual(domResult.overwriteOk, true);
        assert.strictEqual(domResult.notesOk, true);
        assert.strictEqual(domResult.selectOk, true);

        const trackedState = await mcpPage.pptrPage.evaluate(() => {
          return Reflect.get(window, 'trackedState');
        });
        assert.deepStrictEqual(trackedState, {
          'email-input': 'grace@example.com',
          'notes-area': 'Updated concise note',
          'plan-select': 'pro',
        });
      },
      {},
      {repl: true},
    );
  });

  it('does not probe selectNativeSelectOption on ephemeral element uids without an option AX node in click', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const {handle, locator} = createMockElementHandle();
    locator.click.resolves();
    page.getElementByUid.withArgs('__repl_el_1').resolves(handle);
    page.getAXNodeByUid.withArgs('__repl_el_1').returns(undefined);

    await click(args).handler(
      {params: {uid: '__repl_el_1'}, page},
      response,
      context,
    );

    sinon.assert.notCalled(handle.evaluateHandle);
    sinon.assert.calledOnce(locator.click);
  });

  it('selects a native <select> <option> passed as a live DOM Element to mcp.click', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <select id="plan-select">
            <option value="free">Free Tier</option>
            <option value="pro">Pro Plan</option>
          </select>
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const opt = document.querySelector('#plan-select option[value="pro"]');
              await mcp.click({ element: opt });
              return { selected: document.getElementById('plan-select').value };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.strictEqual(result.selected, 'pro');
      },
      {},
      {repl: true},
    );
  });

  it('auto-handles mid-script dialogs according to dialogAction', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <button
            id="confirm-btn"
            onclick="this.dataset.confirmed = String(confirm('Delete?'))"
          >
            Delete
          </button>
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const btn = document.getElementById('confirm-btn');
              await mcp.click({ element: btn });
              return { confirmed: btn.dataset.confirmed };
            }`,
          },
          response,
          context,
        );
        const accepted = parseEvaluatedJson(response);
        assert.strictEqual(accepted.confirmed, 'true');

        response.resetResponseLineForTesting();
        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            dialogAction: 'dismiss',
            function: `async (mcp) => {
              const btn = document.getElementById('confirm-btn');
              await mcp.click({ element: btn });
              return { confirmed: btn.dataset.confirmed };
            }`,
          },
          response,
          context,
        );
        const dismissed = parseEvaluatedJson(response);
        assert.strictEqual(dismissed.confirmed, 'false');
      },
      {},
      {repl: true},
    );
  });

  it('rejects evaluate_script when a modal dialog is already open', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Pre-existing Dialog</h1></main>`,
        );

        const dialogOpened = new Promise<void>(resolve => {
          mcpPage.pptrPage.once('dialog', () => resolve());
        });
        void mcpPage.pptrPage.evaluate(() => {
          alert('Already open dialog');
        });
        await dialogOpened;

        try {
          await assert.rejects(
            runReplEvaluate(
              args,
              {
                pageId: mcpPage.id,
                function: `async (mcp) => ({ ok: (await mcp.take_snapshot()).ok })`,
              },
              response,
              context,
            ),
            /dialog/i,
          );
        } finally {
          await mcpPage.getDialog()?.dismiss();
          mcpPage.clearDialog();
        }
      },
      {},
      {repl: true},
    );
  });

  it('executes local JavaScript files via sourcePath', async () => {
    using localScript = createTempFile(
      `async (mcp) => {
        const snap = await mcp.take_snapshot();
        return { loadedFromFile: true, snapOk: snap.ok };
      }`,
      'repl-local-check.js',
    );

    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Local Script Check</h1></main>`,
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            sourcePath: localScript.path,
          },
          response,
          context,
        );

        const fileJson = parseEvaluatedJson(response);
        assert.strictEqual(fileJson.loadedFromFile, true);
        assert.strictEqual(fileJson.snapOk, true);
      },
      {},
      {repl: true},
    );
  });

  it('rejects HTTP URLs passed to sourcePath', async () => {
    const mockBrowser = createMockPuppeteerBrowser();
    mockBrowser.targets.returns([createMockPuppeteerTarget()]);
    const browserManager = sinon.createStubInstance(BrowserManager);
    browserManager.ensureBrowser.resolves(mockBrowser);
    browserManager.close.resolves();
    const config = createMockServerConfig({repl: true, pageIdRouting: false});
    const mcpServer = await McpServer.from(config, {browserManager});

    try {
      const evilUrlRes = await mcpServer.callTool('evaluate_script', {
        sourcePath: 'http://127.0.0.1:9999/evil.js',
      });
      assert.strictEqual(evilUrlRes.isError, true);
      assert.match(
        getClientResultText(evilUrlRes),
        /file path, not a URL|Access denied|not allowed/i,
      );
    } finally {
      await mcpServer.close();
    }
  });

  it('survives SPA history.pushState within a single evaluate_script call', async () => {
    httpServer.addHtmlRoute(
      '/spa-app',
      html`
        <button
          id="spa-next"
          onclick="history.pushState({}, '', '/step2'); document.getElementById('spa-out').textContent = location.pathname;"
        >
          SPA Next
        </button>
        <div id="spa-out">/spa-app</div>
      `,
    );

    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.goto(httpServer.getRoute('/spa-app'));

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const btn = document.getElementById('spa-next');
              await mcp.click({ element: btn });
              await mcp.wait_for({ text: ['/step2'] });
              return {
                pathname: location.pathname,
                rendered: document.getElementById('spa-out').textContent,
              };
            }`,
          },
          response,
          context,
        );

        const spaJson = parseEvaluatedJson(response);
        assert.strictEqual(spaJson.pathname, '/step2');
        assert.strictEqual(spaJson.rendered, '/step2');
      },
      {},
      {repl: true},
    );
  });

  it('exits early with completedSteps and preserves prior screenshots on click-triggered full-page navigation', async () => {
    httpServer.addHtmlRoute(
      '/mpa-page1',
      html`<a
        id="to-page2"
        href="/page2"
        >Continue to Page 2</a
      >`,
    );
    httpServer.addHtmlRoute(
      '/page2',
      html`<main><h1>Welcome to Page 2</h1></main>`,
    );

    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.goto(httpServer.getRoute('/mpa-page1'));

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              await mcp.take_screenshot();
              const link = document.getElementById('to-page2');
              await mcp.click({ element: link });
              return { afterNavigation: true };
            }`,
          },
          response,
          context,
        );

        assert.strictEqual(response.error, undefined);
        assert.strictEqual(response.images.length, 1);
        assert.strictEqual(response.images[0]?.mimeType, 'image/png');

        const mpaJson = parseEvaluatedJson(response);
        assert.strictEqual(mpaJson.navigated, true);
        assert.strictEqual(mpaJson.newUrl, httpServer.getRoute('/page2'));
        assert.deepStrictEqual(mpaJson.completedSteps, [
          {tool: 'take_screenshot', ok: true},
          {
            tool: 'click',
            ok: true,
            navigatedToUrl: httpServer.getRoute('/page2'),
          },
        ]);
        assert.strictEqual(
          mcpPage.pptrPage.url(),
          httpServer.getRoute('/page2'),
        );
      },
      {},
      {repl: true},
    );
  });

  it('accepts inner tool structuredContent when page emulation metadata is active', async () => {
    httpServer.addHtmlRoute(
      '/emul-repl',
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:," />
    <title>Emulation Page</title>
    <style>
      #emul-btn {
        color: rgb(10, 20, 30);
      }
    </style>
  </head>
  <body>
    <button
      id="emul-btn"
      onclick="console.log('clicked-under-emulation')"
    >
      Emulate Action
    </button>
  </body>
</html>`,
    );

    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.goto(httpServer.getRoute('/emul-repl'));
        await mcpPage.emulate({
          colorScheme: 'dark',
          cpuThrottlingRate: 2,
        });

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const btn = document.getElementById('emul-btn');
              const clickRes = await mcp.click({ element: btn });
              const snapRes = await mcp.take_snapshot();
              const findButtonUid = (node) => {
                if (!node || typeof node !== 'object') {
                  return undefined;
                }
                if (node.role === 'button' && typeof node.id === 'string') {
                  return node.id;
                }
                if (Array.isArray(node.children)) {
                  for (const child of node.children) {
                    const found = findButtonUid(child);
                    if (found) {
                      return found;
                    }
                  }
                }
                return undefined;
              };
              const uid = findButtonUid(snapRes.snapshot);
              const stylesRes = await mcp.get_css_styles({ uid });
              const logsRes = await mcp.list_console_messages();
              const netRes = await mcp.list_network_requests();
              return {
                clickOk: clickRes.ok,
                snapOk: snapRes.ok,
                hasMatchedStyles: Boolean(stylesRes.matchedStyles),
                logsOk: logsRes.ok,
                hasClickedLog:
                  Array.isArray(logsRes.consoleMessages) &&
                  logsRes.consoleMessages.some(
                    entry =>
                      typeof entry.text === 'string' &&
                      entry.text.includes('clicked-under-emulation'),
                  ),
                netOk: netRes.ok,
                netCount: Array.isArray(netRes.networkRequests)
                  ? netRes.networkRequests.length
                  : 0,
              };
            }`,
          },
          response,
          context,
        );

        assert.strictEqual(response.error, undefined);
        const emulResult = parseEvaluatedJson(response);
        assert.strictEqual(emulResult.clickOk, true);
        assert.strictEqual(emulResult.snapOk, true);
        assert.strictEqual(emulResult.hasMatchedStyles, true);
        assert.strictEqual(emulResult.logsOk, true);
        assert.strictEqual(emulResult.hasClickedLog, true);
        assert.strictEqual(emulResult.netOk, true);
        assert.ok(
          typeof emulResult.netCount === 'number' && emulResult.netCount >= 1,
        );
      },
      {},
      {repl: true},
    );
  });

  it('rejects drifted inner tool structuredContent in ReplToolDispatcher', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Dispatcher Drift Check</h1></main>`,
        );

        const originalHandle = McpResponse.prototype.handle;
        const handleStub = sinon
          .stub(McpResponse.prototype, 'handle')
          .callsFake(async function (this: McpResponse, ctx, dataFormat) {
            if (this.includeConsoleData) {
              return {
                content: [{type: 'text', text: 'ok'}],
                structuredContent: {
                  ok: true,
                  consoleMessages: [
                    {
                      id: 1,
                      type: 'log',
                      text: 'x',
                      argsCount: 0,
                      undeclaredField: true,
                    },
                  ],
                },
              };
            }
            return await originalHandle.call(this, ctx, dataFormat);
          });

        try {
          await assert.rejects(
            runReplEvaluate(
              args,
              {
                pageId: mcpPage.id,
                function: `async (mcp) => {
                  return await mcp.list_console_messages();
                }`,
              },
              response,
              context,
            ),
            /Invalid output|outputSchema|undeclaredField|Unrecognized key/i,
          );
        } finally {
          handleStub.restore();
        }
      },
      {},
      {repl: true},
    );
  });

  it('rejects drifted structuredContent in McpServer when experimentalStructuredContent is enabled', async () => {
    await withBrowser(async browser => {
      TextSnapshot.resetCounter();
      McpContext.resetPageIdsForTesting();
      McpContext.resetWorkerIdsForTesting();

      const browserManager = sinon.createStubInstance(BrowserManager);
      browserManager.ensureBrowser.resolves(browser);
      browserManager.close.resolves();

      const config = createMockServerConfig({
        repl: false,
        experimentalStructuredContent: true,
      });
      const mcpServer = await McpServer.from(config, {browserManager});
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await mcpServer.connect(serverTransport);
      const client = new Client({
        name: 'strict-output-schema-client',
        version: '1.0.0',
      });
      await client.connect(clientTransport);

      const originalHandle = McpResponse.prototype.handle;
      const handleStub = sinon
        .stub(McpResponse.prototype, 'handle')
        .callsFake(async function (this: McpResponse, ctx, dataFormat) {
          if (this.includeConsoleData) {
            return {
              content: [{type: 'text', text: 'ok'}],
              structuredContent: {
                ok: true,
                consoleMessages: [
                  {
                    id: 1,
                    type: 'log',
                    text: 'x',
                    argsCount: 0,
                    undeclaredField: true,
                  },
                ],
              },
            };
          }
          return await originalHandle.call(this, ctx, dataFormat);
        });

      try {
        const listRes = await client.callTool({
          name: 'list_pages',
          arguments: {},
        });
        const listText = getClientResultText(listRes);
        const pageIdMatch = listText.match(/(\d+): .* \[selected\]/);
        assert.ok(pageIdMatch);
        const pageId = Number(pageIdMatch[1]);

        let serverRejectedOrErrored = false;
        let serverFailureMessage = '';
        try {
          const driftRes = await client.callTool({
            name: 'list_console_messages',
            arguments: {pageId},
          });
          if (driftRes.isError === true) {
            serverRejectedOrErrored = true;
            serverFailureMessage = getClientResultText(driftRes);
          }
        } catch (err) {
          serverRejectedOrErrored = true;
          serverFailureMessage =
            err instanceof Error ? err.message : String(err);
        }

        assert.strictEqual(
          serverRejectedOrErrored,
          true,
          'Expected McpServer with experimentalStructuredContent: true to reject drifted structuredContent',
        );
        assert.match(
          serverFailureMessage,
          /Invalid output|outputSchema|undeclaredField|Unrecognized key|Output validation/i,
        );
      } finally {
        handleStub.restore();
        await client.close();
        await mcpServer.close();
      }
    });
  });

  it('does not return colliding main-frame elements or listeners when given a cross-site OOPIF snapshot uid', async () => {
    const oopifServer = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      res.end(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:," />
    <title>Cross-Site Child</title>
  </head>
  <body>
    <button id="oopif-btn">OOPIF Action</button>
    <script>
      document
        .getElementById('oopif-btn')
        .addEventListener('oopif-only-listener', () => {});
      window.parent.postMessage('oopif-ready', '*');
    </script>
  </body>
</html>`);
    });
    await new Promise<void>(resolve => {
      oopifServer.listen(0, () => resolve());
    });

    try {
      const address = oopifServer.address();
      assert.ok(address && typeof address === 'object');
      const childUrl = `http://localhost:${address.port}/oopif-child`;

      httpServer.addHtmlRoute(
        '/oopif-host',
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:," />
    <title>OOPIF Host</title>
  </head>
  <body>
    <div id="main-filler"></div>
    <script>
      window.__oopifReady = false;
      window.addEventListener('message', event => {
        if (event.data === 'oopif-ready') {
          window.__oopifReady = true;
        }
      });
      const container = document.getElementById('main-filler');
      for (let i = 0; i < 25; i++) {
        const div = document.createElement('div');
        div.textContent = 'Main Filler ' + i;
        div.addEventListener('main-only-listener', () => {});
        container.appendChild(div);
      }
    </script>
    <iframe src="${childUrl}"></iframe>
  </body>
</html>`,
      );

      await withMcpContext(
        async (response, context, args) => {
          const mcpPage = context.getSelectedMcpPage();
          await mcpPage.pptrPage.goto(httpServer.getRoute('/oopif-host'));
          await mcpPage.pptrPage.waitForFunction(() =>
            Boolean(Reflect.get(window, '__oopifReady')),
          );

          await runReplEvaluate(
            args,
            {
              pageId: mcpPage.id,
              function: `async (mcp) => {
                const { snapshot } = await mcp.take_snapshot();
                function findUid(node) {
                  if (!node || typeof node !== 'object') {
                    return undefined;
                  }
                  if (
                    node.role === 'button' &&
                    node.name === 'OOPIF Action' &&
                    typeof node.id === 'string'
                  ) {
                    return node.id;
                  }
                  if (Array.isArray(node.children)) {
                    for (const child of node.children) {
                      const found = findUid(child);
                      if (found) {
                        return found;
                      }
                    }
                  }
                  return undefined;
                }
                const uid = findUid(snapshot);
                const el = uid ? await mcp.getElement(uid) : 'missing-uid';
                const listeners = uid
                  ? await mcp.getEventListeners({ uid })
                  : [];
                return {
                  uidFound: typeof uid === 'string',
                  elIsNull: el === null,
                  elTag:
                    el && typeof el === 'object' && 'tagName' in el
                      ? el.tagName
                      : null,
                  listenerTypes: listeners.map(entry => entry.type),
                };
              }`,
            },
            response,
            context,
          );

          const result = parseEvaluatedJson(response);
          assert.strictEqual(result.uidFound, true);
          assert.strictEqual(result.elIsNull, true);
          assert.strictEqual(result.elTag, null);
          assert.deepStrictEqual(result.listenerTypes, ['oopif-only-listener']);
        },
        {},
        {repl: true},
      );
    } finally {
      await new Promise<void>(resolve => {
        oopifServer.close(() => resolve());
      });
    }
  });

  it('does not trigger main-world Node.prototype getters, handles DOM-clobbered forms, and passes plain { nodeType: 1 } JSON objects', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <script>
            window.__getterHits = 0;
            const origOwnerDoc = Object.getOwnPropertyDescriptor(
              Node.prototype,
              'ownerDocument',
            );
            Object.defineProperty(Node.prototype, 'ownerDocument', {
              configurable: true,
              enumerable: origOwnerDoc.enumerable,
              get() {
                window.__getterHits++;
                return origOwnerDoc.get.call(this);
              },
            });
          </script>
          <form
            id="clobbered-form"
            aria-label="Clobbered Form"
          >
            <input
              name="nodeType"
              value="clobbered"
            />
            <input
              name="ownerDocument"
              value="clobbered"
            />
          </form>
          <button id="clean-btn">Clean</button>
        `);

        const hitsBefore = await mcpPage.pptrPage.evaluate(() =>
          Number(Reflect.get(window, '__getterHits')),
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const cleanBtn = document.getElementById('clean-btn');
              const hoverClean = await mcp.hover({ element: cleanBtn });

              const clobberedForm = document.getElementById('clobbered-form');
              let hoverFormOk = false;
              let hoverFormError = '';
              try {
                const res = await mcp.hover({ element: clobberedForm });
                hoverFormOk = res.ok === true;
              } catch (err) {
                hoverFormError = err instanceof Error ? err.message : String(err);
              }

              const { snapshot } = await mcp.take_snapshot();
              function findFormUid(node) {
                if (!node || typeof node !== 'object') {
                  return undefined;
                }
                if (
                  node.role === 'form' &&
                  node.name === 'Clobbered Form' &&
                  typeof node.id === 'string'
                ) {
                  return node.id;
                }
                if (Array.isArray(node.children)) {
                  for (const child of node.children) {
                    const found = findFormUid(child);
                    if (found) {
                      return found;
                    }
                  }
                }
                return undefined;
              }
              const formUid = findFormUid(snapshot);
              const resolvedForm = formUid ? await mcp.getElement(formUid) : null;

              let plainObjError = '';
              try {
                await mcp.execute_3p_developer_tool({
                  toolName: 'noop',
                  params: { item: { nodeType: 1, label: 'plain' } },
                });
              } catch (err) {
                plainObjError = err instanceof Error ? err.message : String(err);
              }

              return {
                hoverCleanOk: hoverClean.ok === true,
                hoverFormOk,
                hoverFormError,
                formUidFound: typeof formUid === 'string',
                resolvedFormMatches: resolvedForm === clobberedForm,
                plainObjError,
              };
            }`,
          },
          response,
          context,
        );

        const hitsAfter = await mcpPage.pptrPage.evaluate(() =>
          Number(Reflect.get(window, '__getterHits')),
        );
        const result = parseEvaluatedJson(response);

        assert.strictEqual(
          hitsAfter,
          hitsBefore,
          `Expected 0 main-world Node.prototype.ownerDocument getter hits, got ${hitsAfter - hitsBefore}`,
        );
        assert.strictEqual(result.hoverCleanOk, true);
        assert.strictEqual(
          result.hoverFormOk,
          true,
          `Expected hover on DOM-clobbered form to succeed, got error: ${String(result.hoverFormError)}`,
        );
        assert.strictEqual(result.formUidFound, true);
        assert.strictEqual(result.resolvedFormMatches, true);
        assert.ok(typeof result.plainObjError === 'string');
        assert.doesNotMatch(
          result.plainObjError,
          /reference a Node|DOM\.describeNode|Invalid "element"|Expected a DOM Element/i,
        );
        assert.match(
          result.plainObjError,
          /No tools found on the page|Tool noop not found|Invalid arguments for mcp\.execute_3p_developer_tool/i,
        );
      },
      {},
      {
        repl: true,
        replMainWorld: false,
        categoryExperimentalThirdParty: true,
      },
    );
  });

  it('isolates bootstrap internals from userFn lexical scope, leaves zero global binding residue on SyntaxError, and accepts trailing comments after semicolons', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Main World SyntaxError Check</h1></main>`,
        );

        await assert.rejects(
          runReplEvaluate(
            args,
            {
              pageId: mcpPage.id,
              function: 'syntax ((( error',
            },
            response,
            context,
          ),
        );

        const residualBindings = await mcpPage.pptrPage.evaluate(() =>
          Object.getOwnPropertyNames(window).filter(key =>
            key.startsWith('__mcpCallTool'),
          ),
        );
        assert.deepStrictEqual(residualBindings, []);
      },
      {},
      {repl: true, replMainWorld: true},
    );

    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Lexical Scope & Trailing Comment Check</h1></main>`,
        );

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              return {
                rawType: typeof rawBinding,
                mapType: typeof elementMap,
                pendingType: typeof pendingCalls,
                ok: (await mcp.take_snapshot()).ok,
              };
            };
            // trailing file comment`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.strictEqual(result.rawType, 'undefined');
        assert.strictEqual(result.mapType, 'undefined');
        assert.strictEqual(result.pendingType, 'undefined');
        assert.strictEqual(result.ok, true);
      },
      {},
      {repl: true, replMainWorld: false},
    );
  });

  it('rejects __proto__ keys in mcp.* arguments and fails fast on circular objects without leaking element handles', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(html`
          <input
            id="proto-input"
            type="text"
            aria-label="Proto Target"
          />
        `);

        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const { snapshot } = await mcp.take_snapshot();
              function findInputUid(node) {
                if (!node || typeof node !== 'object') {
                  return undefined;
                }
                if (
                  node.role === 'textbox' &&
                  typeof node.id === 'string'
                ) {
                  return node.id;
                }
                if (Array.isArray(node.children)) {
                  for (const child of node.children) {
                    const found = findInputUid(child);
                    if (found) {
                      return found;
                    }
                  }
                }
                return undefined;
              }
              const uid = findInputUid(snapshot) ?? '1_1';

              let protoError = '';
              try {
                const poisoned = JSON.parse(
                  '{"uid":' +
                    JSON.stringify(uid) +
                    ',"value":"x","__proto__":{"polluted":1}}',
                );
                await mcp.fill_form({ elements: [poisoned] });
              } catch (err) {
                protoError = err instanceof Error ? err.message : String(err);
              }

              let circularError = '';
              try {
                const el = document.getElementById('proto-input');
                const cyc = { el };
                cyc.self = cyc;
                await mcp.execute_3p_developer_tool({
                  toolName: 't',
                  params: cyc,
                });
              } catch (err) {
                circularError = err instanceof Error ? err.message : String(err);
              }

              return { protoError, circularError };
            }`,
          },
          response,
          context,
        );

        const result = parseEvaluatedJson(response);
        assert.ok(typeof result.protoError === 'string');
        assert.match(result.protoError, /__proto__|Invalid/i);

        assert.ok(typeof result.circularError === 'string');
        assert.match(result.circularError, /Circular reference/i);
        assert.doesNotMatch(result.circularError, /Maximum call stack/i);
      },
      {},
      {repl: true, categoryExperimentalThirdParty: true},
    );
  });

  it('aborts queued un-awaited inner mcp.* calls immediately when the script throws and caps concurrent pending binding floods', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Flood & Timeout Check</h1></main>`,
        );

        const startedAt = performance.now();
        await assert.rejects(
          runReplEvaluate(
            args,
            {
              pageId: mcpPage.id,
              function: `async (mcp) => {
                for (let i = 0; i < 5; i++) {
                  void mcp.wait_for({
                    text: ['__never_present__'],
                    timeout: 2000,
                  });
                }
                throw new Error('boom');
              }`,
            },
            response,
            context,
          ),
          /boom/,
        );
        const elapsedMs = performance.now() - startedAt;
        assert.ok(
          elapsedMs < 2500,
          `Expected script throw to abort queued inner calls in < 2500ms, took ${elapsedMs.toFixed(0)}ms`,
        );

        response.resetResponseLineForTesting();
        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const promises = [];
              for (let i = 0; i < 40; i++) {
                promises.push(
                  mcp.take_snapshot().then(
                    () => ({ ok: true }),
                    err => ({
                      ok: false,
                      error: err instanceof Error ? err.message : String(err),
                    }),
                  ),
                );
              }
              const outcomes = await Promise.all(promises);
              const rejected = outcomes.filter(item => !item.ok);
              return {
                rejectedCount: rejected.length,
                firstError: rejected[0]?.error ?? '',
              };
            }`,
          },
          response,
          context,
        );
        const floodResult = parseEvaluatedJson(response);
        assert.strictEqual(floodResult.rejectedCount, 8);
        assert.match(
          String(floodResult.firstError),
          /pending|concurrent|in-flight|limit|32/i,
        );

        response.resetResponseLineForTesting();
        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              let timeoutError = '';
              try {
                await mcp.wait_for({
                  text: ['Flood & Timeout Check'],
                  timeout: 120000,
                });
              } catch (err) {
                timeoutError = err instanceof Error ? err.message : String(err);
              }
              return { timeoutError };
            }`,
          },
          response,
          context,
        );
        const timeoutResult = parseEvaluatedJson(response);
        assert.ok(typeof timeoutResult.timeoutError === 'string');
        assert.match(
          timeoutResult.timeoutError,
          /30000|30_000|timeout|at most|less than or equal|<= ?30000/i,
        );
      },
      {},
      {repl: true},
    );
  });

  it('rejects non-file URL schemes and remote-host file URLs on sourcePath without leaking cwd', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>SourcePath URL Guard</h1></main>`,
        );

        const cwd = process.cwd();
        for (const badSourcePath of [
          'data:text/javascript,async()=>1',
          'file://remote-host/share/evil.js',
        ]) {
          let caughtMessage = '';
          try {
            await runReplEvaluate(
              args,
              {
                pageId: mcpPage.id,
                sourcePath: badSourcePath,
              },
              response,
              context,
            );
          } catch (err) {
            caughtMessage = err instanceof Error ? err.message : String(err);
          }

          assert.notStrictEqual(
            caughtMessage,
            '',
            `Expected sourcePath "${badSourcePath}" to be rejected`,
          );
          assert.match(caughtMessage, /file path, not a URL|local file/i);
          assert.strictEqual(
            caughtMessage.includes(cwd),
            false,
            `Expected error for "${badSourcePath}" not to leak process.cwd(), got: ${caughtMessage}`,
          );
        }
      },
      {},
      {repl: true},
    );
  });
});
