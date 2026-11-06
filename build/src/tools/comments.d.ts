/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CD4ACommentThread, CD4ARevealTarget } from '../types.js';
import { type PageToolFactory } from './ToolDefinition.js';
export type CommentThreadPayload = CD4ACommentThread;
export type RevealTargetPayload = CD4ARevealTarget;
export declare const openDevtools: PageToolFactory;
export declare const getDevtoolsComments: PageToolFactory;
export declare const resolveDevtoolsComment: PageToolFactory;
export declare const revealInDevtools: PageToolFactory;
