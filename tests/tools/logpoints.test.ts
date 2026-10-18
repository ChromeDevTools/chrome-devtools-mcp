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
import {LogpointFormatter} from '../../src/formatters/LogpointFormatter.js';
import type {McpContext} from '../../src/McpContext.js';
import {McpResponse} from '../../src/McpResponse.js';
import {listConsoleMessages} from '../../src/tools/console.js';
import {parseLogpoint} from '../../src/LogpointManager.js';
import {setLogpoints} from '../../src/tools/logpoints.js';
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

interface LogpointParams {
  url: string;
  lineNumber: number;
  columnNumber?: number;
  expression: string;
}

function formatLogpointParam(logpoint: LogpointParams): string {
  const column =
    logpoint.columnNumber === undefined ? '' : `:${logpoint.columnNumber}`;
  return `${logpoint.url}:${logpoint.lineNumber}${column} ${logpoint.expression}`;
}

async function callSetLogpoints(
  context: McpContext,
  args: ParsedArguments,
  logpoints: LogpointParams[],
): Promise<McpResponse> {
  const response = new McpResponse(args);
  await setLogpoints(args).handler(
    {
      params: {logpoints: logpoints.map(formatLogpointParam)},
      page: context.getSelectedMcpPage(),
    },
    response,
    context,
  );
  return response;
}

