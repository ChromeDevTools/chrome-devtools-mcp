/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {McpContext} from '../../src/McpContext.js';
import type {McpResponse} from '../../src/McpResponse.js';
import type {
  WebAuthnAuthenticatorConfig,
  WebAuthnAuthenticatorState,
} from '../../src/tools/ToolDefinition.js';
import {configureWebAuthn} from '../../src/tools/webauthn.js';
import {createHandlerMocks} from '../mocks.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

declare global {
  interface Window {
    register(): Promise<string>;
    signIn(): Promise<string>;
  }
}

describe('configure_webauthn', () => {
  it('applies the parameters and attaches the result', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const state: WebAuthnAuthenticatorState = {
      protocol: 'ctap2',
      transport: 'usb',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: false,
      credentials: [],
    };
    page.configureWebAuthn.resolves(state);
    const params: WebAuthnAuthenticatorConfig = {
      enabled: true,
      transport: 'usb',
      isUserVerified: false,
    };

    await configureWebAuthn(args).handler(
      {params: {...params}, page},
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.configureWebAuthn, params);
    sinon.assert.calledOnceWithExactly(
      response.attachWebAuthnAuthenticator,
      state,
    );
  });
});

const PASSKEY_PAGE = html`<script>
  window.register = async () => {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array(32),
        timeout: 5000,
        rp: {name: 'Test'},
        user: {
          id: new Uint8Array([1, 2, 3, 4]),
          name: 'alice@example.com',
          displayName: 'Alice',
        },
        pubKeyCredParams: [{type: 'public-key', alg: -7}],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      },
    });
    return credential.id;
  };
  window.signIn = async () => {
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(32),
          timeout: 5000,
          userVerification: 'required',
        },
      });
      return credential.id;
    } catch (error) {
      return error.name;
    }
  };
</script>`;

// WebAuthn rejects IP addresses as relying party ids.
function localhostRoute(url: string): string {
  return url.replace('//127.0.0.1:', '//localhost:');
}

async function configure(
  context: McpContext,
  response: McpResponse,
  args: Parameters<typeof configureWebAuthn>[0],
  params: WebAuthnAuthenticatorConfig,
): Promise<string> {
  await configureWebAuthn(args).handler(
    {params: {...params}, page: context.getSelectedMcpPage()},
    response,
    context,
  );
  const {content} = await response.handle(context);
  const text = content.find(item => item.type === 'text');
  assert.ok(text?.type === 'text');
  return text.text;
}

describe('configure_webauthn in a browser', () => {
  const server = serverHooks();

  it('registers and signs in with a passkey, fails user verification, then drops the passkey on a transport change', async () => {
    server.addHtmlRoute('/passkey.html', PASSKEY_PAGE);
    await withMcpContext(async (response, context, args) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(localhostRoute(server.getRoute('/passkey.html')));
      assert.match(
        await configure(context, response, args, {enabled: true}),
        /protocol=ctap2, transport=internal[^\n]*\nNo credentials\./,
      );

      response.setIncludePages(true);
      const {content} = await response.handle(context);
      assert.ok(
        JSON.stringify(content).includes('[selected] webauthn=ctap2/internal'),
      );
      response.setIncludePages(false);

      const credentialId = await page.evaluate(() => window.register());
      assert.strictEqual(
        await page.evaluate(() => window.signIn()),
        credentialId,
      );

      const text = await configure(context, response, args, {
        enabled: true,
        isUserVerified: false,
      });
      assert.match(text, /isUserVerified=false/);
      assert.ok(text.includes(`credentialId=${credentialId},`));
      assert.match(text, /rpId=localhost, discoverable=true/);
      assert.match(text, /userName=alice@example\.com/);
      assert.doesNotMatch(text, /privateKey/);
      assert.strictEqual(
        await page.evaluate(() => window.signIn()),
        'NotAllowedError',
      );

      assert.match(
        await configure(context, response, args, {
          enabled: true,
          transport: 'usb',
        }),
        /transport=usb[^\n]*\nNo credentials\./,
      );

      assert.match(
        await configure(context, response, args, {enabled: false}),
        /No virtual authenticator on this page\./,
      );
    });
  });
});
