/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Frame, type Page, type WebWorker } from '../third_party/index.js';
import { type ToolFactory } from './ToolDefinition.js';
export type Evaluatable = Page | Frame | WebWorker;
export declare const evaluateScript: ToolFactory;
