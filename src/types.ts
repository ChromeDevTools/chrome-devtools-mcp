/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {SerializedAXNode, Viewport} from './third_party/index.js';

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

export interface TextSnapshot {
  root: TextSnapshotNode;
  idToNode: Map<string, TextSnapshotNode>;
  snapshotId: string;
  selectedElementUid?: string;
  // It might happen that there is a selected element, but it is not part of the
  // snapshot. This flag indicates if there is any selected element.
  hasSelectedElement: boolean;
  verbose: boolean;
}

export interface EmulationSettings {
  networkConditions?: string | null;
  cpuThrottlingRate?: number | null;
  geolocation?: GeolocationOptions | null;
  userAgent?: string | null;
  colorScheme?: 'dark' | 'light' | null;
  viewport?: Viewport | null;
}

// Debugger types
export interface DebuggerBreakpointInfo {
  breakpointId: string;
  url: string;
  lineNumber: number;
  columnNumber?: number;
  condition?: string;
  locations: Array<{scriptId: string; lineNumber: number; columnNumber: number}>;
}

export interface DebuggerPausedState {
  callFrames: Array<{
    callFrameId: string;
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    scopeChain: Array<{
      type: string;
      name?: string;
      objectId?: string;
    }>;
  }>;
  reason: string;
  hitBreakpoints?: string[];
}

export interface DebuggerScriptInfo {
  scriptId: string;
  url: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  sourceMapURL?: string;
}

export interface DebuggerState {
  enabled: boolean;
  paused: DebuggerPausedState | null;
  breakpoints: Map<string, DebuggerBreakpointInfo>;
  scripts: Map<string, DebuggerScriptInfo>;
}
