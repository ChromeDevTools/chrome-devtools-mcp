/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import {DevTools} from '../third_party/index.js';

// This key is expected to be visible. b/349721878
const CRUX_API_KEY = 'AIzaSyBn5gimNjhiEyA_euicSKko6IlD3HdgUfk';
const CRUX_ENDPOINT = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_API_KEY}`;

export type PageScope = 'url' | 'origin';
export type DeviceScope = 'ALL' | 'DESKTOP' | 'PHONE' | 'TABLET';

export interface CrUXResponse {
  record: {
    key: {
      url?: string;
      origin?: string;
      formFactor?: string;
    };
    metrics: Record<string, unknown>;
    collectionPeriod: unknown;
  };
}

const DEVICE_SCOPE_LIST: DeviceScope[] = ['ALL', 'DESKTOP', 'PHONE'];
const PAGE_SCOPE_LIST: PageScope[] = ['origin', 'url'];

function mockCrUXManager(): void {
  const originalInstance = DevTools.CrUXManager.CrUXManager.instance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (DevTools.CrUXManager.CrUXManager as any).instance = (opts: any) => {
    try {
      return originalInstance.call(DevTools.CrUXManager.CrUXManager, opts);
    } catch {
      return {
        getSelectedScope: () => ({pageScope: 'url', deviceScope: 'ALL'}),
      };
    }
  };
}

export function ensureCrUXManager(): void {
  try {
    // Ensure Settings instance
    try {
      DevTools.Common.Settings.Settings.instance();
    } catch {
      const storage = new DevTools.Common.Settings.SettingsStorage({});
      DevTools.Common.Settings.Settings.instance({
        forceNew: true,
        syncedStorage: storage,
        globalStorage: storage,
        localStorage: storage,
        settingRegistrations:
          DevTools.Common.SettingRegistration.getRegisteredSettings(),
      });
    }

    // Ensure TargetManager instance
    DevTools.TargetManager.instance();

    // Ensure CrUXManager instance
    DevTools.CrUXManager.CrUXManager.instance();
  } catch {
    mockCrUXManager();
  }
}

async function makeRequest(params: {
  url?: string;
  origin?: string;
  formFactor?: string;
}): Promise<CrUXResponse | null> {
  try {
    const response = await fetch(CRUX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        referer: 'devtools://mcp',
      },
      body: JSON.stringify(params),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      logger(`CrUX API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return (await response.json()) as CrUXResponse;
  } catch (e) {
    logger(`CrUX API fetch failed: ${e}`);
    return null;
  }
}

export async function getFieldDataForPage(
  pageUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any /* CrUXManager.PageResult */> {
  const url = new URL(pageUrl);
  url.hash = '';
  url.search = '';
  const normalizedUrl = url.href;
  const origin = url.origin;
  const hostname = url.hostname;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageResult: any = {
    'origin-ALL': null,
    'origin-DESKTOP': null,
    'origin-PHONE': null,
    'origin-TABLET': null,
    'url-ALL': null,
    'url-DESKTOP': null,
    'url-PHONE': null,
    'url-TABLET': null,
    warnings: [],
    normalizedUrl,
  };

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    !origin.startsWith('http')
  ) {
    return pageResult;
  }

  const promises: Array<Promise<void>> = [];

  for (const pageScope of PAGE_SCOPE_LIST) {
    for (const deviceScope of DEVICE_SCOPE_LIST) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = {
        metrics: [
          'first_contentful_paint',
          'largest_contentful_paint',
          'cumulative_layout_shift',
          'interaction_to_next_paint',
          'round_trip_time',
          'form_factors',
          'largest_contentful_paint_image_time_to_first_byte',
          'largest_contentful_paint_image_resource_load_delay',
          'largest_contentful_paint_image_resource_load_duration',
          'largest_contentful_paint_image_element_render_delay',
        ],
      };
      if (pageScope === 'url') {
        params.url = normalizedUrl;
      } else {
        params.origin = origin;
      }

      if (deviceScope !== 'ALL') {
        params.formFactor = deviceScope;
      }

      const promise = makeRequest(params).then(response => {
        pageResult[`${pageScope}-${deviceScope}`] = response;
      });
      promises.push(promise);
    }
  }

  // Implement timeout
  const timeoutPromise = new Promise<void>(resolve =>
    setTimeout(resolve, 1000),
  );
  await Promise.race([Promise.all(promises), timeoutPromise]);

  return pageResult;
}

export async function populateCruxData(
  parsedTrace: DevTools.TraceEngine.TraceModel.ParsedTrace,
): Promise<void> {
  ensureCrUXManager();

  const settings = DevTools.Common.Settings.Settings.instance();
  const cruxSetting = settings.createSetting(
    'field-data',
    {enabled: true},
    DevTools.Common.Settings.SettingStorageType.GLOBAL,
  );

  if (!cruxSetting.get().enabled) {
    return;
  }

  const urls = new Set<string>();
  if (parsedTrace.insights) {
    for (const insightSet of parsedTrace.insights.values()) {
      urls.add(insightSet.url.href);
    }
  } else {
    // Fallback to main frame URL if no insights
    const mainUrl = parsedTrace.data.Meta.mainFrameURL;
    if (mainUrl) {
      urls.add(mainUrl);
    }
  }

  if (urls.size === 0) {
    return;
  }

  const cruxData = await Promise.all(
    Array.from(urls).map(url => getFieldDataForPage(url)),
  );

  parsedTrace.metadata.cruxFieldData = cruxData;
}
