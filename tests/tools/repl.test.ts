/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {Client, InMemoryTransport} from '@modelcontextprotocol/client';
import sinon from 'sinon';

import {BrowserManager} from '../../src/BrowserManager.js';
import type {ParsedArguments} from '../../src/config/mcp-options.js';
import {McpServer} from '../../src/index.js';
import {McpContext} from '../../src/McpContext.js';
import type {McpResponse} from '../../src/McpResponse.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import {zod} from '../../src/third_party/index.js';
import {
  isBrowserlessTool,
  isPageScopedTool,
  type AnyToolDefinition,
} from '../../src/tools/ToolDefinition.js';
import {createTools} from '../../src/tools/tools.js';
import {createMockParsedArguments, createMockServerConfig} from '../mocks.js';
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
    await tool.handler({params, page}, response, context);
    return;
  }
  if (isBrowserlessTool(tool)) {
    await tool.handler({params}, response, context);
    return;
  }
  await tool.handler({params}, response, context);
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

function hasCompletedStep(steps: unknown, toolName: string): boolean {
  if (!Array.isArray(steps)) {
    return false;
  }
  return steps.some(step => {
    if (typeof step === 'string') {
      return step.includes(toolName);
    }
    if (isPlainObject(step)) {
      return (
        step.tool === toolName ||
        step.name === toolName ||
        step.toolName === toolName
      );
    }
    return false;
  });
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
      html`<main><h1>REPL Server Page</h1><button>Go</button></main>`,
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
        const pageId = pageIdMatch ? Number(pageIdMatch[1]) : 1;

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

  it('throws self-correcting errors for outer-only, disabled, and stripped filePath calls while attaching inner screenshots to outer response', async () => {
    await withMcpContext(
      async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          html`<main><h1>Guardrails</h1></main>`,
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

              let disabledError = '';
              try {
                await mcp.click_at({ x: 10, y: 10 });
              } catch (err) {
                disabledError = err instanceof Error ? err.message : String(err);
              }

              let filePathError = '';
              try {
                await mcp.take_snapshot({ filePath: '/tmp/leak.txt' });
              } catch (err) {
                filePathError = err instanceof Error ? err.message : String(err);
              }

              await mcp.take_screenshot();
              return {
                navError,
                dialogError,
                disabledError,
                filePathError,
              };
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

        assert.ok(typeof result.disabledError === 'string');
        assert.match(result.disabledError, /disabled/i);
        assert.doesNotMatch(result.disabledError, /is not a function/i);

        assert.ok(typeof result.filePathError === 'string');
        assert.match(result.filePathError, /filePath/);

        assert.strictEqual(response.images.length, 1);
        assert.strictEqual(response.images[0]?.mimeType, 'image/png');
        assert.ok((response.images[0]?.data.length ?? 0) > 0);
      },
      {},
      {repl: true, experimentalVision: false},
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

  it('updates React-style _valueTracker controlled inputs, textareas, date inputs, and select options by label via mcp.fill', async () => {
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
          <input
            id="start-date"
            type="date"
            value=""
          />
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

            for (const id of [
              'email-input',
              'notes-area',
              'start-date',
              'plan-select',
            ]) {
              instrumentValueTracker(document.getElementById(id));
            }
          </script>
        `);

        const expectedLong = 'x'.repeat(120);
        await runReplEvaluate(
          args,
          {
            pageId: mcpPage.id,
            function: `async (mcp) => {
              const email = document.getElementById('email-input');
              const notes = document.getElementById('notes-area');
              const startDate = document.getElementById('start-date');
              const plan = document.getElementById('plan-select');

              await mcp.fill({ element: email, value: 'ada@example.com' });
              const shortOk = email.value === 'ada@example.com';

              const longVal = 'x'.repeat(120);
              await mcp.fill({ element: notes, value: longVal });
              const longOk = notes.value === longVal;

              await mcp.fill({ element: email, value: '' });
              const clearedOk = email.value === '';

              await mcp.fill({ element: startDate, value: '2026-11-12' });
              const dateOk = startDate.value === '2026-11-12';

              await mcp.fill({ element: plan, value: 'Pro Plan' });
              const selectOk = plan.value === 'pro';

              return { shortOk, longOk, clearedOk, dateOk, selectOk };
            }`,
          },
          response,
          context,
        );

        const domResult = parseEvaluatedJson(response);
        assert.strictEqual(domResult.shortOk, true);
        assert.strictEqual(domResult.longOk, true);
        assert.strictEqual(domResult.clearedOk, true);
        assert.strictEqual(domResult.dateOk, true);
        assert.strictEqual(domResult.selectOk, true);

        const trackedState = await mcpPage.pptrPage.evaluate(() => {
          return Reflect.get(window, 'trackedState');
        });
        assert.deepStrictEqual(trackedState, {
          'email-input': '',
          'notes-area': expectedLong,
          'start-date': '2026-11-12',
          'plan-select': 'pro',
        });
      },
      {},
      {repl: true},
    );
  });

  it('auto-handles mid-script modal dialogs via dialogAction while rejecting pre-existing open dialogs', async () => {
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

  it('executes local sourcePath scripts, rejects URL sourcePath, survives SPA pushState, and cleanly exits early on click-triggered MPA navigation while preserving prior screenshots', async () => {
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

    using localScript = createTempFile(
      `async (mcp) => {
        const snap = await mcp.take_snapshot();
        return { loadedFromFile: true, snapOk: snap.ok };
      }`,
      'repl-local-check.js',
    );

    await withBrowser(async browser => {
      TextSnapshot.resetCounter();
      McpContext.resetPageIdsForTesting();
      McpContext.resetWorkerIdsForTesting();

      const browserManager = sinon.createStubInstance(BrowserManager);
      browserManager.ensureBrowser.resolves(browser);
      browserManager.close.resolves();

      const config = createMockServerConfig({repl: true});
      const mcpServer = await McpServer.from(config, {browserManager});

      try {
        const listRes = await mcpServer.callTool('list_pages', {});
        const listText = getClientResultText(listRes);
        const pageIdMatch = listText.match(/(\d+): .* \[selected\]/);
        const pageId = pageIdMatch ? Number(pageIdMatch[1]) : 1;

        await mcpServer.callTool('navigate_page', {
          pageId,
          url: httpServer.getRoute('/spa-app'),
        });

        const fileRes = await mcpServer.callTool('evaluate_script', {
          pageId,
          sourcePath: localScript.path,
        });
        assert.strictEqual(
          fileRes.isError,
          undefined,
          getClientResultText(fileRes),
        );
        const fileJson = parseJsonBlockFromText(getClientResultText(fileRes));
        assert.strictEqual(fileJson.loadedFromFile, true);
        assert.strictEqual(fileJson.snapOk, true);

        const evilUrlRes = await mcpServer.callTool('evaluate_script', {
          pageId,
          sourcePath: 'http://127.0.0.1:9999/evil.js',
        });
        assert.strictEqual(evilUrlRes.isError, true);
        assert.match(
          getClientResultText(evilUrlRes),
          /file path, not a URL|Access denied|not allowed/i,
        );

        const spaRes = await mcpServer.callTool('evaluate_script', {
          pageId,
          function: `async (mcp) => {
            const btn = document.getElementById('spa-next');
            await mcp.click({ element: btn });
            await mcp.wait_for({ text: ['/step2'] });
            return {
              pathname: location.pathname,
              rendered: document.getElementById('spa-out').textContent,
            };
          }`,
        });
        assert.strictEqual(
          spaRes.isError,
          undefined,
          getClientResultText(spaRes),
        );
        const spaJson = parseJsonBlockFromText(getClientResultText(spaRes));
        assert.strictEqual(spaJson.pathname, '/step2');
        assert.strictEqual(spaJson.rendered, '/step2');
      } finally {
        await mcpServer.close();
      }
    });

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
        assert.ok(
          hasCompletedStep(mpaJson.completedSteps, 'take_screenshot'),
          `Expected completedSteps to include take_screenshot, got: ${JSON.stringify(mpaJson.completedSteps)}`,
        );
        assert.ok(
          hasCompletedStep(mpaJson.completedSteps, 'click'),
          `Expected completedSteps to include click, got: ${JSON.stringify(mpaJson.completedSteps)}`,
        );
        assert.strictEqual(
          mcpPage.pptrPage.url(),
          httpServer.getRoute('/page2'),
        );
      },
      {},
      {repl: true},
    );
  });
});
