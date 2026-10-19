/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

/* eslint-disable @local/enforce-zod-schema */
const credentialSchema = zod.object({
  credentialId: zod.string().describe('The credential ID, base64 encoded.'),
  rpId: zod
    .string()
    .describe('The relying party ID the credential is scoped to.'),
  privateKey: zod
    .string()
    .describe(
      'The ECDSA P-256 private key in PKCS#8 format, base64 encoded. It is never included in tool output.',
    ),
  isResidentCredential: zod
    .boolean()
    .optional()
    .describe(
      'Whether the credential is discoverable (a passkey). Default: the authenticator hasResidentKey value.',
    ),
  userHandle: zod
    .string()
    .optional()
    .describe(
      'The user handle, base64 encoded. Required for discoverable credentials.',
    ),
  userName: zod.string().optional().describe('The user name.'),
  signCount: zod
    .number()
    .int()
    .optional()
    .describe('The initial signature counter. Default: 0.'),
});

const authenticatorSchema = zod.object({
  id: zod
    .string()
    .optional()
    .describe(
      'The ID of an existing authenticator to keep and update. Omit to create a new authenticator.',
    ),
  protocol: zod
    .enum(['ctap2', 'u2f'])
    .optional()
    .describe('New authenticators only. Default: ctap2.'),
  transport: zod
    .enum(['internal', 'usb', 'nfc', 'ble', 'hybrid'])
    .optional()
    .describe(
      'New authenticators only. "internal" emulates a platform authenticator such as Touch ID or Windows Hello; the others emulate roaming security keys. Default: internal.',
    ),
  hasResidentKey: zod
    .boolean()
    .optional()
    .describe(
      'New authenticators only. Whether the authenticator can store discoverable credentials (passkeys). Default: true.',
    ),
  hasUserVerification: zod
    .boolean()
    .optional()
    .describe(
      'New authenticators only. Whether the authenticator supports user verification (PIN or biometrics). Default: true.',
    ),
  isUserVerified: zod
    .boolean()
    .optional()
    .describe(
      'Whether user verification succeeds. Set to false to test a failed verification. Default: true.',
    ),
  credentials: zod
    .array(credentialSchema)
    .optional()
    .describe(
      'If set, replaces all credentials stored in the authenticator; [] removes them. If omitted, stored credentials are kept.',
    ),
});
/* eslint-enable @local/enforce-zod-schema */

export const configureWebAuthn = definePageTool(() => ({
  name: 'configure_webauthn',
  description:
    'Sets the virtual WebAuthn authenticators of the selected page so passkey and security key flows can be tested without a physical device. ' +
    'Pass the full list of authenticators the page should have: entries with an id keep and update that authenticator, entries without an id create a new one, and existing authenticators not in the list are removed. Pass [] to remove all of them. ' +
    'Authenticators answer navigator.credentials.create() and get() automatically and are removed when the page closes. The response lists every authenticator with its stored credentials.',
  annotations: {
    category: ToolCategory.WEBAUTHN,
    readOnlyHint: false,
  },
  schema: {
    authenticators: zod
      .array(authenticatorSchema)
      .describe('The virtual authenticators the page should have.'),
  },
  blockedByDialog: false,
  concurrency: 'page',
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const authenticators = await request.page.configureWebAuthn(
      request.params.authenticators,
    );
    if (!authenticators.length) {
      response.appendResponseLine('No virtual authenticators on this page.');
      return;
    }
    response.appendResponseLine('## Virtual authenticators');
    for (const authenticator of authenticators) {
      response.appendResponseLine(
        `- ${authenticator.id}: protocol=${authenticator.protocol}, transport=${authenticator.transport}, hasResidentKey=${authenticator.hasResidentKey}, hasUserVerification=${authenticator.hasUserVerification}, isUserVerified=${authenticator.isUserVerified}`,
      );
      if (!authenticator.credentials.length) {
        response.appendResponseLine('  No credentials.');
        continue;
      }
      for (const credential of authenticator.credentials) {
        const fields = [
          `credentialId=${credential.credentialId}`,
          `rpId=${credential.rpId ?? 'unknown'}`,
          `discoverable=${credential.isResidentCredential}`,
          `signCount=${credential.signCount}`,
        ];
        if (credential.userName) {
          fields.push(`userName=${credential.userName}`);
        }
        response.appendResponseLine(`  - ${fields.join(', ')}`);
      }
    }
  },
}));
