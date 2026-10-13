/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Flags, OutputMode, Result, RunnerResult} from 'lighthouse';
import type {Page} from 'puppeteer-core';

export declare function snapshot(
  page: Page,
  options: {flags?: Flags},
): Promise<RunnerResult | undefined>;

export declare function navigation(
  page: Page,
  url: string,
  options: {flags?: Flags},
): Promise<RunnerResult | undefined>;

export declare function generateReport(lhr: Result, format: OutputMode): string;
