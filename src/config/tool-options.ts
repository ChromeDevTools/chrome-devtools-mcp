/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from '../third_party/index.js';

interface ToolOption extends YargsOptions {
  reloadable: true;
}

/**
 * Options that change the default behavior of tools.
 */
export const toolOptions = {
  screenshotFormat: {
    type: 'string',
    default: 'png' as const,
    description:
      'Override the default output format used by take_screenshot when the caller does not specify one. JPEG and WebP are ~3-5x smaller than PNG, which reduces transfer and storage size. To reduce context size use --screenshotMaxWidth / --screenshotMaxHeight, since image tokens scale with dimensions rather than encoded bytes. Unset preserves the existing default ("png").',
    choices: ['jpeg', 'png', 'webp'] as const,
    reloadable: true,
  },
  screenshotQuality: {
    type: 'number',
    description:
      'Override the default compression quality (0-100) used by take_screenshot for JPEG and WebP when the caller does not specify one. Lower values mean smaller files. Ignored for PNG. Unset preserves the Puppeteer default.',
    reloadable: true,
    coerce: (value: number | undefined): number | undefined => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new Error(
          `Invalid screenshotQuality ${value}. Expected an integer between 0 and 100.`,
        );
      }
      return value;
    },
  },
  screenshotMaxWidth: {
    type: 'number',
    description:
      'Maximum width in pixels for screenshots. If the captured image is wider, it is downscaled (preserving aspect ratio) before being returned. Reduces context size in AI conversations. Unset means no resize.',
    reloadable: true,
    coerce: (value: number | undefined): number | undefined => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
          `Invalid screenshotMaxWidth ${value}. Expected a positive integer.`,
        );
      }
      return value;
    },
  },
  screenshotMaxHeight: {
    type: 'number',
    description:
      'Maximum height in pixels for screenshots. If the captured image is taller, it is downscaled (preserving aspect ratio) before being returned. Can be combined with --screenshot-max-width; the smaller scale factor wins. Unset means no resize.',
    reloadable: true,
    coerce: (value: number | undefined): number | undefined => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
          `Invalid screenshotMaxHeight ${value}. Expected a positive integer.`,
        );
      }
      return value;
    },
  },
} satisfies Record<string, ToolOption>;
