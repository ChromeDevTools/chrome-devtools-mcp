/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
  handler: async (_request, response, _context) => {
    // Skeleton - does nothing yet
    response.appendResponseLine('WebAuthn enabled');
  },
});