describe('logpoints', () => {
  const server = serverHooks();

  function setupRoutes() {
    server.addRoute('/app.js', serveAppScript);
    server.addHtmlRoute('/', html`<script src="/app.js"></script>`);
  }

  describe('set_logpoints', () => {
    it('logs the expression when the line executes', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        response = await callSetLogpoints(context, args, [
          {
            url: server.getRoute('/app.js'),
            lineNumber: 2,
            expression: `'greeting for', name`,
          },
        ]);

        assert.ok(
          response.responseLines[0].includes('1 logpoint(s)') &&
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

        response = await callSetLogpoints(context, args, [
          {url: 'app.js', lineNumber: 2, expression: `'suffix match', name`},
        ]);

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

        await callSetLogpoints(context, args, [
          {
            url: server.getRoute('/app.js'),
            lineNumber: 2,
            expression: `'after reload', name`,
          },
        ]);

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

        await callSetLogpoints(context, args, [
          {
            url: server.getRoute('/app.js'),
            lineNumber: 2,
            expression: `'logpoint is set'`,
          },
        ]);

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
          callSetLogpoints(context, args, [
            {
              url: server.getRoute('/app.js'),
              lineNumber: 2,
              expression: `'unbalanced', (`,
            },
          ]),
          /does not compile/,
        );
      });
    });

    it('rejects locations that match no script and suggests similar files', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await assert.rejects(
          callSetLogpoints(context, args, [
            {url: 'nonexistent.js', lineNumber: 2, expression: `'never'`},
          ]),
          /No parsed script or original source file matches "nonexistent.js"/,
        );
        await assert.rejects(
          callSetLogpoints(context, args, [
            {url: 'other/app.js', lineNumber: 2, expression: `'never'`},
          ]),
          new RegExp(
            `Sources with the same file name: ${server.getRoute('/app.js')}`,
          ),
        );
      });
    });

    it('replaces the expression of a logpoint at the same location', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        const location = {url: server.getRoute('/app.js'), lineNumber: 2};
        await callSetLogpoints(context, args, [
          {...location, expression: `'first', name`},
        ]);
        response = await callSetLogpoints(context, args, [
          {...location, expression: `'second', name`},
        ]);
        assert.ok(
          response.responseLines[0].includes('1 logpoint(s)') &&
            response.responseLines[0].includes("`'second', name`"),
          `Expected one logpoint with the new expression, got: ${response.responseLines[0]}`,
        );

        await page.evaluate(`greet('World')`);
        await waitForConsoleText(context, args, 'second World');
        const text = await readConsoleMessages(context, args);
        assert.ok(
          !text.includes('first World'),
          `Expected the first expression to be replaced, got:\n${text}`,
        );
      });
    });

    it('removes logpoints that are left out of the list', async () => {
      await withMcpContext(async (response, context, args) => {
        setupRoutes();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        const url = server.getRoute('/app.js');
        response = await callSetLogpoints(context, args, [
          {url, lineNumber: 2, expression: `'line 2'`},
          {url, lineNumber: 3, expression: `'line 3'`},
        ]);
        assert.ok(
          response.responseLines[0].includes('2 logpoint(s)'),
          `Expected two logpoints, got: ${response.responseLines[0]}`,
        );

        // Keep only line 3; line 2 must stop logging.
        response = await callSetLogpoints(context, args, [
          {url, lineNumber: 3, expression: `'line 3'`},
        ]);
        assert.ok(
          response.responseLines[0].includes('1 logpoint(s)') &&
            !response.responseLines[0].includes(`${url}:2 `),
          `Expected only line 3, got: ${response.responseLines[0]}`,
        );

        await page.evaluate(`greet('World')`);
        await waitForConsoleText(context, args, 'line 3');
        const text = await readConsoleMessages(context, args);
        assert.ok(
          !text.includes('line 2'),
          `Expected line 2 to be removed, got:\n${text}`,
        );

        // An empty list removes all logpoints.
        response = await callSetLogpoints(context, args, []);
        assert.ok(
          response.responseLines[0].includes('No logpoints are set'),
          `Expected no logpoints, got: ${response.responseLines[0]}`,
        );
        await page.evaluate(`greet('World')`);
        await page.evaluate(`console.log('sentinel after removal')`);
        await waitForConsoleText(context, args, 'sentinel after removal');
        const occurrences =
          (await readConsoleMessages(context, args)).split('line 3').length - 1;
        assert.strictEqual(occurrences, 1);
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

        response = await callSetLogpoints(context, args, [
          {url: 'app.ts', lineNumber: 2, expression: `'ts greeting', name`},
        ]);

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

        response = await callSetLogpoints(context, args, [
          {url: 'app.ts', lineNumber: 2, expression: `'ts greeting', name`},
        ]);
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
          const text = new LogpointFormatter(
            context.getSelectedMcpPage().getLogpoints(),
          ).toString();
          if (!text.includes(`bundle.js:${generatedLine + extraLines}:`)) {
            throw new Error(`Logpoint not rebound yet: ${text}`);
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
          callSetLogpoints(context, args, [
            {url: 'app.ts', lineNumber: 999, expression: `'never'`},
          ]),
          /No executable code at .*app\.ts:999/,
        );
        assert.strictEqual(
          context.getSelectedMcpPage().getLogpoints().length,
          0,
        );
      });
    });
  });

  describe('parseLogpoint', () => {
    it('parses locations with ports, columns and expressions', () => {
      assert.deepStrictEqual(
        parseLogpoint(`http://127.0.0.1:16552/app.js:2 'greeting for', name`),
        {
          url: 'http://127.0.0.1:16552/app.js',
          lineNumber: 2,
          expression: `'greeting for', name`,
        },
      );
      assert.deepStrictEqual(parseLogpoint('src/app.ts:42:7 cart.total'), {
        url: 'src/app.ts',
        lineNumber: 42,
        columnNumber: 7,
        expression: 'cart.total',
      });
      assert.throws(() => parseLogpoint('src/app.ts cart.total'), /format/);
      assert.throws(() => parseLogpoint('src/app.ts:0 x'), /1-based/);
    });
  });

  describe('LogpointFormatter', () => {
    it('formats toString from toJSON', () => {
      const formatter = new LogpointFormatter([
        {
          url: 'http://example.com/src/app.ts',
          lineNumber: 2,
          expression: `'x', x`,
          sourceMapped: true,
          generatedLocations: [
            {
              url: 'http://example.com/bundle.js',
              lineNumber: 7,
              columnNumber: 3,
            },
          ],
        },
        {
          url: 'http://example.com/app.js',
          lineNumber: 4,
          columnNumber: 10,
          expression: `'y'`,
          sourceMapped: false,
          generatedLocations: [],
        },
      ]);
      assert.deepStrictEqual(formatter.toJSON(), [
        {
          url: 'http://example.com/src/app.ts',
          lineNumber: 2,
          expression: `'x', x`,
          sourceMapped: true,
          generatedLocations: [
            {
              url: 'http://example.com/bundle.js',
              lineNumber: 7,
              columnNumber: 3,
            },
          ],
        },
        {
          url: 'http://example.com/app.js',
          lineNumber: 4,
          columnNumber: 10,
          expression: `'y'`,
          sourceMapped: false,
          generatedLocations: [],
        },
      ]);
      assert.strictEqual(
        formatter.toString(),
        [
          '2 logpoint(s) set on the page:',
          "- http://example.com/src/app.ts:2 logging `'x', x` [bound via source map at http://example.com/bundle.js:7:3]",
          "- http://example.com/app.js:4:10 logging `'y'` [not bound (no parsed script contains the location)]",
        ].join('\n'),
      );
      assert.strictEqual(
        new LogpointFormatter([]).toString(),
        'No logpoints are set on the page.',
      );
    });
  });
});
