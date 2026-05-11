/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pageResources from './pages.js';
import type {PageResourceDefinition} from './ResourceDefinition.js';

export const allPageResources: PageResourceDefinition[] = [
  pageResources.pageSourceResource,
  pageResources.consoleLogsResource,
  pageResources.screenshotResource,
  pageResources.networkActivityResource,
  pageResources.a11yTreeResource,
  pageResources.selectedElementResource,
  pageResources.selectedRequestResource,
  pageResources.devtoolsMessagesResource,
  pageResources.traceResource,
];

export function matchPageResource(
  uri: string,
): {pageId: number; resource: PageResourceDefinition} | undefined {
  const url = new URL(uri);
  if (url.protocol !== 'page:') {
    return undefined;
  }
  const pageId = parseInt(url.host, 10);
  if (isNaN(pageId)) {
    return undefined;
  }

  const path = url.pathname.slice(1); // remove leading slash
  for (const resource of allPageResources) {
    if (resource.template.uriTemplate.endsWith(`/${path}`)) {
      return {pageId, resource};
    }
  }
  return undefined;
}
