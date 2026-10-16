/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {describe, it} from 'node:test';

import ts from 'typescript';

import type {ParsedArguments} from '../../src/config/ConfigParser.js';
import type {McpContext} from '../../src/McpContext.js';
import {McpResponse} from '../../src/McpResponse.js';
import {listConsoleMessages} from '../../src/tools/console.js';
import {
  listLogpoints,
  listScripts,
  removeLogpoint,
  setLogpoint,
} from '../../src/tools/logpoints.js';
import {serverHooks} from '../server.js';
import {
  getTextContent,
  html,
  waitExecutionFor,
  withMcpContext,
} from '../utils.js';

const APP_SCRIPT = `function greet(name) {
  const message = 'Hello, ' + name;
  return message;
}
function withDebuggerStatement() {
  debugger;
  return 42;
}
`;

function serveAppScript(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.statusCode = 200;
  res.end(APP_SCRIPT);
}

// A "bundle" transpiled from TypeScript with a real source map, like a
// bundler would produce. Line 2 of the TypeScript source is the logpoint
// target used in tests.
const TS_SOURCE = [
  `function tsGreet(name: string): string {`,
  `  const tsMessage: string = 'Hello, ' + name;`,
  `  return tsMessage;`,
  `}`,
  `(globalThis as {tsGreet?: unknown}).tsGreet = tsGreet;`,
].join('\n');

function transpileTsBundle(): {js: string; map: string} {
  const result = ts.transpileModule(TS_SOURCE, {
    fileName: 'app.ts',
    compilerOptions: {
      sourceMap: true,
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
    },
  });
  assert.ok(result.sourceMapText, 'transpilation should produce a source map');
  return {js: result.outputText, map: result.sourceMapText};
}

// Simulates a rebuilt bundle: the same code shifted down by extra leading
// statements. Prepending a semicolon per line to the mappings shifts all
// generated positions accordingly. The banner lines are executable so that
// a logpoint left at the old generated position no longer hits tsGreet.
function shiftBundle(
  bundle: {js: string; map: string},
  extraLines: number,
): {js: string; map: string} {
  const banner =
    Array.from(
      {length: extraLines},
      (_, i) => `globalThis.banner${i} = ${i};`,
    ).join('\n') + '\n';
  const map = JSON.parse(bundle.map);
  map.mappings = ';'.repeat(extraLines) + map.mappings;
  return {js: banner + bundle.js, map: JSON.stringify(map)};
}

async function readConsoleMessages(
  context: McpContext,
  args: ParsedArguments,
): Promise<string> {
  const response = new McpResponse(args);
  response.setPage(context.getSelectedMcpPage());
  await listConsoleMessages(args).handler(
    {params: {}, page: context.getSelectedMcpPage()},
    response,
    context,
  );
  const formatted = await response.handle(context);
  return getTextContent(formatted.content[0]);
}

async function waitForConsoleText(
  context: McpContext,
  args: ParsedArguments,
  expected: string,
): Promise<void> {
  try {
    await waitExecutionFor(async () => {
      const text = await readConsoleMessages(context, args);
      if (!text.includes(expected)) {
        throw new Error(`Console messages do not include "${expected}" yet.`);
      }
    }, 5000);
  } catch {
    const text = await readConsoleMessages(context, args);
    throw new Error(
      `Console messages do not include "${expected}". Current console:\n${text}`,
    );
  }
}

function evaluateWithTimeout(
  context: McpContext,
  expression: string,
): Promise<unknown> {
  return Promise.race([
    context.getSelectedMcpPage().pptrPage.evaluate(expression),
    new Promise((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Evaluation timed out: the debugger paused the page'));
      }, 10_000);
    }),
  ]);
}

