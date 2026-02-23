/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['./build/src/index.js'],
});

const client = new Client(
  {name: 'measurer', version: '1.0.0'},
  {capabilities: {}},
);
await client.connect(transport);

const toolsList = await client.listTools();
const jsonString = JSON.stringify(toolsList.tools);
console.log(jsonString);
await client.close();
