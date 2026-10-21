/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {describe, it} from 'node:test';

import ts from 'typescript';

import type {Logpoint, LogpointOptions} from '../src/LogpointManager.js';
import {
  LogpointError,
  parseLogpoint,
  validateExpression,
} from '../src/LogpointManager.js';
import type {McpPage} from '../src/McpPage.js';
import {serverHooks} from './server.js';
import {html, waitExecutionFor, withMcpContext} from './utils.js';

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

/** Collects console messages of the page from now on. */
function collectConsole(page: McpPage): string[] {
  const messages: string[] = [];
  page.pptrPage.on('console', message => {
    messages.push(message.text());
  });
  return messages;
}

async function waitForMessage(
  messages: string[],
  expected: string,
): Promise<void> {
  await waitExecutionFor(async () => {
    if (!messages.includes(expected)) {
      throw new Error(
        `Console messages do not include "${expected}" yet: ${JSON.stringify(messages)}`,
      );
    }
  }, 5000);
}

function evaluateWithTimeout(
  page: McpPage,
  expression: string,
): Promise<unknown> {
  return Promise.race([
    page.pptrPage.evaluate(expression),
    new Promise((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Evaluation timed out: the debugger paused the page'));
      }, 10_000);
    }),
  ]);
}

function assertLogpoint(
  actual: Logpoint,
  expected: Omit<Logpoint, 'generatedLocations'> & {
    generatedUrl: string;
    generatedLineNumber: number;
  },
): void {
  const {generatedUrl, generatedLineNumber, ...rest} = expected;
  const {generatedLocations, ...actualRest} = actual;
  assert.deepStrictEqual(actualRest, rest);
  assert.strictEqual(generatedLocations.length, 1);
  assert.strictEqual(generatedLocations[0].url, generatedUrl);
  assert.strictEqual(generatedLocations[0].lineNumber, generatedLineNumber);
}

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
  });

  it('rejects a missing location or 0-based numbers', () => {
    assert.throws(() => parseLogpoint('src/app.ts cart.total'), /format/);
    assert.throws(() => parseLogpoint('src/app.ts:0 x'), /1-based/);
    assert.throws(() => parseLogpoint('src/app.ts:4:0 x'), /1-based/);
  });
});

describe('validateExpression', () => {
  it('accepts console.log style arguments and rejects syntax errors', () => {
    assert.doesNotThrow(() => validateExpression(`'total:', cart.total`));
    assert.throws(
      () => validateExpression(`'unbalanced', (`),
      /does not compile/,
    );
  });
});

