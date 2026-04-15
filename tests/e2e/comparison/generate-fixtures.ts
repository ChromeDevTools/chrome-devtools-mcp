/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {SCENARIOS, type Scenario} from './scenarios-data.js';

const IMG_SRC =
  'data:image/gif;base64,' +
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const BASE_BTN = `
.variant-a, .variant-b {
  display: inline-block;
  box-sizing: border-box;
  padding: 2px 8px;
  margin: 0;
  font: 14px system-ui, sans-serif;
  border: 1px solid #777;
  vertical-align: top;
}
`;

function deepWrap(inner: string, depth: number): string {
  let out = inner;
  for (let i = 0; i < depth; i++) {
    out = `<div class="deep-${i}">${out}</div>`;
  }
  return out;
}

function noiseBlock(n: number): string {
  if (n <= 0) {
    return '';
  }
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push('<div class="noise" aria-hidden="true"></div>');
  }
  return parts.join('');
}

function buttonPair(): string {
  return `
<button type="button" class="variant-a" aria-label="variant-a"></button>
<button type="button" class="variant-b" aria-label="variant-b"></button>`;
}

function imgPair(): string {
  return `
<img class="variant-a" role="img" aria-label="variant-a" alt="" src="${IMG_SRC}" width="48" height="48"/>
<img class="variant-b" role="img" aria-label="variant-b" alt="" src="${IMG_SRC}" width="48" height="48"/>`;
}

function flexHostPair(s: Scenario): string {
  return `
<div role="button" tabindex="0" aria-label="variant-a" class="host-a" style="${
    s.cssA
  }">
  <span>a</span><span>b</span>
</div>
<div role="button" tabindex="0" aria-label="variant-b" class="host-b" style="${
    s.cssB
  }">
  <span>a</span><span>b</span>
</div>`;
}

const BASE_IMG = `
img.variant-a, img.variant-b {
  display: inline-block;
  width: 48px;
  height: 48px;
  vertical-align: top;
}
`;

function styleBlock(s: Scenario): string {
  const head = (s.extraHead ?? '').trim();
  if (s.body === 'flex-host') {
    return `
<style>
${head}
</style>`;
  }
  if (s.body === 'img') {
    return `
<style>
${BASE_IMG}
.variant-a { ${s.cssA} }
.variant-b { ${s.cssB} }
${head}
</style>`;
  }
  return `
<style>
${BASE_BTN}
.variant-a { ${s.cssA} }
.variant-b { ${s.cssB} }
${head}
</style>`;
}

function bodyInner(s: Scenario): string {
  const noise = noiseBlock(s.noiseSiblings ?? 0);
  let core: string;
  switch (s.body) {
    case 'img':
      core = imgPair();
      break;
    case 'flex-host':
      core = flexHostPair(s);
      break;
    case 'wrap':
      core = `<div class="wrap">${buttonPair()}</div>`;
      break;
    case 'grid-host':
      core = `<div class="grid-host">${buttonPair()}</div>`;
      break;
    default:
      core = buttonPair();
  }
  return noise + deepWrap(core, s.bodyDepth ?? 0);
}

function renderCombined(s: Scenario): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${s.id}</title>
${styleBlock(s)}
</head>
<body>
${bodyInner(s)}
</body>
</html>
`;
}

function renderStandalone(s: Scenario, variant: 'a' | 'b'): string {
  const css = variant === 'a' ? s.cssA : s.cssB;
  const label = variant === 'a' ? 'variant-a' : 'variant-b';
  const cls = variant === 'a' ? 'variant-a' : 'variant-b';
  if (s.body === 'img') {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${s.id}-${variant}</title>
<style>
img { display: inline-block; vertical-align: top; }
.${cls} { ${css} }
</style></head><body>
<img class="${cls}" role="img" aria-label="${label}" alt="" src="${IMG_SRC}" width="48" height="48"/>
</body></html>`;
  }
  if (s.body === 'flex-host') {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${s.id}-${variant}</title>
<style></style></head><body>
<div role="button" tabindex="0" aria-label="${label}" style="${css}">
<span>x</span></div>
</body></html>`;
  }
  const innerBtn = `
<button type="button" class="${cls}" aria-label="${label}"></button>`;
  const wrapped =
    s.body === 'grid-host'
      ? `<div class="grid-host">${innerBtn}</div>`
      : s.body === 'wrap'
        ? `<div class="wrap">${innerBtn}</div>`
        : innerBtn;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${s.id}-${variant}</title>
<style>
${BASE_BTN}
.${cls} { ${css} }
${(s.extraHead ?? '').trim()}
</style></head><body>
${wrapped}
</body></html>`;
}

export async function generateAll(): Promise<void> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(dir, 'generated');
  await rm(root, {recursive: true, force: true});
  const pairs = path.join(root, 'pairs');

  const BATCH = 20;
  for (let i = 0; i < SCENARIOS.length; i += BATCH) {
    const batch = SCENARIOS.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async s => {
        const sub = path.join(pairs, s.id);
        await mkdir(sub, {recursive: true});
        await Promise.all([
          writeFile(path.join(sub, 'combined.html'), renderCombined(s)),
          writeFile(path.join(sub, 'a.html'), renderStandalone(s, 'a')),
          writeFile(path.join(sub, 'b.html'), renderStandalone(s, 'b')),
        ]);
      }),
    );
  }
}

async function main(): Promise<void> {
  await generateAll();
  console.error(
    `Wrote ${SCENARIOS.length} fixture triples under generated/pairs`,
  );
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] === selfPath) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
