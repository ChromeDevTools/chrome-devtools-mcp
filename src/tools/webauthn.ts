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

export const removeVirtualAuthenticator = defineTool({
  name: 'webauthn_remove_authenticator',
  description: 'Remove a virtual WebAuthn authenticator.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    authenticatorId: zod
      .string()
      .describe('The ID of the authenticator to remove.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    // @ts-expect-error _client is internal Puppeteer API
    const session = page._client() as CDPSession;

    await session.send('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: request.params.authenticatorId,
    });

    response.appendResponseLine(
      `Removed virtual authenticator (authenticatorId: ${request.params.authenticatorId})`,
    );
  },
});

export const getCredentials = defineTool({
  name: 'webauthn_get_credentials',
  description: 'Get all credentials registered with a virtual authenticator.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: true,
  },
  schema: {
    authenticatorId: zod
      .string()
      .describe('The ID of the authenticator to get credentials from.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    // @ts-expect-error _client is internal Puppeteer API
    const session = page._client() as CDPSession;

    const result = await session.send('WebAuthn.getCredentials', {
      authenticatorId: request.params.authenticatorId,
    });

    if (result.credentials.length === 0) {
      response.appendResponseLine('No credentials registered.');
    } else {
      response.appendResponseLine(
        `Found ${result.credentials.length} credential(s):`,
      );
      for (const cred of result.credentials) {
        response.appendResponseLine(
          `- credentialId: ${cred.credentialId}, rpId: ${cred.rpId}, signCount: ${cred.signCount}`,
        );
      }
    }
  },
});

export const addCredential = defineTool({
  name: 'webauthn_add_credential',
  description: 'Add a credential to a virtual authenticator.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    authenticatorId: zod
      .string()
      .describe('The ID of the authenticator to add the credential to.'),
    credentialId: zod.string().describe('The credential ID (base64 encoded).'),
    isResidentCredential: zod
      .boolean()
      .describe('Whether this is a resident (discoverable) credential.'),
    rpId: zod.string().describe('The relying party ID.'),
    privateKey: zod
      .string()
      .describe('The private key in PKCS#8 format (base64 encoded).'),
    userHandle: zod
      .string()
      .optional()
      .describe('The user handle (base64 encoded).'),
    signCount: zod.number().int().optional().describe('The signature counter.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    // @ts-expect-error _client is internal Puppeteer API
    const session = page._client() as CDPSession;

    const {
      authenticatorId,
      credentialId,
      isResidentCredential,
      rpId,
      privateKey,
      userHandle,
      signCount,
    } = request.params;

    await session.send('WebAuthn.addCredential', {
      authenticatorId,
      credential: {
        credentialId,
        isResidentCredential,
        rpId,
        privateKey,
        userHandle,
        signCount: signCount ?? 0,
      },
    });

    response.appendResponseLine(
      `Added credential (credentialId: ${credentialId}) to authenticator ${authenticatorId}`,
    );
  },
});

export const clearCredentials = defineTool({
  name: 'webauthn_clear_credentials',
  description: 'Clear all credentials from a virtual authenticator.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    authenticatorId: zod
      .string()
      .describe('The ID of the authenticator to clear credentials from.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    // @ts-expect-error _client is internal Puppeteer API
    const session = page._client() as CDPSession;

    await session.send('WebAuthn.clearCredentials', {
      authenticatorId: request.params.authenticatorId,
    });

    response.appendResponseLine(
      `Cleared all credentials from authenticator ${request.params.authenticatorId}`,
    );
  },
});

export const setUserVerified = defineTool({
  name: 'webauthn_set_user_verified',
  description:
    'Set whether user verification succeeds or fails for a virtual authenticator.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    authenticatorId: zod.string().describe('The ID of the authenticator.'),
    isUserVerified: zod
      .boolean()
      .describe('Whether user verification should succeed.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    // @ts-expect-error _client is internal Puppeteer API
    const session = page._client() as CDPSession;

    await session.send('WebAuthn.setUserVerified', {
      authenticatorId: request.params.authenticatorId,
      isUserVerified: request.params.isUserVerified,
    });

    response.appendResponseLine(
      `Set user verification to ${request.params.isUserVerified} for authenticator ${request.params.authenticatorId}`,
    );
  },
});
