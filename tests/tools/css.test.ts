/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseArguments} from '../../src/config/mcp-options.js';
import type {McpContext} from '../../src/McpContext.js';
import type {McpPage} from '../../src/McpPage.js';
import {McpResponse} from '../../src/McpResponse.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import type {MatchedRule} from '../../src/formatters/CssFormatter.js';
import {getCssStyles} from '../../src/tools/css.js';
import type {TextSnapshotNode} from '../../src/types.js';
import {serverHooks} from '../server.js';
import {getTextContent, html, withMcpContext} from '../utils.js';

async function getUidForNode(
  target: McpContext | McpPage,
  matcher: string | ((node: TextSnapshotNode) => boolean),
): Promise<string> {
  const mcpPage =
    'getSelectedMcpPage' in target ? target.getSelectedMcpPage() : target;
  mcpPage.textSnapshot = await TextSnapshot.create(mcpPage);
  const predicate =
    typeof matcher === 'string'
      ? (node: TextSnapshotNode) => node.name?.includes(matcher) ?? false
      : matcher;
  for (const [uid, node] of mcpPage.textSnapshot.idToNode) {
    if (predicate(node)) {
      return uid;
    }
  }
  throw new Error('Target element UID not found in snapshot');
}

async function fetchStyles(
  context: McpContext,
  params: {uid: string; pageSize?: number; pageIdx?: number},
) {
  const mcpPage = context.getSelectedMcpPage();
  const response = new McpResponse(parseArguments('1.0.0', []));
  response.setPage(mcpPage);
  await getCssStyles.handler({params, page: mcpPage}, response, context);
  const formatted = await response.handle(context);
  return {
    output: getTextContent(formatted.content[0]),
    structuredContent: formatted.structuredContent,
  };
}

function assertIncludes(text: string, ...substrings: string[]): void {
  for (const sub of substrings) {
    assert.ok(text.includes(sub), `Expected output to include "${sub}"`);
  }
}

function assertExcludes(text: string, ...substrings: string[]): void {
  for (const sub of substrings) {
    assert.ok(!text.includes(sub), `Expected output not to include "${sub}"`);
  }
}

function isMatchedRule(rule: unknown): rule is MatchedRule {
  return (
    typeof rule === 'object' &&
    rule !== null &&
    'type' in rule &&
    rule.type === 'matched'
  );
}

function findMatchedRule(
  structuredContent: unknown,
  predicate?: (rule: MatchedRule) => boolean,
): MatchedRule {
  assert.ok(structuredContent && typeof structuredContent === 'object');
  assert.ok('matchedStyles' in structuredContent);
  const matchedStyles = structuredContent.matchedStyles;
  assert.ok(
    matchedStyles &&
      typeof matchedStyles === 'object' &&
      'rules' in matchedStyles &&
      Array.isArray(matchedStyles.rules),
  );
  for (const rule of matchedStyles.rules) {
    if (isMatchedRule(rule) && (!predicate || predicate(rule))) {
      return rule;
    }
  }
  throw new Error('Expected to find a matching rule');
}

