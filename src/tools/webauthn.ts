/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const configureWebAuthn = definePageTool(() => ({
  name: 'configure_webauthn',
  description:
    'Sets up a virtual WebAuthn authenticator on the selected page so passkey and security key flows can be tested without a physical device. ' +
    'It answers navigator.credentials.create() and get() automatically and is removed when the page closes. ' +
    'On later calls, omitted parameters keep their current values. Changing only isUserVerified keeps the stored credentials; changing protocol, transport, hasResidentKey or hasUserVerification replaces the authenticator and its credentials. ' +
    'The response shows the authenticator and its stored credentials.',
  annotations: {
    category: ToolCategory.WEBAUTHN,
    readOnlyHint: false,
  },
  schema: {
    enabled: zod
      .boolean()
      .describe(
        'Whether the page has a virtual authenticator. Set to false to remove it and its credentials.',
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
        'Whether the authenticator can store discoverable credentials (passkeys). Default: true.',
      ),
    hasUserVerification: zod
      .boolean()
      .optional()
      .describe(
        'Whether the authenticator supports user verification (PIN or biometrics). Default: true.',
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
