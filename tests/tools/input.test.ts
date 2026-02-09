/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {McpResponse} from '../../src/McpResponse.js';
import {
  click,
  hover,
  type,
  drag,
  hotkeyTool,
  scroll,
} from '../../src/tools/input.js';
import {parseKey} from '../../src/utils/keyboard.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('input', () => {
  const server = serverHooks();

  describe('click', () => {
    it('clicks', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        await context.createTextSnapshot();
        await click.handler(
          {
            params: {
              uid: '1_1',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.ok(response.includeSnapshot);
        assert.ok(await page.$('text/clicked'));
      });
    });
    it('double clicks', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<button ondblclick="this.innerText = 'dblclicked';"
            >test</button
          >`,
        );
        await context.createTextSnapshot();
        await click.handler(
          {
            params: {
              uid: '1_1',
              dblClick: true,
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully double clicked on the element',
        );
        assert.ok(response.includeSnapshot);
        assert.ok(await page.$('text/dblclicked'));
      });
    });
    it('waits for navigation', async () => {
      const resolveNavigation = Promise.withResolvers<void>();
      server.addHtmlRoute(
        '/link',
        html`<a href="/navigated">Navigate page</a>`,
      );
      server.addRoute('/navigated', async (_req, res) => {
        await resolveNavigation.promise;
        res.write(html`<main>I was navigated</main>`);
        res.end();
      });

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/link'));
        await context.createTextSnapshot();
        const clickPromise = click.handler(
          {
            params: {
              uid: '1_1',
            },
          },
          response,
          context,
        );
        const [t1, t2] = await Promise.all([
          clickPromise.then(() => Date.now()),
          new Promise<number>(res => {
            setTimeout(() => {
              resolveNavigation.resolve();
              res(Date.now());
            }, 300);
          }),
        ]);

        assert(t1 > t2, 'Waited for navigation');
      });
    });

    it('waits for stable DOM', async () => {
      server.addHtmlRoute(
        '/unstable',
        html`
          <button>Click to change to see time</button>
          <script>
            const button = document.querySelector('button');
            button.addEventListener('click', () => {
              setTimeout(() => {
                button.textContent = Date.now();
              }, 50);
            });
          </script>
        `,
      );
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/unstable'));
        await context.createTextSnapshot();
        const handlerResolveTime = await click
          .handler(
            {
              params: {
                uid: '1_1',
              },
            },
            response,
            context,
          )
          .then(() => Date.now());
        const buttonChangeTime = await page.evaluate(() => {
          const button = document.querySelector('button');
          return Number(button?.textContent);
        });

        assert(handlerResolveTime > buttonChangeTime, 'Waited for navigation');
      });
    });

    it('does not include snapshot by default', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        await context.createTextSnapshot();
        await click.handler(
          {
            params: {
              uid: '1_1',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.strictEqual(response.snapshotParams, undefined);
      });
    });

    it('includes snapshot if includeSnapshot is true', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        await context.createTextSnapshot();
        await click.handler(
          {
            params: {
              uid: '1_1',
              includeSnapshot: true,
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.notStrictEqual(response.snapshotParams, undefined);
      });
    });
  });

  describe('hover', () => {
    it('hovers', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<button onmouseover="this.innerText = 'hovered';">test</button>`,
        );
        await context.createTextSnapshot();
        await hover.handler(
          {
            params: {
              uid: '1_1',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully hovered over the element',
        );
        assert.ok(response.includeSnapshot);
        assert.ok(await page.$('text/hovered'));
      });
    });
  });

  describe('type', () => {
    it('fills out an input', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(html`<input />`);
        await context.createTextSnapshot();
        await type.handler(
          {
            params: {
              uid: '1_1',
              value: 'test',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully filled out the element',
        );
        assert.ok(response.includeSnapshot);
        assert.ok(await page.$('text/test'));
      });
    });

    it('fills out a select by text', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<select
            ><option value="v1">one</option
            ><option value="v2">two</option></select
          >`,
        );
        await context.createTextSnapshot();
        await type.handler(
          {
            params: {
              uid: '1_1',
              value: 'two',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully filled out the element',
        );
        assert.ok(response.includeSnapshot);
        const selectedValue = await page.evaluate(
          () => document.querySelector('select')!.value,
        );
        assert.strictEqual(selectedValue, 'v2');
      });
    });

    it('fills out a textarea with long text', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(html`<textarea />`);
        await page.focus('textarea');
        await context.createTextSnapshot();
        await page.setDefaultTimeout(1000);
        await type.handler(
          {
            params: {
              uid: '1_1',
              value: '1'.repeat(3000),
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully filled out the element',
        );
        assert.ok(response.includeSnapshot);
        assert.ok(
          await page.evaluate(() => {
            return (
              document.body.querySelector('textarea')?.value.length === 3_000
            );
          }),
        );
      });
    });

    it('reproduction: type isolation', async () => {
      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<form>
            <input
              id="email"
              value="user@test.com"
            />
            <input
              id="password"
              type="password"
            />
          </form>`,
        );
        await context.createTextSnapshot();

        // Fill email
        const response1 = new McpResponse();
        await type.handler(
          {
            params: {
              uid: '1_1', // email input
              value: 'new@test.com',
            },
          },
          response1,
          context,
        );
        assert.strictEqual(
          response1.responseLines[0],
          'Successfully filled out the element',
        );

        // Fill password
        const response2 = new McpResponse();
        await type.handler(
          {
            params: {
              uid: '1_2', // password input
              value: 'secret',
            },
          },
          response2,
          context,
        );
        assert.strictEqual(
          response2.responseLines[0],
          'Successfully filled out the element',
        );

        // Verify values
        const values = await page.evaluate(() => {
          return {
            email: (document.getElementById('email') as HTMLInputElement).value,
            password: (document.getElementById('password') as HTMLInputElement)
              .value,
          };
        });

        assert.strictEqual(
          values.email,
          'new@test.com',
          'Email should be updated correctly',
        );
        assert.strictEqual(
          values.password,
          'secret',
          'Password should be updated correctly',
        );
      });
    });
  });

  describe('drags', () => {
    it('drags one element onto another', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<div
              role="button"
              id="drag"
              draggable="true"
              >drag me</div
            >
            <div
              id="drop"
              aria-label="drop"
              style="width: 100px; height: 100px; border: 1px solid black;"
              ondrop="this.innerText = 'dropped';"
            >
            </div>
            <script>
              drag.addEventListener('dragstart', event => {
                event.dataTransfer.setData('text/plain', event.target.id);
              });
              drop.addEventListener('dragover', event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              });
              drop.addEventListener('drop', event => {
                event.preventDefault();
                const data = event.dataTransfer.getData('text/plain');
                event.target.appendChild(document.getElementById(data));
              });
            </script>`,
        );
        await context.createTextSnapshot();
        await drag.handler(
          {
            params: {
              from_uid: '1_1',
              to_uid: '1_2',
            },
          },
          response,
          context,
        );
        assert.ok(response.includeSnapshot);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully dragged an element',
        );
        assert.ok(await page.$('text/dropped'));
      });
    });
  });

  describe('hotkey', () => {
    it('parses keys', () => {
      assert.deepStrictEqual(parseKey('Shift+A'), ['A', 'Shift']);
      assert.deepStrictEqual(parseKey('Shift++'), ['+', 'Shift']);
      assert.deepStrictEqual(parseKey('Control+Shift++'), [
        '+',
        'Control',
        'Shift',
      ]);
      assert.deepStrictEqual(parseKey('Shift'), ['Shift']);
      assert.deepStrictEqual(parseKey('KeyA'), ['KeyA']);
    });
    it('throws on empty key', () => {
      assert.throws(() => {
        parseKey('');
      });
    });
    it('throws on invalid key', () => {
      assert.throws(() => {
        parseKey('aaaaa');
      });
    });
    it('throws on multiple keys', () => {
      assert.throws(() => {
        parseKey('Shift+Shift');
      });
    });

    it('processes hotkey', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<script>
            logs = [];
            document.addEventListener('keydown', e => logs.push('d' + e.key));
            document.addEventListener('keyup', e => logs.push('u' + e.key));
          </script>`,
        );
        await context.createTextSnapshot();

        await hotkeyTool.handler(
          {
            params: {
              key: 'Control+Shift+C',
            },
          },
          response,
          context,
        );

        assert.deepStrictEqual(await page.evaluate('logs'), [
          'dControl',
          'dShift',
          'dC',
          'uC',
          'uShift',
          'uControl',
        ]);
      });
    });
  });

  describe('scroll', () => {
    it('scrolls element into view', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<div style="height: 2000px">spacer</div>
            <button id="target">target</button>`,
        );
        await context.createTextSnapshot();
        await scroll.handler(
          {
            params: {
              uid: '1_2',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[response.responseLines.length - 1],
          'Scrolled element into view',
        );
      });
    });

    it('scrolls down within a scrollable element', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<div
            id="scroller"
            style="height: 200px; overflow: auto;"
          >
            <div style="height: 1000px">tall content</div>
          </div>`,
        );
        await context.createTextSnapshot();
        await scroll.handler(
          {
            params: {
              uid: '1_1',
              direction: 'down',
              amount: 200,
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[response.responseLines.length - 1],
          'Scrolled down by 200px within the element',
        );
      });
    });
  });
});
