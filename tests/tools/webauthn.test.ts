/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  addCredential,
  addVirtualAuthenticator,
  clearCredentials,
  enableWebAuthn,
  getCredentials,
  removeVirtualAuthenticator,
  setUserVerified,
} from '../../src/tools/webauthn.js';
import {withMcpContext} from '../utils.js';

describe('webauthn', () => {
  describe('webauthn_enable', () => {
    it('enables WebAuthn so virtual authenticators can be added', async () => {
      await withMcpContext(async (response, context) => {
        await enableWebAuthn.handler({params: {}}, response, context);

        // Verify WebAuthn is enabled by successfully adding a virtual authenticator
        // This will fail if WebAuthn.enable wasn't called
        const page = context.getSelectedPage();
        // @ts-expect-error _client is internal Puppeteer API
        const session = page._client();
        const result = await session.send('WebAuthn.addVirtualAuthenticator', {
          options: {
            protocol: 'ctap2',
            transport: 'internal',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
          },
        });
        assert.ok(result.authenticatorId, 'Should return authenticator ID');
      });
    });
  });

  describe('webauthn_add_authenticator', () => {
    it('adds a virtual authenticator and returns its ID', async () => {
      await withMcpContext(async (response, context) => {
        // First enable WebAuthn
        await enableWebAuthn.handler({params: {}}, response, context);

        // Then add authenticator via tool
        await addVirtualAuthenticator.handler(
          {
            params: {
              protocol: 'ctap2',
              transport: 'internal',
              hasResidentKey: true,
              hasUserVerification: true,
              isUserVerified: true,
            },
          },
          response,
          context,
        );

        // Response should contain the authenticator ID
        const hasAuthenticatorId = response.responseLines.some(line =>
          line.includes('authenticatorId'),
        );
        assert.ok(
          hasAuthenticatorId,
          'Should include authenticator ID in response',
        );
      });
    });
  });

  describe('webauthn_remove_authenticator', () => {
    it('removes a virtual authenticator', async () => {
      await withMcpContext(async (response, context) => {
        // Enable and add authenticator
        await enableWebAuthn.handler({params: {}}, response, context);

        const page = context.getSelectedPage();
        // @ts-expect-error _client is internal Puppeteer API
        const session = page._client();
        const {authenticatorId} = await session.send(
          'WebAuthn.addVirtualAuthenticator',
          {
            options: {
              protocol: 'ctap2',
              transport: 'internal',
            },
          },
        );

        // Remove via tool
        await removeVirtualAuthenticator.handler(
          {params: {authenticatorId}},
          response,
          context,
        );

        // Verify it was removed by trying to use it (should fail)
        await assert.rejects(async () => {
          await session.send('WebAuthn.getCredentials', {authenticatorId});
        }, /authenticator/i);
      });
    });
  });

  describe('webauthn_get_credentials', () => {
    it('returns credentials from an authenticator', async () => {
      await withMcpContext(async (response, context) => {
        await enableWebAuthn.handler({params: {}}, response, context);

        const page = context.getSelectedPage();
        // @ts-expect-error _client is internal Puppeteer API
        const session = page._client();
        const {authenticatorId} = await session.send(
          'WebAuthn.addVirtualAuthenticator',
          {
            options: {
              protocol: 'ctap2',
              transport: 'internal',
              hasResidentKey: true,
            },
          },
        );

        await getCredentials.handler(
          {params: {authenticatorId}},
          response,
          context,
        );

        const hasNoCredentials = response.responseLines.some(line =>
          line.includes('No credentials'),
        );
        assert.ok(hasNoCredentials, 'Should indicate no credentials initially');
      });
    });
  });

  describe('webauthn_clear_credentials', () => {
    it('clears credentials from an authenticator', async () => {
      await withMcpContext(async (response, context) => {
        await enableWebAuthn.handler({params: {}}, response, context);

        const page = context.getSelectedPage();
        // @ts-expect-error _client is internal Puppeteer API
        const session = page._client();
        const {authenticatorId} = await session.send(
          'WebAuthn.addVirtualAuthenticator',
          {
            options: {
              protocol: 'ctap2',
              transport: 'internal',
            },
          },
        );

        await clearCredentials.handler(
          {params: {authenticatorId}},
          response,
          context,
        );

        const hasCleared = response.responseLines.some(line =>
          line.includes('Cleared all credentials'),
        );
        assert.ok(hasCleared, 'Should confirm credentials cleared');
      });
    });
  });

  describe('webauthn_set_user_verified', () => {
    it('sets user verification state', async () => {
      await withMcpContext(async (response, context) => {
        await enableWebAuthn.handler({params: {}}, response, context);

        const page = context.getSelectedPage();
        // @ts-expect-error _client is internal Puppeteer API
        const session = page._client();
        const {authenticatorId} = await session.send(
          'WebAuthn.addVirtualAuthenticator',
          {
            options: {
              protocol: 'ctap2',
              transport: 'internal',
              hasUserVerification: true,
              isUserVerified: true,
            },
          },
        );

        await setUserVerified.handler(
          {params: {authenticatorId, isUserVerified: false}},
          response,
          context,
        );

        const hasSet = response.responseLines.some(line =>
          line.includes('Set user verification to false'),
        );
        assert.ok(hasSet, 'Should confirm user verification set');
      });
    });
  });

  describe('webauthn_add_credential', () => {
    it('is defined with correct schema', async () => {
      // Verify the tool exists and has the expected schema
      assert.strictEqual(addCredential.name, 'webauthn_add_credential');
      assert.ok(addCredential.schema.authenticatorId);
      assert.ok(addCredential.schema.credentialId);
      assert.ok(addCredential.schema.isResidentCredential);
      assert.ok(addCredential.schema.rpId);
      assert.ok(addCredential.schema.privateKey);
    });
  });
});
