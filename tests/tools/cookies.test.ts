/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {clearCookies, getCookies, setCookie} from '../../src/tools/cookies.js';
import {serverHooks} from '../server.js';
import {getTextContent, html, withMcpContext} from '../utils.js';

describe('cookies', () => {
  const server = serverHooks();

  afterEach(() => {
    sinon.restore();
  });

  describe('get_cookies', () => {
    it('writes cookie values to the file but not the response', async () => {
      server.addHtmlRoute('/', html`<main>Cookie page</main>`);
      const filePath = 'cookies.json';

      await withMcpContext(async (response, context) => {
        const saveFileStub = sinon
          .stub(context, 'saveFile')
          .resolves({filename: filePath});

        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));
        await page.evaluate(() => {
          document.cookie = 'testcookie=testvalue';
        });

        await getCookies.handler(
          {params: {filePath}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        // The value must be written to the file...
        sinon.assert.calledOnce(saveFileStub);
        const [savedData, savedPath] = saveFileStub.firstCall.args;
        assert.strictEqual(savedPath, filePath);
        const savedText = new TextDecoder().decode(savedData);
        assert.match(savedText, /testvalue/);

        // ...but the value must never appear in the response context.
        const responseData = await response.handle(context);
        const text = getTextContent(responseData.content[0]);
        assert.match(text, /testcookie/); // name is reported
        assert.doesNotMatch(text, /testvalue/); // value is not
        assert.match(text, new RegExp(filePath));
      });
    });

    it('filters cookies by domain', async () => {
      server.addHtmlRoute('/', html`<main>Cookie page</main>`);
      const filePath = 'cookies.json';

      await withMcpContext(async (response, context) => {
        sinon.stub(context, 'saveFile').resolves({filename: filePath});

        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));
        await page.evaluate(() => {
          document.cookie = 'testcookie=testvalue';
        });

        await getCookies.handler(
          {
            params: {filePath, domain: 'no-such-domain.example'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const responseData = await response.handle(context);
        const text = getTextContent(responseData.content[0]);
        assert.match(text, /No cookies found/);
      });
    });
  });

  describe('set_cookie', () => {
    it('requires either url or domain', async () => {
      await withMcpContext(async (response, context) => {
        await assert.rejects(
          () =>
            setCookie.handler(
              {
                params: {name: 'a', value: 'b'},
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            ),
          /Either 'url' or 'domain' is required/,
        );
      });
    });

    it('sets a cookie and does not echo its value', async () => {
      server.addHtmlRoute('/', html`<main>Cookie page</main>`);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await setCookie.handler(
          {
            params: {
              name: 'flag',
              value: 'super-secret-value',
              url: server.getRoute('/'),
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const text = getTextContent(
          (await response.handle(context)).content[0],
        );
        assert.match(text, /Set cookie flag/);
        assert.doesNotMatch(text, /super-secret-value/);

        // The cookie is really there.
        const value = await page.evaluate(() => document.cookie);
        assert.match(value, /flag=super-secret-value/);
      });
    });
    it('resolves a {{secret:NAME}} value without echoing it', async () => {
      server.addHtmlRoute('/', html`<main>Cookie page</main>`);
      const {SECRETS_DIR} = await import('../../src/utils/secrets.js');
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const name = `cdp-test-${process.pid}-cookieval`;
      await fs.mkdir(SECRETS_DIR, {recursive: true});
      await fs.writeFile(path.join(SECRETS_DIR, name), 'tok-from-file\n');

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        await setCookie.handler(
          {
            params: {
              name: 'sess',
              value: `{{secret:${name}}}`,
              url: server.getRoute('/'),
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const text = getTextContent(
          (await response.handle(context)).content[0],
        );
        assert.doesNotMatch(text, /tok-from-file/);

        // The resolved value really reached the browser...
        const value = await page.evaluate(() => document.cookie);
        assert.match(value, /sess=tok-from-file/);
        // ...and the secret was consumed.
        await assert.rejects(() => fs.access(path.join(SECRETS_DIR, name)));
      });
    });
  });

  describe('clear_cookies', () => {
    it('refuses to wipe everything without an explicit flag', async () => {
      await withMcpContext(async (response, context) => {
        await assert.rejects(
          () =>
            clearCookies.handler(
              {params: {}, page: context.getSelectedMcpPage()},
              response,
              context,
            ),
          /Refusing to clear every cookie implicitly/,
        );
      });
    });

    it('deletes only cookies matching the filter', async () => {
      server.addHtmlRoute('/', html`<main>Cookie page</main>`);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));
        await page.evaluate(() => {
          document.cookie = 'keep=1';
          document.cookie = 'drop=1';
        });

        await clearCookies.handler(
          {params: {name: 'drop'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        const remaining = await page.evaluate(() => document.cookie);
        assert.match(remaining, /keep=1/);
        assert.doesNotMatch(remaining, /drop=1/);
      });
    });
  });

  describe('domain filter boundaries', () => {
    it('matches subdomains but not lookalike domains', async () => {
      server.addHtmlRoute('/', html`<main>Cookie page</main>`);

      await withMcpContext(async (response, context) => {
        const saveFileStub = sinon
          .stub(context, 'saveFile')
          .resolves({filename: 'c.json'});
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/'));

        // "localhost" must not match a lookalike such as "notlocalhost".
        await getCookies.handler(
          {
            params: {filePath: 'c.json', domain: 'notlocalhost'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const [savedData] = saveFileStub.firstCall.args;
        const saved = JSON.parse(new TextDecoder().decode(savedData));
        for (const cookie of saved) {
          assert.ok(
            !cookie.domain.includes('notlocalhost') ||
              cookie.domain.endsWith('notlocalhost'),
            `unexpected domain ${cookie.domain}`,
          );
        }
      });
    });
  });
});
