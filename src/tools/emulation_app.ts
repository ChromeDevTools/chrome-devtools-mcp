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

  function updateActiveButton(gridId: string, activeBtn: HTMLElement | null) {
    const grid = document.getElementById(gridId);
    if (!grid) {
      return;
    }
    grid.querySelectorAll('button').forEach((btn) => btn.classList.remove('active'));
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
    });
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

    if (
      method === 'ui/notifications/tool-input' ||
      method === 'ui/notifications/tool-input-partial'
    ) {
      const args = (params && params.arguments) || {};
      if (args.cpuThrottlingRate) {
        const selector = '[data-rate="' + args.cpuThrottlingRate + '"]';
        selectCPUThrottling(
          args.cpuThrottlingRate,
          document.querySelector(selector) as HTMLElement
        );
      }
      if (args.networkConditions) {
        const selector = '[data-condition="' + args.networkConditions + '"]';
        selectNetworkThrottling(
          args.networkConditions,
          document.querySelector(selector) as HTMLElement
        );
      }
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
  (window as unknown as { selectCPUThrottling: typeof selectCPUThrottling }).selectCPUThrottling = selectCPUThrottling;
  (window as unknown as { selectNetworkThrottling: typeof selectNetworkThrottling }).selectNetworkThrottling = selectNetworkThrottling;
  (window as unknown as { applySettings: typeof applySettings }).applySettings = applySettings;
}

export const EMULATION_APP_SCRIPT = `(${EmulationApp.toString()})()`;
