/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {configureWebauthn} from '../../src/tools/webauthn.js';
import {withMcpContext} from '../utils.js';

describe('webauthn', () => {
  it('reports status', async () => {
    await withMcpContext(async (response, context) => {
      const selectedPage = context.getSelectedPptrPage();
      const send = sinon.stub().resolves({credentials: []});
      sinon
        .stub(selectedPage as unknown as Record<string, unknown>, '_client')
        .returns({send} as never);

      await configureWebauthn.handler(
        {
          params: {action: 'status'},
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );

      assert.ok(response.responseLines.join('\n').includes('WebAuthn status:'));
      sinon.assert.calledWith(send, 'WebAuthn.getCredentials', {});
    });
  });

  it('enables WebAuthn and includes action result', async () => {
    await withMcpContext(async (response, context) => {
      const selectedPage = context.getSelectedPptrPage();
      const send = sinon
        .stub()
        .onFirstCall()
        .resolves(undefined)
        .onSecondCall()
        .resolves({credentials: []});
      sinon
        .stub(selectedPage as unknown as Record<string, unknown>, '_client')
        .returns({send} as never);

      await configureWebauthn.handler(
        {
          params: {action: 'enable'},
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );

      sinon.assert.calledWith(send.firstCall, 'WebAuthn.enable');
      assert.ok(response.responseLines.join('\n').includes('"result":"enabled"'));
    });
  });

  it('throws if removeAuthenticator is missing authenticatorId', async () => {
    await withMcpContext(async (response, context) => {
      const selectedPage = context.getSelectedPptrPage();
      const send = sinon.stub().resolves({credentials: []});
      sinon
        .stub(selectedPage as unknown as Record<string, unknown>, '_client')
        .returns({send} as never);

      await assert.rejects(
        configureWebauthn.handler(
          {
            params: {action: 'removeAuthenticator'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        ),
        /authenticatorId is required/,
      );
    });
  });
});
