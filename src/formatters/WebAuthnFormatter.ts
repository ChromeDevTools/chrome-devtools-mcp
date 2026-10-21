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
    `- ${authenticator.id}: protocol=${authenticator.protocol}, transport=${authenticator.transport}, hasResidentKey=${authenticator.hasResidentKey}, hasUserVerification=${authenticator.hasUserVerification}, isUserVerified=${authenticator.isUserVerified}`,
  ];
  if (!authenticator.credentials.length) {
    lines.push('  No credentials.');
    return lines.join('\n');
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
    lines.push(`  - ${fields.join(', ')}`);
  }
  return lines.join('\n');
}

export class WebAuthnFormatter {
  readonly #authenticators: readonly WebAuthnAuthenticatorState[];

  constructor(authenticators: readonly WebAuthnAuthenticatorState[]) {
    this.#authenticators = authenticators;
  }

  toJSON(): WebAuthnAuthenticatorState[] {
    return this.#authenticators.map(authenticator => ({
      ...authenticator,
      credentials: authenticator.credentials.map(credential => ({
        ...credential,
      })),
    }));
  }

  toString(): string {
    const authenticators = this.toJSON();
    if (!authenticators.length) {
      return 'No virtual authenticators on this page.';
    }
    return [
      '## Virtual authenticators',
      ...authenticators.map(formatAuthenticator),
    ].join('\n');
  }
}
