/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {zod} from '../third_party/index.js';
import type {ScreenRecorder, VideoFormat} from '../third_party/index.js';
import {ensureExtension} from '../utils/files.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

async function generateTempFilePath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));
  return path.join(dir, `screencast.mp4`);
}

const supportedExtensions: Array<`.${string}`> = ['.webm', '.mp4'];

export const startScreencast = definePageTool(args => ({
  name: 'screencast_start',
  description: `Starts recording a screencast (video) of the selected page in specified format.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalScreencast'],
  },
  schema: {
    filePath: zod
      .string()
      .optional()
      .describe(
        `Output file path (${supportedExtensions.join(',')} are supported). Uses mkdtemp to generate a unique path if not provided.`,
      ),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    context.validatePath(request.params.filePath);
    if (context.getScreenRecorder() !== null) {
      response.appendResponseLine(
        'Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.',
      );
      return;
    }

    const filePath = request.params.filePath ?? (await generateTempFilePath());
    let enforcedExtension = '.mp4' as `.${string}`;
    let format: VideoFormat = 'mp4';

    for (const supportedExtension of supportedExtensions) {
      if (filePath.endsWith(supportedExtension)) {
        enforcedExtension = supportedExtension;
        format = supportedExtension.substring(1) as VideoFormat;
        break;
      }
    }

    const resolvedPath = ensureExtension(
      path.resolve(filePath),
      enforcedExtension,
    ) as `${string}.webm`;

    const page = request.page;

    let recorder: ScreenRecorder;
    try {
      recorder = await page.pptrPage.screencast({
        path: resolvedPath,
        format: format,
        ffmpegPath: args?.experimentalFfmpegPath,
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
}));

export const stopScreencast = definePageTool({
  name: 'screencast_stop',
  description: 'Stops the active screencast recording on the selected page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalScreencast'],
  },
  schema: {},
  blockedByDialog: false,
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
