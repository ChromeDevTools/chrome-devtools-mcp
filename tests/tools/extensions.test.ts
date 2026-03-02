/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import type {ParsedArguments} from '../../src/cli.js';
import type {McpResponse} from '../../src/McpResponse.js';
import {
  installExtension,
  uninstallExtension,
  listExtensions,
  reloadExtension,
  triggerExtensionAction,
} from '../../src/tools/extensions.js';
import {listPages} from '../../src/tools/pages.js';
import {withMcpContext} from '../utils.js';

const EXTENSION_WITH_SW_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension-sw',
);
const EXTENSION_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension',
);

export function extractId(response: McpResponse) {
  const responseLine = response.responseLines[0];
  assert.ok(responseLine, 'Response should not be empty');
  const match = responseLine.match(/Extension installed\. Id: (.+)/);
  const extensionId = match ? match[1] : null;
  assert.ok(extensionId, 'Response should contain a valid key');
  return extensionId;
}

describe('extension', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('installs and uninstalls an extension and verifies it in chrome://extensions', async () => {
    await withMcpContext(async (response, context) => {
      // Install the extension
      await installExtension.handler(
        {params: {path: EXTENSION_PATH}},
        response,
        context,
      );

      const extensionId = extractId(response);
      const page = context.getSelectedPptrPage();
      await page.goto('chrome://extensions');

      const element = await page.waitForSelector(
        `extensions-manager >>> extensions-item[id="${extensionId}"]`,
      );
      assert.ok(
        element,
        `Extension with ID "${extensionId}" should be visible on chrome://extensions`,
      );

      // Uninstall the extension
      await uninstallExtension.handler(
        {params: {id: extensionId!}},
        response,
        context,
      );

      const uninstallResponseLine = response.responseLines[1];
      assert.ok(
        uninstallResponseLine.includes('Extension uninstalled'),
        'Response should indicate uninstallation',
      );

      await page.waitForSelector('extensions-manager');

      const elementAfterUninstall = await page.$(
        `extensions-manager >>> extensions-item[id="${extensionId}"]`,
      );
      assert.strictEqual(
        elementAfterUninstall,
        null,
        `Extension with ID "${extensionId}" should NOT be visible on chrome://extensions`,
      );
    });
  });
  it('lists installed extensions', async () => {
    await withMcpContext(async (response, context) => {
      const setListExtensionsSpy = sinon.spy(response, 'setListExtensions');
      await listExtensions.handler({params: {}}, response, context);
      assert.ok(
        setListExtensionsSpy.calledOnce,
        'setListExtensions should be called',
      );
    });
  });
  it('reloads an extension', async () => {
    await withMcpContext(async (response, context) => {
      await installExtension.handler(
        {params: {path: EXTENSION_PATH}},
        response,
        context,
      );

      const extensionId = extractId(response);
      const installSpy = sinon.spy(context, 'installExtension');
      response.resetResponseLineForTesting();

      await reloadExtension.handler(
        {params: {id: extensionId!}},
        response,
        context,
      );
      assert.ok(
        installSpy.calledOnceWithExactly(EXTENSION_PATH),
        'installExtension should be called with the extension path',
      );

      const reloadResponseLine = response.responseLines[0];
      assert.ok(
        reloadResponseLine.includes('Extension reloaded'),
        'Response should indicate reload',
      );

      const list = context.listExtensions();
      assert.ok(list.length === 1, 'List should have only one extension');
      const reinstalled = list.find(e => e.id === extensionId);
      assert.ok(reinstalled, 'Extension should be present after reload');
    });
  });
  it('triggers an extension action', async () => {
    await withMcpContext(
      async (response, context) => {
        await installExtension.handler(
          {params: {path: EXTENSION_WITH_SW_PATH}},
          response,
          context,
        );

        const extensionId = extractId(response);

        response.resetResponseLineForTesting();
        const listPageDef = listPages({
          categoryExtensions: true,
        } as ParsedArguments);
        await listPageDef.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        let result = await response.handle(listPageDef.name, context);
        let textContent = result.content.find(c => c.type === 'text') as {
          type: 'text';
          text: string;
        };
        assert.ok(
          !textContent.text.includes(extensionId),
          'Response should not contain extension service worker id',
        );

        await triggerExtensionAction.handler(
          {params: {id: extensionId}},
          response,
          context,
        );

        const swTarget = await context.browser.waitForTarget(
          t => t.type() === 'service_worker' && t.url().includes(extensionId),
        );
        const swUrl = swTarget.url();

        response.resetResponseLineForTesting();
        await listPageDef.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        result = await response.handle(listPageDef.name, context);
        textContent = result.content.find(c => c.type === 'text') as {
          type: 'text';
          text: string;
        };
        assert.ok(
          textContent.text.includes(swUrl),
          'Response should contain extension service worker url',
        );
      },
      {
        executablePath: process.env.CANARY_EXECUTABLE_PATH,
      },
      {
        categoryExtensions: true,
      } as ParsedArguments,
    );
  });
});
