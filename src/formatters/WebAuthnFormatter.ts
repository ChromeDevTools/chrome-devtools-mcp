/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {WebAuthnAuthenticatorState} from '../tools/ToolDefinition.js';

function formatAuthenticator(
  authenticator: WebAuthnAuthenticatorState,
): string {
  const lines = [
    '## Virtual authenticator',
    `protocol=${authenticator.protocol}, transport=${authenticator.transport}, hasResidentKey=${authenticator.hasResidentKey}, hasUserVerification=${authenticator.hasUserVerification}, isUserVerified=${authenticator.isUserVerified}`,
  ];
  if (!authenticator.credentials.length) {
    lines.push('No credentials.');
    return lines.join('\n');
  }
  lines.push('### Credentials');
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
    lines.push(`- ${fields.join(', ')}`);
  }
  return lines.join('\n');
}

export class WebAuthnFormatter {
  readonly #authenticator: WebAuthnAuthenticatorState | undefined;

  constructor(authenticator: WebAuthnAuthenticatorState | undefined) {
    this.#authenticator = authenticator;
  }

  toJSON(): WebAuthnAuthenticatorState | null {
    if (!this.#authenticator) {
      return null;
    }
    return {
      ...this.#authenticator,
      credentials: this.#authenticator.credentials.map(credential => ({
        ...credential,
        // Match PublicKeyCredential.id, which the page sees as base64url.
        credentialId: Buffer.from(credential.credentialId, 'base64').toString(
          'base64url',
        ),
      })),
    };
  }

  toString(): string {
    const authenticator = this.toJSON();
    if (!authenticator) {
      return 'No virtual authenticator on this page.';
    }
    return formatAuthenticator(authenticator);
  }
}
