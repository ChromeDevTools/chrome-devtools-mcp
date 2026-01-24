/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const enableWebAuthn = defineTool({
  name: 'webauthn_enable',
  description: 'Enable the WebAuthn virtual authenticator environment for the selected page.',
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
    response.appendResponseLine('WebAuthn virtual authenticator environment enabled.');
  },
});
