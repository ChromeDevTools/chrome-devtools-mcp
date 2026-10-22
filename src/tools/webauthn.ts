/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, type PageToolFactory} from './ToolDefinition.js';

export const configureWebAuthn: PageToolFactory = definePageTool(() => ({
  name: 'configure_webauthn',
  description:
    'Adds a virtual WebAuthn authenticator to the page. Call this before the page calls navigator.credentials. ' +
    'It answers navigator.credentials.create() and get() and is removed when the page closes. ' +
    'Omitted parameters keep their current values. Changing protocol, transport, hasResidentKey or hasUserVerification replaces the authenticator and deletes its credentials. ' +
    'enabled=false ignores other parameters and removes all authenticators on the page.',
  annotations: {
    category: ToolCategory.WEBAUTHN,
    readOnlyHint: false,
  },
  schema: {
    enabled: zod
      .boolean()
      .describe(
        'Set to false to remove all virtual authenticators from the page.',
      ),
    protocol: zod
      .enum(['ctap2', 'u2f'])
      .optional()
      .describe('The authenticator protocol. Default: ctap2.'),
    transport: zod
      .enum(['internal', 'usb', 'nfc', 'ble', 'hybrid'])
      .optional()
      .describe(
        '"internal" is a platform authenticator such as Touch ID or Windows Hello; the others are roaming security keys. Default: internal.',
      ),
    hasResidentKey: zod
      .boolean()
      .optional()
      .describe(
        'Whether the authenticator can store discoverable credentials (passkeys). Default: true. u2f does not support it, so it is false for u2f.',
      ),
    hasUserVerification: zod
      .boolean()
      .optional()
      .describe(
        'Whether the authenticator supports user verification (PIN or biometrics). Default: true. u2f does not support it, so it is false for u2f.',
      ),
    isUserVerified: zod
      .boolean()
      .optional()
      .describe(
        'Whether user verification succeeds. Set to false to test a failed verification. Default: true.',
      ),
  },
  blockedByDialog: false,
  concurrency: 'page',
  verifyFilesSchema: {},
  handler: async (request, response) => {
    response.attachWebAuthnAuthenticator(
      await request.page.configureWebAuthn(request.params),
    );
  },
}));
