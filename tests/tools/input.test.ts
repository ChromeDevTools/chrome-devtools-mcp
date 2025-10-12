/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  click,
  hover,
  fill,
  drag,
  fillForm,
  uploadFile,
  pressKey,
} from '../../src/tools/input.js';
import {serverHooks} from '../server.js';
import {html, withBrowser} from '../utils.js';

describe('input', () => {
  const server = serverHooks();

  describe('click', () => {
    it('clicks', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          `<!DOCTYPE html><button onclick="this.innerText = 'clicked';">test`,
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
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          `<!DOCTYPE html><button ondblclick="this.innerText = 'dblclicked';">test`,
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

      await withBrowser(async (response, context) => {
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
      await withBrowser(async (response, context) => {
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
  });

  describe('hover', () => {
    it('hovers', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          `<!DOCTYPE html><button onmouseover="this.innerText = 'hovered';">test`,
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

  describe('fill', () => {
    it('fills out an input', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html><input>`);
        await context.createTextSnapshot();
        await fill.handler(
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
  });

  describe('drags', () => {
    it('drags one element onto another', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<div role="button" id="drag" draggable="true">drag me</div>
<div id="drop" aria-label="drop"
  style="width: 100px; height: 100px; border: 1px solid black;" ondrop="this.innerText = 'dropped';">
</div>
<script>
    drag.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", event.target.id);
    });
    drop.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    });
    drop.addEventListener("drop", (event) => {
        event.preventDefault();
        const data = event.dataTransfer.getData("text/plain");
        event.target.appendChild(document.getElementById(data));
    });
</script>`);
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

  describe('fill form', () => {
    it('successfully fills out the form', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<form>
  <label>username<input name=username type="text"/></label>
  <label>email<input name=email type="text"/></label>
  <input type=submit value="Submit">
</form>`);
        await context.createTextSnapshot();
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
  });

  describe('uploadFile', () => {
    it('uploads a file to a file input', async () => {
      const testFilePath = path.join(process.cwd(), 'test.txt');
      await fs.writeFile(testFilePath, 'test file content');

      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<form>
  <input type="file" id="file-input">
</form>`);
        await context.createTextSnapshot();
        await uploadFile.handler(
          {
            params: {
              uid: '1_1',
              filePath: testFilePath,
            },
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

      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<button id="file-chooser-button">Upload file</button>
<input type="file" id="file-input" style="display: none;">
<script>
  document.getElementById('file-chooser-button').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
</script>`);
        await context.createTextSnapshot();
        await uploadFile.handler(
          {
            params: {
              uid: '1_1',
              filePath: testFilePath,
            },
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

      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html><div>Not a file input</div>`);
        await context.createTextSnapshot();

        await assert.rejects(
          uploadFile.handler(
            {
              params: {
                uid: '1_1',
                filePath: testFilePath,
              },
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
        assert.strictEqual(response.includeSnapshot, false);

        await fs.unlink(testFilePath);
      });
    });
  });

  describe('pressKey', () => {
    it('presses a simple key', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<input id="test-input" />
<div id="result"></div>
<script>
  document.getElementById('test-input').addEventListener('keydown', (e) => {
    document.getElementById('result').innerText = e.key;
  });
</script>`);
        await context.createTextSnapshot();
        await page.focus('#test-input');
        await pressKey.handler(
          {
            params: {
              key: 'Enter',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully pressed key: Enter',
        );
        assert.ok(response.includeSnapshot);
        const result = await page.$eval(
          '#result',
          el => (el as HTMLElement).innerText,
        );
        assert.strictEqual(result, 'Enter');
      });
    });

    it('presses a key combination', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<textarea id="test-input">Hello World</textarea>
<script>
  const input = document.getElementById('test-input');
  input.focus();
  input.setSelectionRange(0, 0);
</script>`);
        await context.createTextSnapshot();
        await pressKey.handler(
          {
            params: {
              key: 'Control+A',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully pressed key: Control+A',
        );
        assert.ok(response.includeSnapshot);
        // Verify text is selected by getting selection
        const selected = await page.evaluate(() => {
          const input = document.getElementById(
            'test-input',
          ) as HTMLTextAreaElement;
          return (
            input.selectionStart === 0 &&
            input.selectionEnd === input.value.length
          );
        });
        assert.ok(selected, 'Text should be selected');
      });
    });

    it('presses plus key with modifier (Control++)', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<div id="result"></div>
<script>
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '+') {
      document.getElementById('result').innerText = 'ctrl-plus';
    }
  });
</script>`);
        await context.createTextSnapshot();
        await pressKey.handler(
          {
            params: {
              key: 'Control++',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully pressed key: Control++',
        );
        assert.ok(response.includeSnapshot);
        const result = await page.$eval(
          '#result',
          el => (el as HTMLElement).innerText,
        );
        assert.strictEqual(result, 'ctrl-plus');
      });
    });

    it('presses multiple modifiers', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(`<!DOCTYPE html>
<div id="result"></div>
<script>
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      document.getElementById('result').innerText = 'ctrl-shift-t';
    }
  });
</script>`);
        await context.createTextSnapshot();
        await pressKey.handler(
          {
            params: {
              key: 'Control+Shift+T',
            },
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully pressed key: Control+Shift+T',
        );
        assert.ok(response.includeSnapshot);
        const result = await page.$eval(
          '#result',
          el => (el as HTMLElement).innerText,
        );
        assert.strictEqual(result, 'ctrl-shift-t');
      });
    });
  });
});
