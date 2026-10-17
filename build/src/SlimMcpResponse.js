/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { McpResponse } from './McpResponse.js';
export class SlimMcpResponse extends McpResponse {
    async handle(_context) {
        const error = this.error;
        const responseText = error
            ? [...this.responseLines, `Error: ${error.message}`].join('\n')
            : this.responseLines.join('\n');
        const text = {
            type: 'text',
            text: responseText,
        };
        return {
            content: [text],
            structuredContent: text,
        };
    }
}
//# sourceMappingURL=SlimMcpResponse.js.map