describe('LogpointManager', () => {
  const server = serverHooks();

  function setupRoutes() {
    server.addRoute('/app.js', serveAppScript);
    server.addHtmlRoute('/', html`<script src="/app.js"></script>`);
  }

  // Serves an html page with a transpiled TypeScript "bundle" whose content
  // can be swapped between navigations via the returned holder.
  function setupBundleRoutes(): {current: {js: string; map: string}} {
    const holder = {current: transpileTsBundle()};
    server.addHtmlRoute('/sm', html`<script src="/bundle.js"></script>`);
    server.addRoute('/bundle.js', (req, res) => {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
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

  it('logs without pausing, matches path suffixes and survives reloads', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      const page = context.getSelectedMcpPage();
      await page.pptrPage.goto(server.getRoute('/'));
      const messages = collectConsole(page);
      const url = server.getRoute('/app.js');

      const logpoints = await page.setLogpoints([
        {url: 'app.js', lineNumber: 2, expression: `'greeting for', name`},
      ]);

      assert.strictEqual(logpoints.length, 1);
      assertLogpoint(logpoints[0], {
        url,
        lineNumber: 2,
        // DevTools normalizes a missing column to the first column.
        columnNumber: 1,
        expression: `'greeting for', name`,
        sourceMapped: false,
        generatedUrl: url,
        generatedLineNumber: 2,
      });

      await page.pptrPage.evaluate(`greet('World')`);
      await waitForMessage(messages, 'greeting for World');

      // Breakpoint conditions must not turn `debugger;` into a pause.
      assert.strictEqual(
        await evaluateWithTimeout(page, `withDebuggerStatement()`),
        42,
      );

      await page.pptrPage.reload();
      await page.pptrPage.evaluate(`greet('Again')`);
      await waitForMessage(messages, 'greeting for Again');
      assert.strictEqual(
        await evaluateWithTimeout(page, `withDebuggerStatement()`),
        42,
      );
    });
  });

  it('replaces, removes and clears logpoints with the complete list', async () => {
    await withMcpContext(async (response, context) => {
      setupRoutes();
      const page = context.getSelectedMcpPage();
      await page.pptrPage.goto(server.getRoute('/'));
      const messages = collectConsole(page);
      const url = server.getRoute('/app.js');
      const line2: LogpointOptions = {url, lineNumber: 2, expression: `'two'`};
      const line3: LogpointOptions = {
        url,
        lineNumber: 3,
        expression: `'three'`,
      };

      assert.strictEqual((await page.setLogpoints([line2, line3])).length, 2);

      // Keep line 3 with a new expression; line 2 must stop logging.
      const replaced = await page.setLogpoints([
        {...line3, expression: `'three replaced'`},
      ]);
      assert.strictEqual(replaced.length, 1);
      assert.strictEqual(replaced[0].lineNumber, 3);
      assert.strictEqual(replaced[0].expression, `'three replaced'`);

      await page.pptrPage.evaluate(`greet('World')`);
      await waitForMessage(messages, 'three replaced');
      assert.ok(!messages.includes('two'), `Line 2 still logged: ${messages}`);
      assert.ok(
        !messages.includes('three'),
        `Old expression logged: ${messages}`,
      );

      assert.deepStrictEqual(await page.setLogpoints([]), []);
      await page.pptrPage.evaluate(`greet('World')`);
      await page.pptrPage.evaluate(`console.log('sentinel')`);
      await waitForMessage(messages, 'sentinel');
      assert.strictEqual(
        messages.filter(message => message === 'three replaced').length,
        1,
      );
    });
  });

  it('resolves original sources and re-binds after a rebuilt bundle', async () => {
    await withMcpContext(async (response, context) => {
      const holder = setupBundleRoutes();
      const page = context.getSelectedMcpPage();
      await page.pptrPage.goto(server.getRoute('/sm'));
      const messages = collectConsole(page);
      const options: LogpointOptions = {
        url: 'app.ts',
        lineNumber: 2,
        expression: `'ts greeting', name`,
      };

      const [logpoint] = await page.setLogpoints([options]);
      assert.strictEqual(logpoint.sourceMapped, true);
      assert.ok(
        logpoint.url.endsWith('/app.ts'),
        `Expected the source map URL, got ${logpoint.url}`,
      );
      assert.strictEqual(logpoint.generatedLocations.length, 1);
      const generated = logpoint.generatedLocations[0];
      assert.strictEqual(generated.url, server.getRoute('/bundle.js'));

      await page.pptrPage.evaluate(`tsGreet('One')`);
      await waitForMessage(messages, 'ts greeting One');

      // "Rebuild" the bundle: same source, shifted generated locations.
      const extraLines = 5;
      holder.current = shiftBundle(holder.current, extraLines);
      await page.pptrPage.reload();

      // The breakpoint manager re-binds once the new source map attaches.
      await waitExecutionFor(async () => {
        const [current] = await page.setLogpoints([options]);
        const location = current.generatedLocations[0];
        if (location?.lineNumber !== generated.lineNumber + extraLines) {
          throw new Error(
            `Not rebound yet: ${JSON.stringify(current.generatedLocations)}`,
          );
        }
      }, 5000);

      await page.pptrPage.evaluate(`tsGreet('Two')`);
      await waitForMessage(messages, 'ts greeting Two');
    });
  });

  it('reports unknown, ambiguous and non-executable locations', async () => {
    await withMcpContext(async (response, context) => {
      setupBundleRoutes();
      const page = context.getSelectedMcpPage();
      await page.pptrPage.goto(server.getRoute('/sm'));
      const bundleUrl = server.getRoute('/bundle.js');

      await assert.rejects(
        page.setLogpoints([
          {url: 'nonexistent.js', lineNumber: 2, expression: `'never'`},
        ]),
        new RegExp(
          `^Error: No parsed script or original source file matches "nonexistent.js"`,
        ),
      );
      await assert.rejects(
        page.setLogpoints([
          {url: 'other/bundle.js', lineNumber: 2, expression: `'never'`},
        ]),
        new RegExp(`Sources with the same file name: ${bundleUrl}\\.$`),
      );

      // A valid logpoint is applied even when another one has no code.
      await assert.rejects(
        page.setLogpoints([
          {url: 'app.ts', lineNumber: 2, expression: `'ok'`},
          {url: 'app.ts', lineNumber: 999, expression: `'never'`},
        ]),
        (error: unknown) => {
          assert.ok(error instanceof LogpointError);
          assert.match(error.message, /No executable code at .*app\.ts:999 /);
          assert.strictEqual(error.logpoints.length, 1);
          assert.strictEqual(error.logpoints[0].lineNumber, 2);
          return true;
        },
      );
      assert.strictEqual(
        (
          await page.setLogpoints([
            {url: 'app.ts', lineNumber: 2, expression: `'ok'`},
          ])
        ).length,
        1,
      );
    });
  });

  it('merges locations that normalize to the same breakpoint', async () => {
    await withMcpContext(async (response, context) => {
      setupBundleRoutes();
      const page = context.getSelectedMcpPage();
      await page.pptrPage.goto(server.getRoute('/sm'));
      const messages = collectConsole(page);
      const authored: LogpointOptions = {
        url: 'app.ts',
        lineNumber: 2,
        expression: `'authored', name`,
      };

      const [first] = await page.setLogpoints([authored]);
      const [generated] = first.generatedLocations;

      // The generated location normalizes to the authored one, so both
      // requests end up as one breakpoint whose expression is the last one.
      const merged = await page.setLogpoints([
        authored,
        {
          url: generated.url,
          lineNumber: generated.lineNumber,
          columnNumber: generated.columnNumber,
          expression: `'generated', name`,
        },
      ]);
      assert.strictEqual(merged.length, 1);
      assert.strictEqual(merged[0].url, first.url);
      assert.strictEqual(merged[0].expression, `'generated', name`);

      await page.pptrPage.evaluate(`tsGreet('One')`);
      await waitForMessage(messages, 'generated One');
      assert.ok(
        !messages.includes('authored One'),
        `Logged twice: ${messages}`,
      );

      // Dropping both keys removes the shared breakpoint.
      assert.deepStrictEqual(await page.setLogpoints([]), []);
      await page.pptrPage.evaluate(`tsGreet('Two')`);
      await page.pptrPage.evaluate(`console.log('sentinel')`);
      await waitForMessage(messages, 'sentinel');
      assert.ok(!messages.includes('generated Two'), `Still logs: ${messages}`);
    });
  });
});
