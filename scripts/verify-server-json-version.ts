/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';

const serverJsonFilePath = './server.json';
const serverJson = JSON.parse(fs.readFileSync(serverJsonFilePath, 'utf-8'));
fs.unlinkSync(serverJsonFilePath);

// Create the new server.json
execSync('./mcp-publisher init');

const newServerJson = JSON.parse(fs.readFileSync(serverJsonFilePath, 'utf-8'));

const propertyToVerify = ['$schema'];
const diffProps = [];

for (const prop of propertyToVerify) {
  if (serverJson[prop] !== newServerJson[prop]) {
    diffProps.push(prop);
  }
}

fs.writeFileSync('./server.json', JSON.stringify(serverJson, null, 2));

if (diffProps.length) {
  throw new Error(
    `The following props did not match the latest init value:\n${diffProps.map(
      prop => `- "${prop}": "${newServerJson[prop]}"`,
    )}`,
  );
}
