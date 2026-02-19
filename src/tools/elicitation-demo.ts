/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod, ElicitResultSchema, type ElicitRequestFormParams} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Pre-built elicitation form schemas for each demo scenario.
 * Each scenario exercises different field types supported by MCP elicitation.
 */
function buildElicitParams(scenario: string): ElicitRequestFormParams | undefined {
  switch (scenario) {
    case 'all-fields':
      return {
        message: '🧪 Elicitation Demo — All Field Types\n\nThis form exercises every supported field type in MCP elicitation.',
        requestedSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              title: 'Your Name',
              description: 'A simple text input',
            },
            email: {
              type: 'string',
              title: 'Email Address',
              description: 'Text input with email format validation',
              format: 'email',
            },
            age: {
              type: 'number',
              title: 'Age',
              description: 'Numeric input with min/max constraints',
              minimum: 0,
              maximum: 150,
            },
            agree: {
              type: 'boolean',
              title: 'I agree to the terms',
              description: 'A boolean checkbox',
              default: false,
            },
            language: {
              type: 'string',
              title: 'Preferred Language',
              description: 'Single-select dropdown (enum)',
              enum: ['typescript', 'javascript', 'python', 'rust', 'go'],
              enumNames: ['TypeScript', 'JavaScript', 'Python', 'Rust', 'Go'],
            },
            features: {
              type: 'array',
              title: 'Features to Enable',
              description: 'Multi-select checkboxes (array of enum)',
              items: {
                type: 'string',
                enum: ['dark-mode', 'notifications', 'auto-save', 'telemetry'],
              },
            },
          },
          required: ['name'],
        },
      };

    case 'simple-text':
      return {
        message: 'Please enter a value:',
        requestedSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'string',
              title: 'Input Value',
              description: 'Enter any text',
            },
          },
          required: ['value'],
        },
      };

    case 'contact-form':
      return {
        message: '📋 Contact Information\n\nPlease provide your contact details.',
        requestedSchema: {
          type: 'object',
          properties: {
            fullName: {
              type: 'string',
              title: 'Full Name',
              minLength: 2,
              maxLength: 100,
            },
            email: {
              type: 'string',
              title: 'Email',
              format: 'email',
            },
            website: {
              type: 'string',
              title: 'Website',
              format: 'uri',
            },
            age: {
              type: 'integer',
              title: 'Age',
              minimum: 18,
              maximum: 120,
            },
          },
          required: ['fullName', 'email'],
        },
      };

    case 'preferences':
      return {
        message: '⚙️ Preferences\n\nCustomize your settings.',
        requestedSchema: {
          type: 'object',
          properties: {
            theme: {
              type: 'string',
              title: 'Theme',
              enum: ['light', 'dark', 'auto'],
              enumNames: ['Light Mode', 'Dark Mode', 'System Default'],
              default: 'auto',
            },
            notifications: {
              type: 'boolean',
              title: 'Enable Notifications',
              default: true,
            },
            languages: {
              type: 'array',
              title: 'Programming Languages',
              description: 'Select languages you work with',
              items: {
                anyOf: [
                  {const: 'ts', title: 'TypeScript'},
                  {const: 'js', title: 'JavaScript'},
                  {const: 'py', title: 'Python'},
                  {const: 'rs', title: 'Rust'},
                  {const: 'go', title: 'Go'},
                ],
              },
            },
            maxResults: {
              type: 'number',
              title: 'Max Results',
              description: 'Number of results to display',
              minimum: 1,
              maximum: 100,
              default: 25,
            },
          },
        },
      };

    case 'confirmation':
      return {
        message: '⚠️ Confirm Action\n\nAre you sure you want to proceed? This action cannot be undone.',
        requestedSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              title: 'Yes, I confirm',
              default: false,
            },
            reason: {
              type: 'string',
              title: 'Reason (optional)',
              description: 'Why are you performing this action?',
            },
          },
          required: ['confirm'],
        },
      };

    default:
      return undefined;
  }
}

export const elicitationDemo = defineTool({
  name: 'exp_elicitation_demo',
  description: `Demonstrates the MCP Elicitation feature — interactive forms that collect user input during tool execution.

Exercises all 6 supported field types:
- **string**: Text input (with optional format: email, uri, date, date-time)
- **number/integer**: Numeric input (with optional min/max)
- **boolean**: Checkbox
- **enum** (string+enum): Single-select dropdown
- **array** (with enum items): Multi-select checkboxes
- **oneOf** (string+oneOf): Single-select with display titles

The user can accept, decline, or cancel the form. The tool returns whatever the user submitted.

This is a diagnostic tool for testing elicitation support in MCP clients.`,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['standalone', 'devDiagnostic'],
  },
  schema: {
    scenario: zod
      .enum(['all-fields', 'simple-text', 'contact-form', 'preferences', 'confirmation'])
      .optional()
      .default('all-fields')
      .describe(
        'Which demo scenario to run. "all-fields" exercises every field type. ' +
        'Others show focused use cases.',
      ),
  },
  handler: async (request, response, extra) => {
    const {scenario} = request.params;
    const scenarios = ['all-fields', 'simple-text', 'contact-form', 'preferences', 'confirmation'];

    const elicitParams = buildElicitParams(scenario);
    if (!elicitParams) {
      response.appendResponseLine(`Unknown scenario: "${scenario}". Available: ${scenarios.join(', ')}`);
      return;
    }

    response.appendResponseLine(`## Elicitation Demo: "${scenario}"`);
    response.appendResponseLine('');
    response.appendResponseLine('Sending elicitation request to client...');
    response.appendResponseLine('');

    const result = await extra.sendRequest(
      {
        method: 'elicitation/create',
        params: elicitParams,
      },
      ElicitResultSchema,
    );

    response.appendResponseLine('### Result');
    response.appendResponseLine('');
    response.appendResponseLine(`**Action:** \`${result.action}\``);
    response.appendResponseLine('');

    if (result.action === 'accept' && result.content) {
      response.appendResponseLine('**Submitted data:**');
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result.content, null, 2));
      response.appendResponseLine('```');
    } else if (result.action === 'decline') {
      response.appendResponseLine('The user explicitly declined the request.');
    } else if (result.action === 'cancel') {
      response.appendResponseLine('The user cancelled (dismissed without choosing).');
    }
  },
});
