/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {parseArgs} from 'node:util';

import {GoogleGenAI} from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const {values, positionals} = parseArgs({
  options: {
    model: {
      type: 'string',
      default: 'gemini-2.5-flash',
    },
  },
  allowPositionals: true,
});

if (!positionals[0]) {
  console.error('Usage: npm run count-tokens -- -- <text>');
  process.exit(1);
}

const response = await ai.models.countTokens({
  model: values.model,
  contents: positionals[0],
});
console.log(`Input: ${positionals[0]}`);
console.log(`Tokens: ${response.totalTokens}`);