describe('css', () => {
  const server = serverHooks();

  async function openPage(context: McpContext, route: string) {
    const page = context.getSelectedMcpPage().pptrPage;
    await page.goto(server.getRoute(route));
    return page;
  }

  it('retrieves inline and matched author styles with property status', async () => {
    server.addHtmlRoute(
      '/styles_test.html',
      html`
        <style>
          .btn-primary {
            color: blue;
            font-size: 14px;
          }
          #my-button {
            color: green;
          }
        </style>
        <button
          id="my-button"
          class="btn-primary"
          style="font-size: 16px; padding: 8px;"
        >
          Click Me
        </button>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/styles_test.html');
      const uid = await getUidForNode(context, 'Click Me');
      const {output} = await fetchStyles(context, {uid});
      assertIncludes(
        output,
        'Styles for button#my-button',
        'element.style {',
        'font-size: 16px;',
        'padding: 8px;',
        '#my-button',
        'color: green;',
        '.btn-primary',
        'font-size: 14px;',
      );
    });
  });

  it('returns inherited properties from ancestors while filtering non-inheritable ones', async () => {
    server.addHtmlRoute(
      '/inherited_test.html',
      html`
        <style>
          body {
            font-family: monospace;
            color: rgb(50, 50, 50);
            margin: 30px;
          }
          .card {
            font-size: 18px;
            padding: 20px;
          }
        </style>
        <div class="card">
          <p id="target-paragraph">Paragraph content</p>
        </div>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/inherited_test.html');
      const uid = await getUidForNode(context, 'Paragraph content');
      const {output} = await fetchStyles(context, {uid});
      assertIncludes(output, 'Inherited from ', 'font-family: monospace;');
      assertExcludes(output, 'margin: 30px;', 'padding: 20px;');
    });
  });

  it('retrieves styles for pseudo-elements such as ::before and ::after', async () => {
    server.addHtmlRoute(
      '/pseudo_elements_test.html',
      html`
        <style>
          .tooltip::before {
            content: '⭐';
            color: gold;
            display: inline-block;
          }
          .tooltip::after {
            content: '🔍';
            font-size: 12px;
          }
        </style>
        <span class="tooltip">Helpful Info</span>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/pseudo_elements_test.html');
      const uid = await getUidForNode(context, 'Helpful Info');
      const {output} = await fetchStyles(context, {uid});
      assertIncludes(
        output,
        '::before {',
        'color: gold;',
        '::after {',
        'font-size: 12px;',
      );
    });
  });

  it('retrieves active pseudo-class styles when element state is triggered', async () => {
    server.addHtmlRoute(
      '/pseudo_classes_test.html',
      html`
        <style>
          .interactive-btn {
            background-color: white;
            color: black;
          }
          .interactive-btn:focus {
            outline: 2px solid red;
            background-color: yellow;
          }
        </style>
        <button
          id="test-btn"
          class="interactive-btn"
          >Action Button</button
        >
      `,
    );

    await withMcpContext(async (_, context) => {
      const page = await openPage(context, '/pseudo_classes_test.html');
      await page.focus('#test-btn');

      const uid = await getUidForNode(context, 'Action Button');
      const {output} = await fetchStyles(context, {uid});
      assertIncludes(
        output,
        '.interactive-btn:focus',
        'background-color: yellow;',
      );
    });
  });

  it('retrieves styles for nodes inside open shadow roots', async () => {
    server.addHtmlRoute(
      '/open_shadow_test.html',
      html`
        <div id="open-host"></div>
        <script>
          const openHost = document.getElementById('open-host');
          const openRoot = openHost.attachShadow({mode: 'open'});
          openRoot.innerHTML = \`
            <style>
              .shadow-btn-open {
                color: rgb(100, 200, 50);
                font-weight: bold;
              }
            </style>
            <button class="shadow-btn-open">Open Shadow Button</button>
          \`;
        </script>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/open_shadow_test.html');
      const uid = await getUidForNode(context, 'Open Shadow Button');
      const {output} = await fetchStyles(context, {uid});
      assertIncludes(output, '.shadow-btn-open', 'color: rgb(100, 200, 50);');
    });
  });

  it('retrieves styles for nodes inside closed shadow roots', async () => {
    server.addHtmlRoute(
      '/closed_shadow_test.html',
      html`
        <div id="closed-host"></div>
        <script>
          const closedHost = document.getElementById('closed-host');
          const closedRoot = closedHost.attachShadow({mode: 'closed'});
          closedRoot.innerHTML = \`
            <style>
              .shadow-btn-closed {
                color: rgb(200, 50, 100);
                font-style: italic;
              }
            </style>
            <button class="shadow-btn-closed">Closed Shadow Button</button>
          \`;
        </script>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/closed_shadow_test.html');
      const uid = await getUidForNode(context, 'Closed Shadow Button');
      const {output} = await fetchStyles(context, {uid});
      assertIncludes(output, '.shadow-btn-closed', 'color: rgb(200, 50, 100);');
    });
  });

  it('retrieves styles for nodes inside iframes', async () => {
    server.addHtmlRoute(
      '/iframe_content.html',
      html`
        <style>
          .frame-btn {
            background-color: purple;
            color: white;
          }
        </style>
        <button
          id="iframe-btn"
          class="frame-btn"
          >Iframe Button</button
        >
      `,
    );

    server.addHtmlRoute(
      '/iframe_host.html',
      html`
        <h1>Main Host</h1>
        <iframe
          id="child-frame"
          src="/iframe_content.html"
        ></iframe>
      `,
    );

    await withMcpContext(async (_, context) => {
      const page = await openPage(context, '/iframe_host.html');
      const frame = await page.waitForFrame(
        f => f.url() === server.getRoute('/iframe_content.html'),
      );
      await frame.waitForSelector('#iframe-btn');

      const uid = await getUidForNode(context, 'Iframe Button');
      const {output} = await fetchStyles(context, {uid});
      assertIncludes(output, '.frame-btn', 'background-color: purple;');
    });
  });

  it('supports pagination over matched rules and style units', async () => {
    server.addHtmlRoute(
      '/pagination_test.html',
      html`
        <style>
          .rule1 {
            color: red;
          }
          .rule2 {
            background-color: blue;
          }
          .rule3 {
            font-size: 14px;
          }
          .rule4 {
            padding: 10px;
          }
          .rule5 {
            margin: 5px;
          }
        </style>
        <button
          id="paginated-btn"
          class="rule1 rule2 rule3 rule4 rule5"
        >
          Multi Rule Button
        </button>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/pagination_test.html');
      const uid = await getUidForNode(context, 'Multi Rule Button');

      // Page 0 with pageSize: 2
      const page0 = await fetchStyles(context, {
        uid,
        pageSize: 2,
        pageIdx: 0,
      });
      assertIncludes(page0.output, 'Showing 1-2 of', 'Next page: 1');
      assert.ok('pagination' in page0.structuredContent);

      // Page 1 with pageSize: 2
      const page1 = await fetchStyles(context, {
        uid,
        pageSize: 2,
        pageIdx: 1,
      });
      assertIncludes(page1.output, 'Showing 3-4 of', 'Previous page: 0');

      // Invalid page number fallback
      const invalidPage = await fetchStyles(context, {
        uid,
        pageSize: 2,
        pageIdx: 99,
      });
      assertIncludes(
        invalidPage.output,
        'Invalid page number provided. Showing first page.',
      );
    });
  });

  it('retrieves nested CSS rules with resolvedSelector', async () => {
    server.addHtmlRoute(
      '/nested_css_test.html',
      html`
        <style>
          .card-container {
            & .nested-btn {
              color: rgb(220, 20, 60);
              font-weight: bold;
            }
          }
        </style>
        <div class="card-container">
          <button class="nested-btn">Nested Button</button>
        </div>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/nested_css_test.html');
      const uid = await getUidForNode(context, 'Nested Button');
      const {output, structuredContent} = await fetchStyles(context, {uid});
      assertIncludes(
        output,
        '/* resolved: :is(.card-container) .nested-btn */',
        '& .nested-btn',
        'color: rgb(220, 20, 60);',
      );

      const matchedRule = findMatchedRule(structuredContent);
      assert.strictEqual(matchedRule.selector, '& .nested-btn');
      assert.strictEqual(
        matchedRule.resolvedSelector,
        ':is(.card-container) .nested-btn',
      );
    });
  });

  it('retrieves styles from constructed stylesheets (new CSSStyleSheet)', async () => {
    server.addHtmlRoute(
      '/constructed_styles_test.html',
      html`
        <button id="adopted-btn">Adopted Button</button>
        <script>
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(
            '#adopted-btn { color: rgb(128, 0, 128); font-size: 18px; }',
          );
          document.adoptedStyleSheets = [sheet];
        </script>
      `,
    );

    await withMcpContext(async (_, context) => {
      await openPage(context, '/constructed_styles_test.html');
      const uid = await getUidForNode(context, 'Adopted Button');
      const {output, structuredContent} = await fetchStyles(context, {uid});
      assertIncludes(
        output,
        '#adopted-btn (constructed stylesheet) {',
        'color: rgb(128, 0, 128);',
        'font-size: 18px;',
      );

      const matchedRule = findMatchedRule(structuredContent);
      assert.strictEqual(matchedRule.source, 'constructed stylesheet');
    });
  });
});
