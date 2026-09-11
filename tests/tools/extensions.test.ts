/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
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

describe('extensions', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('install_extension', () => {
    it('installs an extension and appends response line', async () => {
      const {context, response} = createHandlerMocks();
      context.installExtension.resolves('ext-123');

      await installExtension.handler(
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
      const {context, response} = createHandlerMocks();
      context.uninstallExtension.resolves();

      await uninstallExtension.handler(
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
      const {context, response} = createHandlerMocks();

      await listExtensions.handler({params: {}}, response, context);

      sinon.assert.calledOnceWithExactly(response.setListExtensions);
    });
  });

  describe('reload_extension', () => {
    it('reloads an extension by reinstalling its path', async () => {
      const {context, response} = createHandlerMocks();
      const mockExtension = createMockExtension({
        id: 'ext-123',
        path: '/path/to/extension',
      });
      context.getExtension.resolves(mockExtension);
      context.installExtension.resolves('ext-123');

      await reloadExtension.handler(
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
      const {context, response} = createHandlerMocks();
      context.getExtension.resolves(undefined);

      await assert.rejects(
        async () => {
          await reloadExtension.handler(
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
  });

  describe('trigger_extension_action', () => {
    it('triggers extension action and appends response line', async () => {
      const {context, response} = createHandlerMocks();
      context.triggerExtensionAction.resolves();

      await triggerExtensionAction.handler(
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
