/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpPage} from '../McpPage.js';
import type {Context} from '../tools/ToolDefinition.js';

export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplateDefinition {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceHandler {
  read: (
    uri: URL,
    context: Context,
  ) => Promise<{content: string | Buffer; mimeType: string}>;
}

export interface PageResourceDefinition {
  template: ResourceTemplateDefinition;
  handler: (
    page: McpPage,
    context: Context,
  ) => Promise<{content: string | Buffer; mimeType: string}>;
}

export function definePageResource(
  definition: PageResourceDefinition,
): PageResourceDefinition {
  return definition;
}
