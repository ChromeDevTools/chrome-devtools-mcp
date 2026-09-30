/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SerializedAXNode,
  Viewport,
  Target,
  DevTools,
} from './third_party/index.js';

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

export type CD4ACommentThread = DevTools.CD4ABridge.CommentThread;
export type CD4ARevealTarget = DevTools.CD4ABridge.RevealTarget;

export enum CD4ABridgeEvents {
  COMMENT_THREADS_CHANGED = 'CommentThreadsChanged',
}

/**
 * Functions evaluated in the DevTools page cannot reference `CD4ABridgeEvents`
 * at runtime, so they pass the string value instead.
 */
export type CD4ABridgeEventName = `${CD4ABridgeEvents}`;

export type CD4ABridge = Omit<
  DevTools.CD4ABridge.CD4ABridge,
  'addEventListener' | 'removeEventListener'
> & {
  addEventListener(event: CD4ABridgeEventName, listener: () => void): void;
  removeEventListener(event: CD4ABridgeEventName, listener: () => void): void;
};

export type CommentThread = CD4ACommentThread;
export type RevealTarget = CD4ARevealTarget;

declare global {
  interface Window {
    universe?: {
      cd4aBridge?: CD4ABridge | null;
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __onDevToolsCommentEvent?: () => void;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __onDevToolsCommentListener?: () => void;
  }
}
