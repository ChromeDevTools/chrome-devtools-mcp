/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {McpResponse} from '../../src/McpResponse.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import {
  click,
  hover,
  fill,
  drag,
  fillForm,
  uploadFile,
  pressKey,
  clickAt,
  getElementAt,
  typeText,
} from '../../src/tools/input.js';
import {parseKey} from '../../src/utils/keyboard.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('input', () => {
  const server = serverHooks();

  describe('click', () => {
    it('clicks', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await click.handler(
          {
            params: {
              uid: '1_1',
            },
            page: context.getSelectedMcpPage(),
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
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button ondblclick="this.innerText = 'dblclicked';"
            >test</button
          >`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await click.handler(
          {
            params: {
              uid: '1_1',
              dblClick: true,
            },
            page: context.getSelectedMcpPage(),
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
        const page = context.getSelectedPptrPage();
        await page.goto(server.getRoute('/link'));
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        const clickPromise = click.handler(
          {
            params: {
              uid: '1_1',
            },
            page: context.getSelectedMcpPage(),
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
        const page = context.getSelectedPptrPage();
        await page.goto(server.getRoute('/unstable'));
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        const handlerResolveTime = await click
          .handler(
            {
              params: {
                uid: '1_1',
              },
              page: context.getSelectedMcpPage(),
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
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await click.handler(
          {
            params: {
              uid: '1_1',
            },
            page: context.getSelectedMcpPage(),
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
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await click.handler(
          {
            params: {
              uid: '1_1',
              includeSnapshot: true,
            },
            page: context.getSelectedMcpPage(),
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

    it('selects a collapsed native select option by option uid', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<select onchange="document.body.dataset.selected = this.value">
            <option value="v1">one</option>
            <option value="v2">two</option>
          </select>`,
        );
        const mcpPage = context.getSelectedMcpPage();
        mcpPage.textSnapshot = await TextSnapshot.create(mcpPage);
        const optionNode = [...mcpPage.textSnapshot.idToNode.values()].find(
          node => node.role === 'option' && node.name === 'two',
        );
        assert.ok(optionNode);

        await click.handler(
          {
            params: {
              uid: optionNode.id,
            },
            page: mcpPage,
          },
          response,
          context,
        );

        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.deepStrictEqual(
          await page.evaluate(() => {
            const select = document.querySelector('select');
            return {
              selectedValue: select?.value,
              changeEventValue: document.body.dataset.selected,
            };
          }),
          {
            selectedValue: 'v2',
            changeEventValue: 'v2',
          },
        );
      });
    });

    it('selects a collapsed native optgroup option by option uid', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<select onchange="document.body.dataset.selected = this.value">
            <optgroup label="Numbers">
              <option value="v1">one</option>
              <option value="v2">two</option>
            </optgroup>
          </select>`,
        );
        const mcpPage = context.getSelectedMcpPage();
        mcpPage.textSnapshot = await TextSnapshot.create(mcpPage);
        const optionNode = [...mcpPage.textSnapshot.idToNode.values()].find(
          node => node.role === 'option' && node.name === 'two',
        );
        assert.ok(optionNode);

        await click.handler(
          {
            params: {
              uid: optionNode.id,
            },
            page: mcpPage,
          },
          response,
          context,
        );

        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.deepStrictEqual(
          await page.evaluate(() => {
            const select = document.querySelector('select');
            return {
              selectedValue: select?.value,
              changeEventValue: document.body.dataset.selected,
            };
          }),
          {
            selectedValue: 'v2',
            changeEventValue: 'v2',
          },
        );
      });
    });

    it('clicks custom ARIA option elements through the normal click path', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<div role="listbox">
            <div
              role="option"
              tabindex="0"
              onclick="document.body.dataset.clicked = this.textContent.trim()"
            >
              custom two
            </div>
          </div>`,
        );
        const mcpPage = context.getSelectedMcpPage();
        mcpPage.textSnapshot = await TextSnapshot.create(mcpPage);
        const optionNode = [...mcpPage.textSnapshot.idToNode.values()].find(
          node => node.role === 'option' && node.name === 'custom two',
        );
        assert.ok(optionNode);

        await click.handler(
          {
            params: {
              uid: optionNode.id,
            },
            page: mcpPage,
          },
          response,
          context,
        );

        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.strictEqual(
          await page.evaluate(() => document.body.dataset.clicked),
          'custom two',
        );
      });
    });
  });

  describe('hover', () => {
    it('hovers', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button onmouseover="this.innerText = 'hovered';">test</button>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await hover.handler(
          {
            params: {
              uid: '1_1',
            },
            page: context.getSelectedMcpPage(),
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

  describe('click_at', () => {
    it('clicks at coordinates', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<div
            style="width: 100px; height: 100px; background: red;"
            onclick="this.innerText = 'clicked'"
          ></div>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await clickAt.handler(
          {
            params: {
              x: 50,
              y: 50,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked at the coordinates',
        );
        assert.ok(response.includeSnapshot);
        assert.ok(await page.$('text/clicked'));
      });
    });

    it('double clicks at coordinates', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<div
            style="width: 100px; height: 100px; background: red;"
            ondblclick="this.innerText = 'dblclicked'"
          ></div>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await clickAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              dblClick: true,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully double clicked at the coordinates',
        );
        assert.ok(response.includeSnapshot);
        assert.ok(await page.$('text/dblclicked'));
      });
    });
  });

  describe('fill', () => {
    it('fills out an input', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`<input />`);
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: 'test',
            },
            page: context.getSelectedMcpPage(),
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
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<select
            ><option value="v1">one</option
            ><option value="v2">two</option></select
          >`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: 'two',
            },
            page: context.getSelectedMcpPage(),
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

    it('fills out a textarea marked as combobox', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`<textarea role="combobox"></textarea>`);
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: '1',
            },
            page: context.getSelectedMcpPage(),
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
            return document.body.querySelector('textarea')?.value === '1';
          }),
        );
      });
    });

    it('fills out a textarea with long text', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`<textarea></textarea>`);
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        page.setDefaultTimeout(1000);
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: '1'.repeat(3000),
            },
            page: context.getSelectedMcpPage(),
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

    it('types text', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`<textarea></textarea>`);
        await page.click('textarea');
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await typeText.handler(
          {
            params: {
              text: 'test',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(response.responseLines[0], 'Typed text "test"');
        assert.strictEqual(
          await page.evaluate(() => {
            return document.body.querySelector('textarea')?.value;
          }),
          'test',
        );
      });
    });

    it('types text with submit key', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`<textarea></textarea>`);
        await page.click('textarea');
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await typeText.handler(
          {
            params: {
              text: 'test',
              submitKey: 'Tab',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Typed text "test + Tab"',
        );
        assert.strictEqual(
          await page.evaluate(() => {
            return document.body.querySelector('textarea')?.value;
          }),
          'test',
        );
        assert.ok(
          await page.evaluate(() => {
            return (
              document.body.querySelector('textarea') !== document.activeElement
            );
          }),
        );
      });
    });

    it('errors on invalid submit key', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`<textarea></textarea>`);
        await page.click('textarea');
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        try {
          await typeText.handler(
            {
              params: {
                text: 'test',
                submitKey: 'XXX',
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        } catch (err) {
          assert.strictEqual(err.message, 'Unknown key: "XXX"');
        }
      });
    });

    it('reproduction: fill isolation', async () => {
      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedPptrPage();
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
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        // Fill email
        const response1 = new McpResponse({} as ParsedArguments);
        await fill.handler(
          {
            params: {
              uid: '1_1', // email input
              value: 'new@test.com',
            },
            page: context.getSelectedMcpPage(),
          },
          response1,
          context,
        );
        assert.strictEqual(
          response1.responseLines[0],
          'Successfully filled out the element',
        );

        // Fill password
        const response2 = new McpResponse({} as ParsedArguments);
        await fill.handler(
          {
            params: {
              uid: '1_2', // password input
              value: 'secret',
            },
            page: context.getSelectedMcpPage(),
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

    it('toggles checkboxes', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<input
            type="checkbox"
            id="cb"
          />`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        // Check it
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: 'true',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(
          response.responseLines[0],
          'Successfully filled out the element',
        );
        assert.ok(response.includeSnapshot);
        let isChecked = await page.$eval(
          '#cb',
          el => (el as HTMLInputElement).checked,
        );
        assert.strictEqual(isChecked, true);

        // Uncheck it
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: 'false',
            },
            page: context.getSelectedMcpPage(),
          },
          new McpResponse({} as ParsedArguments),
          context,
        );

        isChecked = await page.$eval(
          '#cb',
          el => (el as HTMLInputElement).checked,
        );
        assert.strictEqual(isChecked, false);
      });
    });

    it('toggles switches', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`
          <div
            role="switch"
            aria-checked="false"
            id="sw"
            style="width: 20px; height: 20px; background: blue;"
            onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')"
          >
            switch
          </div>
        `);
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        // Turn it on
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: 'true',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        let swChecked = await page.$eval(
          '#sw',
          el => el.getAttribute('aria-checked') === 'true',
        );
        assert.strictEqual(swChecked, true);

        // Turn it off
        await fill.handler(
          {
            params: {
              uid: '1_1',
              value: 'false',
            },
            page: context.getSelectedMcpPage(),
          },
          new McpResponse({} as ParsedArguments),
          context,
        );

        swChecked = await page.$eval(
          '#sw',
          el => el.getAttribute('aria-checked') === 'true',
        );
        assert.strictEqual(swChecked, false);
      });
    });

    it('selects radio buttons', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`
          <input
            type="radio"
            name="group1"
            id="r1"
            checked
          />
          <input
            type="radio"
            name="group1"
            id="r2"
          />
        `);
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        // Initial state
        let r1Checked = await page.$eval(
          '#r1',
          el => (el as HTMLInputElement).checked,
        );
        let r2Checked = await page.$eval(
          '#r2',
          el => (el as HTMLInputElement).checked,
        );
        assert.strictEqual(r1Checked, true);
        assert.strictEqual(r2Checked, false);

        // Fill second radio with true
        await fill.handler(
          {
            params: {
              uid: '1_2',
              value: 'true',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        r1Checked = await page.$eval(
          '#r1',
          el => (el as HTMLInputElement).checked,
        );
        r2Checked = await page.$eval(
          '#r2',
          el => (el as HTMLInputElement).checked,
        );
        assert.strictEqual(r1Checked, false);
        assert.strictEqual(r2Checked, true);
      });
    });
  });

  describe('drags', () => {
    it('drags one element onto another', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
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
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await drag.handler(
          {
            params: {
              from_uid: '1_1',
              to_uid: '1_2',
            },
            page: context.getSelectedMcpPage(),
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

  describe('fill form', () => {
    it('successfully fills out the form', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<form>
            <label
              >username<input
                name="username"
                type="text"
            /></label>
            <label
              >email<input
                name="email"
                type="text"
            /></label>
            <input
              type="submit"
              value="Submit"
            />
          </form>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await fillForm.handler(
          {
            params: {
              elements: [
                {
                  uid: '1_2',
                  value: 'test',
                },
                {
                  uid: '1_4',
                  value: 'test2',
                },
              ],
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(response.includeSnapshot);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully filled out the form',
        );
        assert.deepStrictEqual(
          await page.evaluate(() => {
            return [
              // @ts-expect-error missing types
              document.querySelector('input[name=username]').value,
              // @ts-expect-error missing types
              document.querySelector('input[name=email]').value,
            ];
          }),
          ['test', 'test2'],
        );
      });
    });

    it('fill_form handles checkboxes', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<input
              name="username"
              type="text"
            /><input
              name="cb"
              type="checkbox"
            />`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await fillForm.handler(
          {
            params: {
              elements: [
                {
                  uid: '1_1',
                  value: 'test',
                },
                {
                  uid: '1_2',
                  value: 'true',
                },
              ],
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          await page.evaluate(() => {
            // @ts-expect-error missing types
            return document.querySelector('input[name=username]').value;
          }),
          'test',
        );
        assert.strictEqual(
          await page.evaluate(() => {
            // @ts-expect-error missing types
            return document.querySelector('input[name=cb]').checked;
          }),
          true,
        );
      });
    });
  });

  describe('uploadFile', () => {
    it('uploads a file to a file input', async () => {
      const testFilePath = path.join(process.cwd(), 'test.txt');
      await fs.writeFile(testFilePath, 'test file content');

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<form>
            <input
              type="file"
              id="file-input"
            />
          </form>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await uploadFile.handler(
          {
            params: {
              uid: '1_1',
              filePath: testFilePath,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(response.includeSnapshot);
        assert.strictEqual(
          response.responseLines[0],
          `File uploaded from ${testFilePath}.`,
        );
      });

      await fs.unlink(testFilePath);
    });

    it('uploads a file when clicking an element opens a file uploader', async () => {
      const testFilePath = path.join(process.cwd(), 'test.txt');
      await fs.writeFile(testFilePath, 'test file content');

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button id="file-chooser-button">Upload file</button>
            <input
              type="file"
              id="file-input"
              style="display: none;"
            />
            <script>
              document
                .getElementById('file-chooser-button')
                .addEventListener('click', () => {
                  document.getElementById('file-input').click();
                });
            </script>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await uploadFile.handler(
          {
            params: {
              uid: '1_1',
              filePath: testFilePath,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(response.includeSnapshot);
        assert.strictEqual(
          response.responseLines[0],
          `File uploaded from ${testFilePath}.`,
        );
        const uploadedFileName = await page.$eval('#file-input', el => {
          const input = el as HTMLInputElement;
          return input.files?.[0]?.name;
        });
        assert.strictEqual(uploadedFileName, 'test.txt');

        await fs.unlink(testFilePath);
      });
    });

    it('throws an error if the element is not a file input and does not open a file chooser', async () => {
      const testFilePath = path.join(process.cwd(), 'test.txt');
      await fs.writeFile(testFilePath, 'test file content');

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(html`<div>Not a file input</div>`);
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        await assert.rejects(
          uploadFile.handler(
            {
              params: {
                uid: '1_1',
                filePath: testFilePath,
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
          {
            message:
              'Failed to upload file. The element could not accept the file directly, and clicking it did not trigger a file chooser.',
          },
        );

        assert.strictEqual(response.responseLines.length, 0);
        assert.strictEqual(response.snapshotParams, undefined);

        await fs.unlink(testFilePath);
      });
    });
  });

  describe('press_key', () => {
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

    it('processes press_key', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<script>
            logs = [];
            document.addEventListener('keydown', e => logs.push('d' + e.key));
            document.addEventListener('keyup', e => logs.push('u' + e.key));
          </script>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        await pressKey.handler(
          {
            params: {
              key: 'Control+Shift+C',
            },
            page: context.getSelectedMcpPage(),
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

  describe('get_element_at', () => {
    it('returns a basic descriptor for an element at coordinates', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button
            id="x"
            class="btn primary"
            style="position:absolute;left:0;top:0;width:100px;height:100px;"
          >
            Hi
          </button>`,
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'auto',
              css: 'none',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(output.includes('tag'), `output missing tag: ${output}`);
        assert.ok(
          output.includes('button'),
          `output missing tag value 'button': ${output}`,
        );
        assert.ok(output.includes('id'), `output missing id: ${output}`);
        assert.ok(output.includes('`x`'), `output missing id value: ${output}`);
        assert.ok(
          output.includes('btn primary'),
          `output missing class list: ${output}`,
        );
        assert.ok(
          output.includes('Hi'),
          `output missing button text: ${output}`,
        );
        assert.ok(
          output.includes('#x'),
          `output missing selector containing #x: ${output}`,
        );
      });
    });

    it('returns only the selector in selector-only mode', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button
            id="x"
            class="btn primary"
            style="position:absolute;left:0;top:0;width:100px;height:100px;"
          >
            Hi
          </button>`,
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'selector-only',
              css: 'none',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(response.responseLines.length, 1);
        const selector = response.responseLines[0];
        assert.ok(
          selector.includes('#x'),
          `selector should contain #x: ${selector}`,
        );
        assert.ok(
          !selector.includes('##'),
          `selector should not contain markdown headers: ${selector}`,
        );
        assert.ok(
          !selector.startsWith('-'),
          `selector should not be a markdown list: ${selector}`,
        );
      });
    });

    it('returns the outerHTML wrapped in a fenced html block in raw mode', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button
            id="x"
            style="position:absolute;left:0;top:0;width:100px;height:100px;"
          >
            Hi
          </button>`,
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'raw',
              css: 'none',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(
          output.includes('```html'),
          `output should include fenced html block opener: ${output}`,
        );
        assert.ok(
          output.includes('<button'),
          `output should include the actual outerHTML: ${output}`,
        );
        assert.ok(
          output.includes('Hi'),
          `output should include the button text: ${output}`,
        );
      });
    });

    it('saves a file path when raw outerHTML exceeds the inline limit', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        const big = 'x'.repeat(60_000);
        await page.setContent(
          html`<div
            id="big"
            style="position:absolute;left:0;top:0;width:200px;height:200px;background:yellow;overflow:hidden;"
          >
            ${big}
          </div>`,
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'raw',
              css: 'none',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(
          /full content saved to /.test(output),
          `output should mention saved file: ${output}`,
        );
      });
    });

    it('includes computed-visual CSS when css="computed-visual"', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button
            style="position:absolute;left:0;top:0;width:100px;height:100px;color: rgb(255, 0, 0); font-weight: 700;"
          >
            x
          </button>`,
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'auto',
              css: 'computed-visual',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(
          output.includes('### CSS (computed-visual)'),
          `output should include computed-visual heading: ${output}`,
        );
        assert.ok(
          output.includes('color'),
          `output should include color property: ${output}`,
        );
        assert.ok(
          output.includes('font-weight'),
          `output should include font-weight property: ${output}`,
        );
      });
    });

    it('includes matched CSS rules when css="matched"', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<style>
              .foo {
                color: blue;
              }
            </style>
            <button
              class="foo"
              style="position:absolute;left:0;top:0;width:100px;height:100px;"
            >
              x
            </button>`,
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'auto',
              css: 'matched',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(
          output.includes('### CSS (matched)'),
          `output should include matched CSS heading: ${output}`,
        );
        assert.ok(
          output.includes('.foo'),
          `output should reference the .foo selector: ${output}`,
        );
      });
    });

    it('reports no element found with self-healing guidance when out of viewport', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button
            style="position:absolute;left:0;top:0;width:50px;height:50px;"
          >
            x
          </button>`,
        );
        await getElementAt.handler(
          {
            params: {
              x: 5000,
              y: 5000,
              mode: 'auto',
              css: 'none',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(
          output.includes('No element found'),
          `output should report no element found: ${output}`,
        );
        assert.ok(
          output.includes('outside the viewport'),
          `output should mention 'outside the viewport': ${output}`,
        );
      });
    });

    it('pierces open shadow roots and reports inOpenShadow=true', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<my-host
              style="position:absolute;left:0;top:0;width:100px;height:100px;display:block;"
            ></my-host>
            <script>
              class MyHost extends HTMLElement {
                constructor() {
                  super();
                  const root = this.attachShadow({mode: 'open'});
                  root.innerHTML =
                    '<button id="inner" style="width:100px;height:100px;">deep</button>';
                }
              }
              customElements.define('my-host', MyHost);
            </script>`,
        );
        await page.waitForFunction(
          () => {
            const host = document.querySelector('my-host');
            return Boolean(host?.shadowRoot?.querySelector('#inner'));
          },
          {timeout: 5000},
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'auto',
              css: 'none',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(
          output.includes('`inner`'),
          `output should identify the inner button id: ${output}`,
        );
        assert.ok(
          output.includes('inOpenShadow=true'),
          `output should set inOpenShadow=true: ${output}`,
        );
      });
    });

    it('descends into a same-origin iframe and identifies the inner element', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<iframe
            srcdoc="<button id='inner' style='position:absolute;left:0;top:0;width:100px;height:100px;'>deep</button>"
            style="position:absolute;left:0;top:0;width:200px;height:200px;border:0;"
          ></iframe>`,
        );
        await page.waitForFunction(
          () => {
            const frame = document.querySelector('iframe');
            return Boolean(frame?.contentDocument?.querySelector('#inner'));
          },
          {timeout: 5000},
        );
        await getElementAt.handler(
          {
            params: {
              x: 50,
              y: 50,
              mode: 'auto',
              css: 'none',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const output = response.responseLines.join('\n');
        assert.ok(
          output.includes('`inner`'),
          `output should identify the inner element id: ${output}`,
        );
        assert.ok(
          output.includes('frameOrigin='),
          `output should include a frameOrigin indicator: ${output}`,
        );
      });
    });

    it('writes the full descriptor to disk when filePath is provided', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html`<button
            id="x"
            style="position:absolute;left:0;top:0;width:100px;height:100px;"
          >
            Hi
          </button>`,
        );
        const tmpDir = await fs.mkdtemp(
          path.join(os.tmpdir(), 'get-element-at-test-'),
        );
        const filePath = path.join(tmpDir, 'desc.json');
        try {
          await getElementAt.handler(
            {
              params: {
                x: 50,
                y: 50,
                mode: 'auto',
                css: 'none',
                filePath,
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          const output = response.responseLines.join('\n');
          assert.ok(
            output.includes('Saved full element descriptor to'),
            `output should reference the saved descriptor: ${output}`,
          );
          assert.ok(
            output.includes('desc.json'),
            `output should include the file name: ${output}`,
          );
          const written = await fs.readFile(filePath, 'utf8');
          const parsed: unknown = JSON.parse(written);
          assert.ok(
            parsed !== null &&
              typeof parsed === 'object' &&
              'descriptor' in parsed,
            'written file should contain a JSON object with a descriptor field',
          );
          const descriptorField = parsed.descriptor;
          assert.ok(
            descriptorField !== null && typeof descriptorField === 'object',
            'descriptor field should be an object',
          );
        } finally {
          await fs.rm(tmpDir, {recursive: true, force: true});
        }
      });
    });
  });
});
