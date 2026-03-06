/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {
  installExtension,
  uninstallExtension,
  listExtensions,
  reloadExtension,
  triggerExtensionAction,
} from '../../src/tools/extensions.js';
import {extractExtensionId, withMcpContext} from '../utils.js';

const EXTENSION_WITH_SW_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension-sw',
);
const EXTENSION_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension',
);

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

      const extensionId = extractExtensionId(response);
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

      const extensionId = extractExtensionId(response);
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
        const extensionId = await context.installExtension(
          EXTENSION_WITH_SW_PATH,
        );

        const targetsBefore = context.browser.targets();
        const pageTargetBefore = targetsBefore.find(
          t => t.type() === 'page' && t.url().includes(extensionId),
        );
        assert.ok(!pageTargetBefore, 'Page should not exist before action');

        await triggerExtensionAction.handler(
          {params: {id: extensionId}},
          response,
          context,
        );

        const pageTargetAfter = await context.browser.waitForTarget(
          t => t.type() === 'page' && t.url().includes(extensionId),
        );
        assert.ok(pageTargetAfter, 'Page should exist after action');
      },
      {
        executablePath: process.env.CHROME_M146_EXECUTABLE_PATH,
      },
      {
        categoryExtensions: true,
      } as ParsedArguments,
    );
  });
});
