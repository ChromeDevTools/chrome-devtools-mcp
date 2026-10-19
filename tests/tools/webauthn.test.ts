/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {generateKeyPairSync} from 'node:crypto';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {McpContext} from '../../src/McpContext.js';
import type {McpResponse} from '../../src/McpResponse.js';
import type {WebAuthnAuthenticatorConfig} from '../../src/tools/ToolDefinition.js';
import {configureWebAuthn} from '../../src/tools/webauthn.js';
import {createHandlerMocks} from '../mocks.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('configure_webauthn', () => {
  it('applies the authenticators and lists them without private keys', async () => {
    const {page, context, response, args} = createHandlerMocks();
    page.configureWebAuthn.resolves([
      {
        id: 'auth-1',
        protocol: 'ctap2',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        credentials: [
          {
            credentialId: 'Y3JlZA==',
            rpId: 'example.com',
            isResidentCredential: true,
            userName: 'alice',
            signCount: 0,
          },
        ],
      },
    ]);

    const authenticators = (): WebAuthnAuthenticatorConfig[] => [
      {
        transport: 'usb',
        credentials: [
          {credentialId: 'Y3JlZA==', rpId: 'example.com', privateKey: 'a2V5'},
        ],
      },
    ];

    await configureWebAuthn(args).handler(
      {
        params: {authenticators: authenticators()},
        page,
      },
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(
      page.configureWebAuthn,
      authenticators(),
    );
    sinon.assert.calledWithExactly(
      response.appendResponseLine.firstCall,
      '## Virtual authenticators',
    );
    sinon.assert.calledWithExactly(
      response.appendResponseLine.secondCall,
      '- auth-1: protocol=ctap2, transport=usb, hasResidentKey=true, hasUserVerification=true, isUserVerified=true',
    );
    sinon.assert.calledWithExactly(
      response.appendResponseLine.thirdCall,
      '  - credentialId=Y3JlZA==, rpId=example.com, discoverable=true, signCount=0, userName=alice',
    );
    sinon.assert.calledThrice(response.appendResponseLine);
  });

  it('reports when no authenticators remain', async () => {
    const {page, context, response, args} = createHandlerMocks();
    page.configureWebAuthn.resolves([]);

    await configureWebAuthn(args).handler(
      {params: {authenticators: []}, page},
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.configureWebAuthn, []);
    sinon.assert.calledOnceWithExactly(
      response.appendResponseLine,
      'No virtual authenticators on this page.',
    );
  });
});

const PASSKEY_PAGE = html`<script>
  window.register = async () => {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array(32),
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
  authenticators: Parameters<
    ReturnType<typeof configureWebAuthn>['handler']
  >[0]['params']['authenticators'],
): Promise<string[]> {
  response.resetResponseLineForTesting();
  await configureWebAuthn(args).handler(
    {params: {authenticators}, page: context.getSelectedMcpPage()},
    response,
    context,
  );
  return [...response.responseLines];
}

function authenticatorIdFrom(lines: string[]): string {
  const id = lines[1]?.match(/^- ([^:]+):/)?.[1];
  assert.ok(id, `no authenticator id in ${JSON.stringify(lines)}`);
  return id;
}

describe('configure_webauthn in a browser', () => {
  const server = serverHooks();

  it('registers and signs in with a passkey', async () => {
    server.addHtmlRoute('/passkey.html', PASSKEY_PAGE);
    await withMcpContext(async (response, context, args) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(localhostRoute(server.getRoute('/passkey.html')));
      const id = authenticatorIdFrom(
        await configure(context, response, args, [{}]),
      );

      response.resetResponseLineForTesting();
      response.setIncludePages(true);
      const {content} = await response.handle(context);
      assert.ok(
        JSON.stringify(content).includes(
          `[selected] webauthnAuthenticators=${id}`,
        ),
      );
      response.setIncludePages(false);

      const credentialId = await page.evaluate(() =>
        // @ts-expect-error defined by the test page
        window.register(),
      );
      const lines = await configure(context, response, args, [{id}]);
      assert.strictEqual(lines.length, 3);
      assert.match(lines[2], /rpId=localhost, discoverable=true/);
      assert.match(lines[2], /userName=alice@example\.com/);

      assert.strictEqual(
        await page.evaluate(() =>
          // @ts-expect-error defined by the test page
          window.signIn(),
        ),
        credentialId,
      );

      await configure(context, response, args, [{id, isUserVerified: false}]);
      assert.strictEqual(
        await page.evaluate(() =>
          // @ts-expect-error defined by the test page
          window.signIn(),
        ),
        'NotAllowedError',
      );

      assert.deepStrictEqual(await configure(context, response, args, []), [
        'No virtual authenticators on this page.',
      ]);
    });
  });

  it('signs in with an imported passkey', async () => {
    server.addHtmlRoute('/passkey.html', PASSKEY_PAGE);
    await withMcpContext(async (response, context, args) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(localhostRoute(server.getRoute('/passkey.html')));
      const {privateKey} = generateKeyPairSync('ec', {namedCurve: 'P-256'});
      const credentialId = Buffer.from('imported-passkey');

      const lines = await configure(context, response, args, [
        {
          credentials: [
            {
              credentialId: credentialId.toString('base64'),
              rpId: 'localhost',
              privateKey: privateKey
                .export({format: 'der', type: 'pkcs8'})
                .toString('base64'),
              userHandle: Buffer.from([1, 2, 3, 4]).toString('base64'),
              userName: 'bob@example.com',
            },
          ],
        },
      ]);
      assert.doesNotMatch(lines.join('\n'), /privateKey/);

      assert.strictEqual(
        await page.evaluate(() =>
          // @ts-expect-error defined by the test page
          window.signIn(),
        ),
        credentialId.toString('base64url'),
      );
    });
  });
});
