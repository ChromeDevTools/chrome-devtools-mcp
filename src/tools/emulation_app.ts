/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function EmulationApp() {
  let nextRequestId = 1;
  const send = (method: string, params: unknown, id?: number) =>
    (window.parent).postMessage({ jsonrpc: '2.0', method, params, id }, '*');

  const sendResponse = (id: number | string, result: unknown) =>
    (window.parent).postMessage({ jsonrpc: '2.0', id, result }, '*');

  const initializeRequestId = nextRequestId++;
  send('ui/initialize', {}, initializeRequestId);

  const state = {
    cpuThrottlingRate: 1,
    networkConditions: 'No emulation',
    geolocation: null as {latitude: number, longitude: number} | null,
    colorScheme: 'auto',
    viewport: null as {
      width: number;
      height: number;
      deviceScaleFactor: number;
      isMobile: boolean;
      hasTouch: boolean;
      isLandscape: boolean;
    } | null,
  };

  const resizeObserver = new ResizeObserver(() => {
    const rect = document.documentElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    send('ui/notifications/size-changed', { width, height });
  });
  resizeObserver.observe(document.documentElement);

  function selectCPUThrottling(rate: number, btn: HTMLElement) {
    state.cpuThrottlingRate = rate;
    const customInput = document.getElementById('customInput') as HTMLInputElement;
    if (customInput) {
      customInput.value = '';
    }
    updateActiveButton('cpu-grid', btn);
  }

  function selectNetworkThrottling(condition: string, btn: HTMLElement) {
    state.networkConditions = condition;
    updateActiveButton('network-grid', btn);
  }

  const customInput = document.getElementById('customInput') as HTMLInputElement;
  if (customInput) {
    customInput.addEventListener('input', () => {
      if (customInput.value) {
        updateActiveButton('cpu-grid', null);
      }
    });
  }

  // Color Scheme
  function selectColorScheme(scheme: string, btn: HTMLElement) {
    state.colorScheme = scheme;
    updateActiveButton('color-scheme-grid', btn);
  }

  // Geolocation
  function clearGeolocation() {
    (document.getElementById('geoLat') as HTMLInputElement).value = '';
    (document.getElementById('geoLon') as HTMLInputElement).value = '';
  }



  function updateActiveButton(gridId: string, activeBtn: HTMLElement | null) {
    const grid = document.getElementById(gridId);
    if (!grid) {
      return;
    }
    const selector = gridId === 'viewport-grid' ? '.viewport-option' : 'button';
    grid.querySelectorAll(selector).forEach((btn) => btn.classList.remove('active'));
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  function applySettings() {
    const customInput = document.getElementById('customInput') as HTMLInputElement;
    const customRate = customInput ? parseFloat(customInput.value) : NaN;

    let finalRate = state.cpuThrottlingRate;
    if (!isNaN(customRate) && customRate >= 1) {
      finalRate = customRate;
    }

    // Geolocation
    const latStr = (document.getElementById('geoLat') as HTMLInputElement).value;
    const lonStr = (document.getElementById('geoLon') as HTMLInputElement).value;
    if (latStr && lonStr) {
      state.geolocation = {
        latitude: parseFloat(latStr),
        longitude: parseFloat(lonStr),
      };
    } else {
      state.geolocation = null;
    }

    // Viewport
    if (state.viewport) {
      // already set by selectViewport
    } else {
      // if null, we send null
    }

    updateStatus('Applying emulation settings...');
    
    // Disable button and change text
    const btn = document.getElementById('applyBtn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'emulation set';
    }

    sendToolsCall({
      cpuThrottlingRate: finalRate,
      networkConditions: state.networkConditions,
      geolocation: state.geolocation,
      colorScheme: state.colorScheme,
      viewport: state.viewport,
    });
  }

  // Viewport Presets
  function selectViewport(type: string, btn: HTMLElement) {
    if (type === 'mobile') {
      state.viewport = {
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        isLandscape: false,
      };
    } else if (type === 'tablet') {
      state.viewport = {
        width: 768,
        height: 1024,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        isLandscape: false,
      };
    } else if (type === 'desktop') {
      state.viewport = {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      };
    } else {
      state.viewport = null;
    }
    updateActiveButton('viewport-grid', btn);
  }

  function updateStatus(msg: string) {
    const status = document.getElementById('status');
    if (status) {
      status.innerText = msg;
    }
  }

  function sendToolsCall(args: unknown) {
    const id = nextRequestId++;
    send('tools/call', {
      name: 'emulate_set_parameters',
      arguments: args,
    }, id);
  }

  window.addEventListener('message', (event) => {
    const { method, params, id, result } = event.data;

    // We can handle incoming updates from the tool here if we want the UI to reflect
    // changes made via the tool directly, but for now we focus on driving from UI.
    if (
      method === 'ui/notifications/tool-input' ||
      method === 'ui/notifications/tool-input-partial'
    ) {
       // Optional: implement bidirectional sync if needed
    }

    if (method === 'ui/notifications/tool-result') {
      const content = params && params.content;
      const text = content && content[0] && content[0].text;
      if (text && text.indexOf('EMULATION_SETTINGS_APPLIED') !== -1) {
        updateStatus('emulation is set');
      }
    }

    if (id !== undefined && result) {
      const content = result.content;
      const text = content && content[0] && content[0].text;
      if (text && text.indexOf('EMULATION_SETTINGS_APPLIED') !== -1) {
        updateStatus('emulation is set');
      }
    }

    if (id !== undefined && method === 'ui/resource-teardown') {
      sendResponse(id, {});
    }
  });

  // Export functions to window for onclick handlers
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectCPUThrottling = selectCPUThrottling;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectNetworkThrottling = selectNetworkThrottling;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectColorScheme = selectColorScheme;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.applySettings = applySettings;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.clearGeolocation = clearGeolocation;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.selectViewport = selectViewport;
}

export const EMULATION_APP_SCRIPT = `(${EmulationApp.toString()})()`;
