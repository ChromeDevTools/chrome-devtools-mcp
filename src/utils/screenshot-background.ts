/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from '../third_party/index.js';

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export async function captureWithPageBackground<T>(
  page: Page,
  capture: () => Promise<T>,
): Promise<T> {
  const backgroundColor = await getVisiblePageBackground(page);
  if (!backgroundColor) {
    return await capture();
  }

  const client = await page.createCDPSession();
  try {
    await client.send('Emulation.setDefaultBackgroundColorOverride', {
      color: backgroundColor,
    });
    return await capture();
  } finally {
    try {
      await client.send('Emulation.setDefaultBackgroundColorOverride', {});
    } finally {
      await client.detach();
    }
  }
}

async function getVisiblePageBackground(
  page: Page,
): Promise<RgbaColor | undefined> {
  return await page.evaluate(() => {
    function parseCssRgbColor(value: string) {
      const match =
        /^rgba?\(\s*(?<red>[\d.]+)\s*,\s*(?<green>[\d.]+)\s*,\s*(?<blue>[\d.]+)(?:\s*,\s*(?<alpha>[\d.]+))?\s*\)$/u.exec(
          value,
        );
      if (!match?.groups) {
        return;
      }

      const red = Number(match.groups.red);
      const green = Number(match.groups.green);
      const blue = Number(match.groups.blue);
      const alpha =
        match.groups.alpha === undefined ? 1 : Number(match.groups.alpha);
      if (
        !Number.isFinite(red) ||
        !Number.isFinite(green) ||
        !Number.isFinite(blue) ||
        !Number.isFinite(alpha) ||
        alpha <= 0
      ) {
        return;
      }

      return {
        r: Math.round(red),
        g: Math.round(green),
        b: Math.round(blue),
        a: alpha,
      };
    }

    function findBackgroundColor(startElement: Element | null) {
      let element = startElement;
      while (element) {
        const color = parseCssRgbColor(
          getComputedStyle(element).backgroundColor,
        );
        if (color) {
          return color;
        }
        element = element.parentElement;
      }
      return;
    }

    const samplePoints = [
      [1, 1],
      [Math.max(1, window.innerWidth / 2), Math.max(1, window.innerHeight / 2)],
    ];
    for (const [x, y] of samplePoints) {
      const color = findBackgroundColor(document.elementFromPoint(x, y));
      if (color) {
        return color;
      }
    }

    return (
      findBackgroundColor(document.body) ??
      findBackgroundColor(document.documentElement)
    );
  });
}
