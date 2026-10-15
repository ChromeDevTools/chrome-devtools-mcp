/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  installExtension,
  uninstallExtension,
  listExtensions,
  reloadExtension,
  triggerExtensionAction,
} from '../../src/tools/extensions.js';
import {createHandlerMocks, createMockExtension} from '../mocks.js';
import {withMcpContext} from '../utils.js';

const EXTENSION_SW_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension-sw',
);

describe('extensions', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('install_extension', () => {
    it('installs an extension and appends response line', async () => {
      const {context, response, args} = createHandlerMocks();
      context.installExtension.resolves('ext-123');

      await installExtension(args).handler(
        {params: {path: '/path/to/extension'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.installExtension,
        '/path/to/extension',
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Extension installed. Id: ext-123',
      );
    });
  });

  describe('uninstall_extension', () => {
    it('uninstalls an extension and appends response line', async () => {
      const {context, response, args} = createHandlerMocks();
      context.uninstallExtension.resolves();

      await uninstallExtension(args).handler(
        {params: {id: 'ext-123'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(context.uninstallExtension, 'ext-123');
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Extension uninstalled. Id: ext-123',
      );
    });
  });

  describe('list_extensions', () => {
    it('sets list extensions on response', async () => {
      const {context, response, args} = createHandlerMocks();

      await listExtensions(args).handler({params: {}}, response, context);

      sinon.assert.calledOnceWithExactly(response.setListExtensions);
    });
  });

  describe('reload_extension', () => {
    it('reloads an extension by reinstalling its path', async () => {
      const {context, response, args} = createHandlerMocks();
      const mockExtension = createMockExtension({
        id: 'ext-123',
        path: '/path/to/extension',
      });
      context.getExtension.resolves(mockExtension);
      context.installExtension.resolves('ext-123');

      await reloadExtension(args).handler(
        {params: {id: 'ext-123'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(context.getExtension, 'ext-123');
      sinon.assert.calledOnceWithExactly(
        context.installExtension,
        '/path/to/extension',
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Extension reloaded.',
      );
    });

    it('throws when extension is not found', async () => {
      const {context, response, args} = createHandlerMocks();
      context.getExtension.resolves(undefined);

      await assert.rejects(
        async () => {
          await reloadExtension(args).handler(
            {params: {id: 'non-existent'}},
            response,
            context,
          );
        },
        {message: 'Extension with ID non-existent not found.'},
      );

      sinon.assert.calledOnceWithExactly(context.getExtension, 'non-existent');
      sinon.assert.notCalled(context.installExtension);
      sinon.assert.notCalled(response.appendResponseLine);
    });

    it('prunes destroyed extension service workers after reload_extension', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const extensionId = await context.installExtension(EXTENSION_SW_PATH);
          assert.ok(extensionId);

          await context.browser.waitForTarget(
            target =>
              target.type() === 'service_worker' &&
              target.url().includes('chrome-extension://'),
          );

          const initialWorkers = await context.createWorkersSnapshot();
          assert.strictEqual(initialWorkers.length, 1);
          const oldWorkerId = initialWorkers[0].id;

          await reloadExtension(args).handler(
            {params: {id: extensionId}},
            response,
            context,
          );

          await new Promise(resolve => setTimeout(resolve, 2000));

          const workers = await context.createWorkersSnapshot();
          assert.strictEqual(workers.length, 1);
          assert.notStrictEqual(workers[0].id, oldWorkerId);
          assert.strictEqual(context.getWorkerById(oldWorkerId), undefined);
          await context.uninstallExtension(extensionId);
        },
        {},
        {categoryExtensions: true},
      );
    });
  });

  describe('trigger_extension_action', () => {
    it('triggers extension action and appends response line', async () => {
      const {context, response, args} = createHandlerMocks();
      context.triggerExtensionAction.resolves();

      await triggerExtensionAction(args).handler(
        {params: {id: 'ext-123'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.triggerExtensionAction,
        'ext-123',
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Extension action triggered for ID ext-123',
      );
    });
  });
});
