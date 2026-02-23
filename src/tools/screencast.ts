/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {zod} from '../third_party/index.js';
import type {ScreenRecorder} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

async function generateTempFilePath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));
  return path.join(dir, `screencast.mp4`);
}

export const startScreencast = defineTool({
  name: 'screencast_start',
  description:
    'Starts recording a screencast (video) of the selected page in mp4 format.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['screencast'],
  },
  schema: {
    path: zod
      .string()
      .optional()
      .describe(
        'Output path. Uses mkdtemp to generate a unique path if not provided.',
      ),
  },
  handler: async (request, response, context) => {
    if (context.getScreenRecorder() !== null) {
      response.appendResponseLine(
        'Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.',
      );
      return;
    }

    const filePath = request.params.path ?? (await generateTempFilePath());
    const resolvedPath = path.resolve(filePath);

    const page = context.getSelectedPage();

    let recorder: ScreenRecorder;
    try {
      recorder = await page.screencast({
        path: resolvedPath as `${string}.mp4`,
        format: 'mp4' as const,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ENOENT') && message.includes('ffmpeg')) {
        throw new Error(
          'ffmpeg is required for screencast recording but was not found. ' +
            'Install ffmpeg (https://ffmpeg.org/) and ensure it is available in your PATH.',
        );
      }
      throw err;
    }

    context.setScreenRecorder({recorder, filePath: resolvedPath});

    response.appendResponseLine(
      `Screencast recording started. The recording will be saved to ${resolvedPath}. Use ${stopScreencast.name} to stop recording.`,
    );
  },
});

export const stopScreencast = defineTool({
  name: 'screencast_stop',
  description: 'Stops the active screencast recording on the selected page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['screencast'],
  },
  schema: {},
  handler: async (_request, response, context) => {
    const data = context.getScreenRecorder();
    if (!data) {
      return;
    }
    try {
      await data.recorder.stop();
      response.appendResponseLine(
        `The screencast recording has been stopped and saved to ${data.filePath}.`,
      );
    } finally {
      context.setScreenRecorder(null);
    }
  },
});
