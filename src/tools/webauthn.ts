/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

const ACTIONS = [
  'status',
  'enable',
  'disable',
  'addAuthenticator',
  'removeAuthenticator',
  'setUserVerified',
] as const;

type WebauthnAction = (typeof ACTIONS)[number];

type CdpClient = {
  send(method: string, params?: unknown): Promise<unknown>;
};

function getCdpClient(page: {pptrPage: unknown}): CdpClient {
  // Puppeteer does not expose this via a stable public API yet.
  // @ts-expect-error internal API
  const client = page.pptrPage._client?.();
  if (!client || typeof client.send !== 'function') {
    throw new Error('Unable to access CDP session for the selected page.');
  }
  return client as CdpClient;
}

async function getStatus(client: CdpClient) {
  try {
    const result = (await client.send(
      'WebAuthn.getCredentials',
      {},
    )) as {credentials?: unknown[]};
    return {
      enabled: true,
      authenticators: [] as Array<Record<string, unknown>>,
      credentials: result.credentials ?? [],
    };
  } catch {
    return {
      enabled: false,
      authenticators: [] as Array<Record<string, unknown>>,
      credentials: [] as unknown[],
    };
  }
}

async function handleAction(
  action: WebauthnAction,
  params: {
    authenticatorId?: string;
    userVerified?: boolean;
    protocol?: 'ctap2' | 'u2f';
    transport?: 'usb' | 'nfc' | 'ble' | 'internal';
    hasResidentKey?: boolean;
    hasUserVerification?: boolean;
    automaticPresenceSimulation?: boolean;
    isUserVerified?: boolean;
  },
  client: CdpClient,
) {
  switch (action) {
    case 'status':
      return {action, result: 'ok'};
    case 'enable':
      await client.send('WebAuthn.enable');
      return {action, result: 'enabled'};
    case 'disable':
      await client.send('WebAuthn.disable');
      return {action, result: 'disabled'};
    case 'addAuthenticator': {
      const addResult = (await client.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: params.protocol ?? 'ctap2',
          transport: params.transport ?? 'internal',
          hasResidentKey: params.hasResidentKey ?? true,
          hasUserVerification: params.hasUserVerification ?? true,
          automaticPresenceSimulation:
            params.automaticPresenceSimulation ?? true,
          isUserVerified: params.isUserVerified ?? true,
        },
      })) as {authenticatorId?: string};
      return {
        action,
        result: 'addedAuthenticator',
        authenticatorId: addResult.authenticatorId,
      };
    }
    case 'removeAuthenticator': {
      if (!params.authenticatorId) {
        throw new Error('authenticatorId is required for removeAuthenticator');
      }
      await client.send('WebAuthn.removeVirtualAuthenticator', {
        authenticatorId: params.authenticatorId,
      });
      return {action, result: 'removedAuthenticator'};
    }
    case 'setUserVerified': {
      if (!params.authenticatorId) {
        throw new Error('authenticatorId is required for setUserVerified');
      }
      await client.send('WebAuthn.setUserVerified', {
        authenticatorId: params.authenticatorId,
        isUserVerified: params.userVerified ?? true,
      });
      return {action, result: 'setUserVerified'};
    }
    default:
      throw new Error(`Unsupported action: ${action as string}`);
  }
}

export const configureWebauthn = definePageTool({
  name: 'configure_webauthn',
  description:
    'Configure experimental WebAuthn virtual authenticator state. Always returns status in the response.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalWebauthn'],
  },
  schema: {
    action: zod
      .enum(ACTIONS)
      .default('status')
      .describe('Action to apply to WebAuthn virtual authenticator state.'),
    authenticatorId: zod
      .string()
      .optional()
      .describe('Virtual authenticator ID for targeted actions.'),
    userVerified: zod
      .boolean()
      .optional()
      .describe('User verification state for setUserVerified action.'),
    protocol: zod
      .enum(['ctap2', 'u2f'])
      .optional()
      .describe('Authenticator protocol for addAuthenticator.'),
    transport: zod
      .enum(['usb', 'nfc', 'ble', 'internal'])
      .optional()
      .describe('Authenticator transport for addAuthenticator.'),
    hasResidentKey: zod
      .boolean()
      .optional()
      .describe('Whether resident keys are supported for addAuthenticator.'),
    hasUserVerification: zod
      .boolean()
      .optional()
      .describe('Whether user verification is supported for addAuthenticator.'),
    automaticPresenceSimulation: zod
      .boolean()
      .optional()
      .describe('Whether presence simulation is enabled for addAuthenticator.'),
    isUserVerified: zod
      .boolean()
      .optional()
      .describe('Initial user verification value for addAuthenticator.'),
  },
  handler: async ({params, page}, response) => {
    const client = getCdpClient(page);
    const actionResult = await handleAction(params.action, params, client);
    const status = await getStatus(client);

    response.appendResponseLine('WebAuthn status:');
    response.appendResponseLine(`- enabled: ${status.enabled}`);
    response.appendResponseLine(
      `- authenticators: ${status.authenticators.length}`,
    );
    response.appendResponseLine(`- credentials: ${status.credentials.length}`);
    response.appendResponseLine(`Action result: ${JSON.stringify(actionResult)}`);
  },
});

