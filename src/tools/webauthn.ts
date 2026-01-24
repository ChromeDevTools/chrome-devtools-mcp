/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession} from '../third_party/index.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const enableWebAuthn = defineTool({
  name: 'webauthn_enable',
  description:
    'Enable the WebAuthn virtual authenticator environment for the selected page.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    // @ts-expect-error _client is internal Puppeteer API
    const session = page._client() as CDPSession;
    await session.send('WebAuthn.enable');
    response.appendResponseLine(
      'WebAuthn virtual authenticator environment enabled.',
    );
  },
});

export const addVirtualAuthenticator = defineTool({
  name: 'webauthn_add_authenticator',
  description: 'Add a virtual WebAuthn authenticator.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    protocol: zod
      .enum(['u2f', 'ctap2'])
      .describe('The protocol the virtual authenticator speaks.'),
    transport: zod
      .enum(['usb', 'nfc', 'ble', 'internal'])
      .describe('The transport for the authenticator.'),
    hasResidentKey: zod
      .boolean()
      .optional()
      .describe('Whether the authenticator supports resident keys (passkeys).'),
    hasUserVerification: zod
      .boolean()
      .optional()
      .describe('Whether the authenticator supports user verification.'),
    isUserVerified: zod
      .boolean()
      .optional()
      .describe('Whether user verification is currently enabled/verified.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    // @ts-expect-error _client is internal Puppeteer API
    const session = page._client() as CDPSession;

    const {
      protocol,
      transport,
      hasResidentKey,
      hasUserVerification,
      isUserVerified,
    } = request.params;

    const result = await session.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol,
        transport,
        hasResidentKey: hasResidentKey ?? false,
        hasUserVerification: hasUserVerification ?? false,
        isUserVerified: isUserVerified ?? false,
      },
    });

    response.appendResponseLine(
      `Added virtual authenticator (authenticatorId: ${result.authenticatorId})`,
    );
  },
});
