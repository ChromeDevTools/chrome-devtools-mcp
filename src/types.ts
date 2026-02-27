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
