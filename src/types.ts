/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {SerializedAXNode, Viewport, Target} from './third_party/index.js';

export interface ExtensionServiceWorker {
  url: string;
  target: Target;
  id: string;
}

export interface TextSnapshotNode extends SerializedAXNode {
  id: string;
  backendNodeId?: number;
  loaderId?: string;
  children: TextSnapshotNode[];
}

export interface GeolocationOptions {
  latitude: number;
  longitude: number;
}

export interface EmulationSettings {
  networkConditions?: string;
  cpuThrottlingRate?: number;
  geolocation?: GeolocationOptions;
  userAgent?: string;
  colorScheme?: 'dark' | 'light';
  viewport?: Viewport;
  extraHttpHeaders?: Record<string, string>;
}

export type Logger = ((...args: unknown[]) => void) | undefined;

export interface PaginationOptions {
  pageSize?: number;
  pageIdx?: number;
}

export interface CD4AEditorAnchorSignature {
  /** 1-based line number for CodeMirror text editor anchors */
  lineNumber: number;
  /** File path associated with the editor */
  filePath?: string;
}

export interface CD4ACommentThread {
  id: string;
  text: string;
  networkRequestId?: string;
  backendNodeId?: number;
  editor?: CD4AEditorAnchorSignature;
}

export interface CD4ARevealTarget {
  networkRequestId?: string;
  backendNodeId?: number;
  targetId?: string;
}

export enum CD4ABridgeEvents {
  COMMENT_THREADS_CHANGED = 'CommentThreadsChanged',
}

export interface CD4ABridge {
  dispose?(): void;
  getCommentThreads(): CD4ACommentThread[];
  takeComments(): CD4ACommentThread[];
  resolveCommentThread(threadId: string, replyText?: string): boolean;
  reveal(panelName?: string, target?: CD4ARevealTarget): Promise<void>;
  addEventListener(
    event: CD4ABridgeEvents | 'CommentThreadsChanged' | string,
    listener: () => void,
  ): void;
  removeEventListener?(
    event: CD4ABridgeEvents | 'CommentThreadsChanged' | string,
    listener: () => void,
  ): void;
}

export type CommentThread = CD4ACommentThread;
export type RevealTarget = CD4ARevealTarget;
export type EditorAnchorSignature = CD4AEditorAnchorSignature;

declare global {
  interface Window {
    universe?: {
      cd4aBridge?: CD4ABridge | null;
    };
    __onDevToolsCommentEvent?: () => void;
    __onDevToolsCommentListener?: () => void;
  }
}
