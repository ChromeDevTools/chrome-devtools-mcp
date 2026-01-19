/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface ScreenshotData {
  html: string;
}

export const screenshots: Record<string, ScreenshotData> = {
  basic: {
    html: '<div>Hello MCP</div>',
  },
  viewportOverflow: {
    html: '<div style="height: 120vh; background-color: rebeccapurple;">View Port overflow</div>',
  },
  button: {
    html: '<button>I am button click me</button>',
  },
  scrollableContainer: {
    html: `
      <style>
        body { margin: 0; height: 100vh; display: flex; flex-direction: column; }
        .header { height: 60px; background: #333; color: white; flex-shrink: 0; }
        .content { flex: 1; overflow: auto; }
        .inner { height: 2000px; background: linear-gradient(to bottom, #f0f0f0, #333); }
      </style>
      <div class="header">Fixed Header</div>
      <div class="content" id="scrollable-content">
        <div class="inner">
          <p>Top of scrollable content</p>
          <p style="position: absolute; top: 1900px;">Bottom of scrollable content</p>
        </div>
      </div>
    `,
  },
  localIframe: {
    html: `
      <style>
        body { margin: 0; }
        iframe { width: 100%; height: 400px; border: none; }
      </style>
      <iframe id="local-iframe" srcdoc="
        <style>body { margin: 0; }</style>
        <div style='height: 1500px; background: linear-gradient(to bottom, #e0e0ff, #3030ff);'>
          <p>Top of iframe content</p>
          <p style='position: absolute; top: 1400px;'>Bottom of iframe content</p>
        </div>
      "></iframe>
    `,
  },
  crossOriginIframe: {
    html: `
      <style>
        body { margin: 0; }
        iframe { width: 100%; height: 400px; border: 1px solid #ccc; }
      </style>
      <div>Page with cross-origin iframe</div>
      <iframe id="cross-origin-iframe" src="https://example.com"></iframe>
    `,
  },
};