describe('logpoints', () => {
  const server = serverHooks();

  function setupRoutes() {
    server.addRoute('/app.js', serveAppScript);
    server.addHtmlRoute('/', html`<script src="/app.js"></script>`);
  }

  describe('set_logpoint', () => {
    it('logs the expression when the line executes', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await setLogpoint(args).handler(
          {
            params: {
              url: server.getRoute('/app.js'),
              lineNumber: 2,
              expression: `'greeting for', name`,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.ok(
          response.responseLines[0].includes('[bound]'),
          `Expected a bound logpoint, got: ${response.responseLines[0]}`,
        );

        await page.evaluate(`greet('World')`);
        await waitForConsoleText(context, args, 'greeting for World');
      });
    });

    it('matches script URLs by path suffix', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await setLogpoint(args).handler(
          {
            params: {
              url: 'app.js',
              lineNumber: 2,
              expression: `'suffix match', name`,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.ok(
          response.responseLines[0].includes(server.getRoute('/app.js')),
          `Expected the full script URL, got: ${response.responseLines[0]}`,
        );
        await page.evaluate(`greet('Suffix')`);
        await waitForConsoleText(context, args, 'suffix match Suffix');
      });
    });

    it('keeps logging after a reload', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await setLogpoint(args).handler(
          {
            params: {
              url: server.getRoute('/app.js'),
              lineNumber: 2,
              expression: `'after reload', name`,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        await page.reload();
        await page.evaluate(`greet('Again')`);
        await waitForConsoleText(context, args, 'after reload Again');
      });
    });

    it('does not pause execution on debugger statements', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await setLogpoint(args).handler(
          {
            params: {
              url: server.getRoute('/app.js'),
              lineNumber: 2,
              expression: `'logpoint is set'`,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const result = await evaluateWithTimeout(
          context,
          `withDebuggerStatement()`,
        );
        assert.strictEqual(result, 42);

        // The skip-all-pauses state must survive navigations.
        await page.reload();
        const resultAfterReload = await evaluateWithTimeout(
          context,
          `withDebuggerStatement()`,
        );
        assert.strictEqual(resultAfterReload, 42);
      });
    });

    it('rejects an expression that does not compile', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await assert.rejects(
          setLogpoint(args).handler(
            {
              params: {
                url: server.getRoute('/app.js'),
                lineNumber: 2,
                expression: `'unbalanced', (`,
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
          /does not compile/,
        );
      });
    });

    it('rejects locations that match no script', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await assert.rejects(
          setLogpoint(args).handler(
            {
              params: {
                url: 'nonexistent.js',
                lineNumber: 2,
                expression: `'never'`,
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
          /No parsed script or original source file matches "nonexistent.js".*list_scripts/,
        );
      });
    });

    it('replaces the expression of a logpoint at the same location', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        const params = {
          url: server.getRoute('/app.js'),
          lineNumber: 2,
          expression: `'first', name`,
        };
        await setLogpoint(args).handler(
          {params, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        response.resetResponseLineForTesting();
        await setLogpoint(args).handler(
          {
            params: {...params, expression: `'second', name`},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(
          response.responseLines[0].startsWith('Logpoint 1 at'),
          `Expected the same logpoint id, got: ${response.responseLines[0]}`,
        );

        await page.evaluate(`greet('World')`);
        await waitForConsoleText(context, args, 'second World');
        const text = await readConsoleMessages(context, args);
        assert.ok(
          !text.includes('first World'),
          `Expected the first expression to be replaced, got:\n${text}`,
        );

        response.resetResponseLineForTesting();
        await listLogpoints(args).handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.strictEqual(response.responseLines.length, 1);
      });
    });
  });

  describe('source maps', () => {
    // Serves an html page with a transpiled TypeScript "bundle" whose
    // content can be swapped between navigations via the returned holder.
    function setupBundleRoutes(): {current: {js: string; map: string}} {
      const holder = {current: transpileTsBundle()};
      server.addHtmlRoute('/sm', html`<script src="/bundle.js"></script>`);
      server.addRoute('/bundle.js', (req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        // The bundle is swapped between navigations to simulate a rebuild.
        res.setHeader('Cache-Control', 'no-store');
        res.end(holder.current.js);
      });
      server.addRoute('/app.js.map', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(holder.current.map);
      });
      return holder;
    }

    it('resolves original source locations via source maps', async () => {
      await withMcpContext(async (response, context, args) => {
        setupBundleRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/sm'));

        await setLogpoint(args).handler(
          {
            params: {
              url: 'app.ts',
              lineNumber: 2,
              expression: `'ts greeting', name`,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.ok(
          response.responseLines[0].includes('bound via source map at') &&
            response.responseLines[0].includes('bundle.js'),
          `Expected a bound source-mapped logpoint, got: ${response.responseLines[0]}`,
        );

        await page.evaluate(`tsGreet('SourceMap')`);
        await waitForConsoleText(context, args, 'ts greeting SourceMap');
      });
    });

    it('re-binds after a reload with a regenerated bundle', async () => {
      await withMcpContext(async (response, context, args) => {
        const holder = setupBundleRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/sm'));

        await setLogpoint(args).handler(
          {
            params: {
              url: 'app.ts',
              lineNumber: 2,
              expression: `'ts greeting', name`,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const generatedLine = Number(
          response.responseLines[0].match(/bundle\.js:(\d+):/)?.[1],
        );
        assert.ok(generatedLine > 0, 'Expected a generated line number');

        await page.evaluate(`tsGreet('One')`);
        await waitForConsoleText(context, args, 'ts greeting One');

        // "Rebuild" the bundle: same source, shifted generated locations.
        const extraLines = 5;
        holder.current = shiftBundle(holder.current, extraLines);
        await page.reload();

        // The logpoint re-binds asynchronously when the new source map
        // attaches; wait until the moved generated location is visible.
        await waitExecutionFor(async () => {
          const listResponse = new McpResponse(args);
          await listLogpoints(args).handler(
            {params: {}, page: context.getSelectedMcpPage()},
            listResponse,
            context,
          );
          if (
            !listResponse.responseLines[0].includes(
              `bundle.js:${generatedLine + extraLines}:`,
            )
          ) {
            throw new Error(
              `Logpoint not rebound yet: ${listResponse.responseLines[0]}`,
            );
          }
        }, 5000);

        await page.evaluate(`tsGreet('Two')`);
        await waitForConsoleText(context, args, 'ts greeting Two');
      });
    });

    it('rejects source lines without mapped code', async () => {
      await withMcpContext(async (response, context, args) => {
        setupBundleRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/sm'));

        await assert.rejects(
          setLogpoint(args).handler(
            {
              params: {
                url: 'app.ts',
                lineNumber: 999,
                expression: `'never'`,
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
          /contains no executable code/,
        );

        response.resetResponseLineForTesting();
        await listLogpoints(args).handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.ok(response.responseLines[0].includes('No logpoints are set'));
      });
    });
  });

  describe('list_scripts', () => {
    it('lists scripts and finds original sources by filter', async () => {
      await withMcpContext(async (response, context, args) => {
        server.addHtmlRoute('/sm', html`<script src="/bundle.js"></script>`);
        const bundle = transpileTsBundle();
        server.addRoute('/bundle.js', (req, res) => {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.end(bundle.js);
        });
        server.addRoute('/app.js.map', (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(bundle.map);
        });
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/sm'));

        await listScripts(args).handler(
          {params: {filter: 'app.ts'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        const text = response.responseLines.join('\n');
        assert.ok(
          text.includes('/bundle.js') &&
            text.includes('matching source:') &&
            text.includes('app.ts'),
          `Expected bundle with matching source, got:\n${text}`,
        );
        assert.ok(
          text.includes('[source map: 1 original source(s)]'),
          `Expected source map info, got:\n${text}`,
        );

        response.resetResponseLineForTesting();
        await listScripts(args).handler(
          {
            params: {filter: 'no-such-script-anywhere'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(
          response.responseLines[0].includes('No parsed script'),
          `Expected no-match message, got: ${response.responseLines[0]}`,
        );
      });
    });
  });

  describe('remove_logpoint', () => {
    it('stops logging after removal', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await setLogpoint(args).handler(
          {
            params: {
              url: server.getRoute('/app.js'),
              lineNumber: 2,
              expression: `'before removal'`,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        await page.evaluate(`greet('World')`);
        await waitForConsoleText(context, args, 'before removal');

        response.resetResponseLineForTesting();
        await removeLogpoint(args).handler(
          {params: {id: 1}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.ok(response.responseLines[0].startsWith('Removed Logpoint 1'));

        await page.evaluate(`greet('World')`);
        await page.evaluate(`console.log('sentinel after removal')`);
        await waitForConsoleText(context, args, 'sentinel after removal');

        const text = await readConsoleMessages(context, args);
        const occurrences = text.split('before removal').length - 1;
        assert.strictEqual(
          occurrences,
          1,
          `Expected exactly one logged message, got ${occurrences}:\n${text}`,
        );
      });
    });

    it('removes all logpoints when no id is provided', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        for (const lineNumber of [2, 3]) {
          await setLogpoint(args).handler(
            {
              params: {
                url: server.getRoute('/app.js'),
                lineNumber,
                expression: `'line ${lineNumber}'`,
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        }

        response.resetResponseLineForTesting();
        await listLogpoints(args).handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.strictEqual(response.responseLines.length, 2);

        response.resetResponseLineForTesting();
        await removeLogpoint(args).handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.strictEqual(response.responseLines.length, 2);

        response.resetResponseLineForTesting();
        await listLogpoints(args).handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.ok(response.responseLines[0].includes('No logpoints are set'));
      });
    });

    it('reports an error for an unknown id', async () => {
      await withMcpContext(async (response, context, args) => {
        await assert.rejects(
          removeLogpoint(args).handler(
            {params: {id: 99}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
          /No logpoint found with id 99/,
        );
      });
    });
  });
});
