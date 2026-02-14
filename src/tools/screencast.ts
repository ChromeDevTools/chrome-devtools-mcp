/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {zod} from '../third_party/index.js';
import type {ScreenRecorder, VideoFormat} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import type {Context, Response} from './ToolDefinition.js';
import {defineTool} from './ToolDefinition.js';

async function generateTempFilePath(format: VideoFormat): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));
  return path.join(dir, `screencast.${format}`);
}

export const startScreencast = defineTool({
  name: 'screencast_start',
  description:
    'Starts recording a screencast (video) of the selected page. Requires ffmpeg to be installed on the system.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['screencast'],
  },
  schema: {
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute file path, or a file path relative to the current working directory, to save the screencast to. For example, recording.webm. If not specified, a temporary file will be created.',
      ),
    format: zod
      .enum(['webm', 'mp4', 'gif'])
      .default('webm')
      .describe('Specifies the output file format. Default is "webm".'),
    quality: zod
      .number()
      .min(0)
      .max(63)
      .optional()
      .describe(
        'Recording quality (CRF) between 0-63. Lower values mean better quality but larger files. Default is 30.',
      ),
    fps: zod
      .number()
      .optional()
      .describe('Frame rate in frames per second. Default is 30 (20 for GIF).'),
    scale: zod
      .number()
      .optional()
      .describe(
        'Scales the output video. For example, 0.5 will halve the dimensions. Default is 1.',
      ),
    speed: zod
      .number()
      .optional()
      .describe(
        'Playback speed multiplier. For example, 2 will double the speed. Default is 1.',
      ),
  },
  handler: async (request, response, context) => {
    if (context.getScreenRecorder() !== null) {
      response.appendResponseLine(
        'Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.',
      );
      return;
    }

    const format = request.params.format as VideoFormat;
    const filePath =
      request.params.filePath ?? (await generateTempFilePath(format));
    const resolvedPath = path.resolve(filePath);

    const page = context.getSelectedPage();

    let recorder: ScreenRecorder;
    try {
      recorder = await page.screencast({
        path: resolvedPath as `${string}.${VideoFormat}`,
        format,
        quality: request.params.quality,
        fps: request.params.fps,
        scale: request.params.scale,
        speed: request.params.speed,
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
      `Screencast recording started. The recording will be saved to ${resolvedPath}. Use screencast_stop to stop recording.`,
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
    await stopScreencastAndAppendOutput(response, context);
  },
});

async function stopScreencastAndAppendOutput(
  response: Response,
  context: Context,
): Promise<void> {
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
}
