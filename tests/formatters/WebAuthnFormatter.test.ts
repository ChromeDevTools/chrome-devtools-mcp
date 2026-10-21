/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import {WebAuthnFormatter} from '../../src/formatters/WebAuthnFormatter.js';

describe('WebAuthnFormatter', () => {
  function formatterTest(label: string, setup: () => WebAuthnFormatter) {
    it(label + ' toString', t => {
      t.assert.snapshot(setup().toString());
    });
    it(label + ' toJSON', t => {
      t.assert.snapshot(JSON.stringify(setup().toJSON(), null, 2));
    });
  }

  formatterTest('formats no authenticator', () => {
    return new WebAuthnFormatter(undefined);
  });

  formatterTest('formats an authenticator without credentials', () => {
    return new WebAuthnFormatter({
      protocol: 'u2f',
      transport: 'nfc',
      hasResidentKey: false,
      hasUserVerification: false,
      isUserVerified: false,
      credentials: [],
    });
  });

  formatterTest('formats an authenticator with credentials', () => {
    return new WebAuthnFormatter({
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
        {
          credentialId: 'b3RoZXI=',
          isResidentCredential: false,
          signCount: 3,
        },
      ],
    });
  });
});
