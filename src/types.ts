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
}
