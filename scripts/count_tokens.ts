/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';

import {GoogleGenAI} from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const {values, positionals} = parseArgs({
  options: {
    model: {
      type: 'string',
      default: 'gemini-2.5-flash',
    },
    file: {
      type: 'string',
      short: 'f',
    },
  },
  allowPositionals: true,
});

let contents = positionals[0];

if (values.file) {
  contents = readFileSync(values.file, 'utf8');
}

if (!contents) {
  console.error('Usage: npm run count-tokens -- [-f <file>] [<text>]');
  process.exit(1);
}

const response = await ai.models.countTokens({
  model: values.model,
  contents,
});
console.log(`Input: ${values.file || positionals[0]}`);
console.log(`Tokens: ${response.totalTokens}`);
