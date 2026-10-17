/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zod } from '../third_party/index.js';
import { ToolCategory } from './categories.js';
import { definePageTool } from './ToolDefinition.js';
async function generateTempFilePath() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));
    return path.join(dir, `screencast.mp4`);
}
const supportedExtensions = ['.webm', '.mp4'];
/**
 * Resolves the output extension for the legacy ffmpeg-based recorder.
 *
 * Matches the extension case-insensitively so e.g. `.WEBM` is recognized as
 * WebM. An explicitly requested but unsupported extension is rejected rather
 * than being silently rewritten to `.mp4` (which would change both the format
 * and the output path from what was requested). A missing extension falls
 * back to `.mp4`. The matched extension is normalized to lower case.
 */
function getLegacyExtension(filePath) {
    const requestedExtension = path.extname(filePath);
    const matchedExtension = supportedExtensions.find(supportedExtension => supportedExtension === requestedExtension.toLowerCase());
    if (!matchedExtension && requestedExtension !== '') {
        throw new Error(`Unsupported screencast file extension "${requestedExtension}". ` +
            `Supported formats: ${supportedExtensions.join(', ')} (case-insensitive).`);
    }
    return matchedExtension ?? '.mp4';
}
export const startScreencast = definePageTool((args) => ({
    name: 'screencast_start',
    description: `Starts recording a screencast (video) of the target page.`,
    annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
    },
    schema: {
        filePath: zod
            .string()
            .optional()
            .describe(args?.experimentalScreencast
            ? `Output file path (${supportedExtensions.join(',')} are supported). Uses mkdtemp to generate a unique path if not provided.`
            : 'Output file path (.mp4). Uses mkdtemp to generate a unique path if not provided.'),
    },
    blockedByDialog: false,
    verifyFilesSchema: {
        filePath: true,
    },
    handler: async (request, response, context) => {
        const page = request.page;
        if (page.getScreenRecorder() !== null) {
            response.appendResponseLine('Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.');
            return;
        }
        const requestedFilePath = request.params.filePath;
        const filePath = requestedFilePath ?? (await generateTempFilePath());
        // The built-in Chrome recorder (page.record) always produces mp4. The
        // legacy ffmpeg recorder (page.screencast) also supports WebM.
        const useLegacy = Boolean(args?.experimentalScreencast);
        const extension = useLegacy ? getLegacyExtension(filePath) : '.mp4';
        const resolvedPath = await context.ensureExtension(filePath, extension);
        let recorder;
        try {
            if (useLegacy) {
                const format = extension === '.webm' ? 'webm' : 'mp4';
                recorder = await page.pptrPage.screencast({
                    path: resolvedPath,
                    format,
                    ffmpegPath: args?.experimentalFfmpegPath,
                    fps: args?.screencastFps,
                });
            }
            else {
                recorder = await page.pptrPage.record({
                    path: resolvedPath,
                    fps: args?.screencastFps,
                });
            }
        }
        catch (err) {
            // If we generated a temporary directory for this recording, remove it so
            // a failed start (e.g. ffmpeg missing) does not leak an empty directory.
            if (requestedFilePath === undefined) {
                try {
                    await fs.rm(path.dirname(resolvedPath), {
                        recursive: true,
                        force: true,
                    });
                }
                catch {
                    // no-op
                }
            }
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('ENOENT') && message.includes('ffmpeg')) {
                throw new Error('ffmpeg is required for screencast recording but was not found. ' +
                    'Install ffmpeg (https://ffmpeg.org/) and ensure it is available in your PATH.');
            }
            if (message.includes('Page.startScreenRecording')) {
                throw new Error('The connected Chrome does not support screen recording. Update Chrome to a newer version.');
            }
            throw err;
        }
        page.setScreenRecorder({ recorder, filePath: resolvedPath });
        response.appendResponseLine(`Screencast recording started. The recording will be saved to ${resolvedPath}. Use ${stopScreencast(args).name} to stop recording.`);
    },
}));
export const stopScreencast = definePageTool(() => ({
    name: 'screencast_stop',
    description: 'Stops the active screencast recording on the target page.',
    annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
    },
    schema: {},
    blockedByDialog: false,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const page = request.page;
        const data = page.getScreenRecorder();
        if (!data) {
            response.appendResponseLine('Error: no active screencast recording to stop.');
            return;
        }
        try {
            await data.recorder.stop();
            response.appendResponseLine(`The screencast recording has been stopped and saved to ${data.filePath}.`);
        }
        finally {
            page.setScreenRecorder(null);
        }
    },
}));
//# sourceMappingURL=screencast.js.map