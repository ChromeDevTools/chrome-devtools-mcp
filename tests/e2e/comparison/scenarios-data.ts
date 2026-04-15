/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScenarioBody =
  | 'buttons'
  | 'img'
  | 'flex-host'
  | 'wrap'
  | 'grid-host';

export interface Scenario {
  id: string;
  property: string;
  cssA: string;
  cssB: string;
  extraHead?: string;
  bodyDepth?: number;
  noiseSiblings?: number;
  body?: ScenarioBody;
  compareGeometry?: boolean;
}

function pushSimple(
  out: Scenario[],
  id: string,
  property: string,
  valA: string,
  valB: string,
  extra?: Partial<Scenario>,
): void {
  out.push({
    id,
    property,
    cssA: `${property}: ${valA}`,
    cssB: `${property}: ${valB}`,
    ...extra,
  });
}

function buildSpacingSizeBorder(out: Scenario[]): void {
  const marginSides = [
    ['margin-top', '2px', '12px'],
    ['margin-right', '2px', '12px'],
    ['margin-bottom', '2px', '12px'],
    ['margin-left', '2px', '12px'],
  ] as const;
  for (const [p, a, b] of marginSides) {
    pushSimple(out, `css-${p}`, p, a, b);
  }
  pushSimple(out, 'css-margin-shorthand', 'margin-top', '4px', '20px', {
    cssA: 'margin: 4px',
    cssB: 'margin: 20px',
  });

  const padSides = [
    ['padding-top', '2px', '14px'],
    ['padding-right', '2px', '14px'],
    ['padding-bottom', '2px', '14px'],
    ['padding-left', '2px', '14px'],
  ] as const;
  for (const [p, a, b] of padSides) {
    pushSimple(out, `css-${p}`, p, a, b);
  }
  pushSimple(out, 'css-padding-shorthand', 'padding-top', '3px', '18px', {
    cssA: 'padding: 3px',
    cssB: 'padding: 18px',
  });

  pushSimple(out, 'css-width', 'width', '80px', '120px');
  pushSimple(out, 'css-height', 'height', '24px', '48px');
  pushSimple(out, 'css-min-width', 'min-width', '0px', '60px');
  pushSimple(out, 'css-max-width', 'max-width', '200px', '80px');
  pushSimple(out, 'css-min-height', 'min-height', '0px', '40px');
  pushSimple(out, 'css-max-height', 'max-height', '200px', '50px');

  pushSimple(out, 'css-border-width', 'border-top-width', '1px', '6px');
  pushSimple(out, 'css-border-style', 'border-top-style', 'solid', 'dashed');
  pushSimple(
    out,
    'css-border-color',
    'border-top-color',
    'rgb(0, 128, 0)',
    'rgb(128, 0, 128)',
  );
  pushSimple(out, 'css-border-radius', 'border-top-left-radius', '0px', '16px');
  pushSimple(
    out,
    'css-border-top-left-radius',
    'border-top-left-radius',
    '0px',
    '12px',
  );
  pushSimple(out, 'css-outline-width', 'outline-width', '0px', '3px', {
    cssA: 'outline-style: solid; outline-width: 0px; outline-color: rgb(0, 0, 0)',
    cssB: 'outline-style: solid; outline-width: 3px; outline-color: rgb(0, 0, 0)',
  });
  pushSimple(out, 'css-outline-style', 'outline-style', 'none', 'solid');
  pushSimple(
    out,
    'css-outline-color',
    'outline-color',
    'rgb(255, 0, 0)',
    'rgb(0, 0, 255)',
  );
}

function buildTypographyColors(out: Scenario[]): void {
  pushSimple(out, 'css-font-size', 'font-size', '12px', '22px');
  pushSimple(out, 'css-line-height', 'line-height', '16px', '28px');
  pushSimple(out, 'css-letter-spacing', 'letter-spacing', 'normal', '4px');
  pushSimple(out, 'css-word-spacing', 'word-spacing', 'normal', '8px');
  pushSimple(out, 'css-font-weight', 'font-weight', '400', '700');
  pushSimple(out, 'css-font-style', 'font-style', 'normal', 'italic');
  pushSimple(out, 'css-font-family', 'font-family', 'serif', 'monospace');
  pushSimple(
    out,
    'css-text-decoration-line',
    'text-decoration-line',
    'none',
    'underline',
  );
  pushSimple(out, 'css-text-transform', 'text-transform', 'none', 'uppercase');
  pushSimple(out, 'css-overflow-wrap', 'overflow-wrap', 'normal', 'anywhere');
  pushSimple(out, 'css-color', 'color', 'rgb(10, 10, 10)', 'rgb(200, 50, 50)');
  pushSimple(
    out,
    'css-background-color',
    'background-color',
    'rgb(240, 240, 240)',
    'rgb(20, 40, 200)',
  );
  pushSimple(out, 'css-opacity', 'opacity', '1', '0.35');
  pushSimple(out, 'css-outline-offset', 'outline-offset', '0px', '6px');
}

function buildLayoutPosition(out: Scenario[]): void {
  pushSimple(out, 'css-display', 'display', 'inline-block', 'block');
  out.push({
    id: 'css-position-offset',
    property: 'top',
    cssA: 'position: relative; top: 0px; left: 0px',
    cssB: 'position: relative; top: 8px; left: 6px',
  });
  pushSimple(out, 'css-float', 'float', 'none', 'left');
  pushSimple(out, 'css-clear', 'clear', 'none', 'both');
  pushSimple(out, 'css-z-index', 'z-index', '1', '50');
  pushSimple(out, 'css-overflow', 'overflow-x', 'visible', 'hidden', {
    cssA: 'overflow-x: visible; overflow-y: visible',
    cssB: 'overflow-x: hidden; overflow-y: visible',
  });
  pushSimple(out, 'css-box-sizing', 'box-sizing', 'content-box', 'border-box');
  pushSimple(out, 'css-aspect-ratio', 'aspect-ratio', 'auto', '2 / 1');
  pushSimple(
    out,
    'css-writing-mode',
    'writing-mode',
    'horizontal-tb',
    'vertical-rl',
  );
}

function buildFlexGrid(out: Scenario[]): void {
  pushSimple(out, 'css-flex-grow', 'flex-grow', '0', '2');
  pushSimple(out, 'css-flex-shrink', 'flex-shrink', '1', '0');
  pushSimple(out, 'css-flex-basis', 'flex-basis', 'auto', '40px');
  pushSimple(out, 'css-align-self', 'align-self', 'auto', 'flex-end');
  pushSimple(out, 'css-order', 'order', '0', '3');
  out.push({
    id: 'css-grid-column-start',
    property: 'grid-column-start',
    cssA: 'grid-column-start: auto',
    cssB: 'grid-column-start: 1',
    extraHead: `
      .grid-host {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
    `,
    body: 'grid-host',
  });
}

function buildTransformsEffects(out: Scenario[]): void {
  pushSimple(out, 'css-transform', 'transform', 'none', 'rotate(8deg)');
  pushSimple(out, 'css-transform-scale', 'transform', 'none', 'scale(1.15)');
  pushSimple(
    out,
    'css-transform-translate',
    'transform',
    'none',
    'translate(4px, 3px)',
  );
  pushSimple(
    out,
    'css-box-shadow',
    'box-shadow',
    'none',
    '4px 4px 8px rgba(0,0,0,0.35)',
  );
  pushSimple(
    out,
    'css-text-shadow',
    'text-shadow',
    'none',
    '2px 2px 4px rgba(0,0,0,0.5)',
  );
  pushSimple(out, 'css-filter', 'filter', 'none', 'brightness(0.85)');
}

function buildLogicalUnits(out: Scenario[]): void {
  pushSimple(out, 'css-inline-size', 'inline-size', '70px', '110px');
  pushSimple(out, 'css-block-size', 'block-size', '22px', '44px');
  pushSimple(
    out,
    'css-margin-inline-start',
    'margin-inline-start',
    '2px',
    '18px',
  );
  out.push({
    id: 'css-inset',
    property: 'top',
    cssA: 'position: relative; inset: 0px',
    cssB: 'position: relative; inset: 4px 6px 2px 8px',
  });
  pushSimple(out, 'css-rem-vs-px', 'width', '5rem', '120px');
}

function buildLayersAndVars(out: Scenario[]): void {
  out.push({
    id: 'css-layer-order',
    property: 'color',
    cssA: '',
    cssB: 'color: rgb(0, 0, 255)',
    extraHead: `
      @layer base, theme;
      @layer theme { .variant-a { color: rgb(200, 0, 0); } }
      @layer base { .variant-a { color: rgb(0, 180, 0); } }
    `,
  });
  out.push({
    id: 'css-custom-prop-diff',
    property: 'color',
    cssA: '--x: rgb(50, 50, 50); color: var(--x)',
    cssB: '--x: rgb(200, 100, 100); color: var(--x)',
  });
}

function buildDomScale(out: Scenario[]): void {
  pushSimple(out, 'dom-depth-12', 'border-top-width', '1px', '5px', {
    bodyDepth: 12,
  });
  pushSimple(out, 'dom-depth-28', 'border-top-width', '1px', '5px', {
    bodyDepth: 28,
  });
  pushSimple(out, 'dom-noise-siblings-40', 'font-size', '13px', '19px', {
    noiseSiblings: 40,
  });
  pushSimple(out, 'dom-noise-siblings-200', 'font-size', '13px', '19px', {
    noiseSiblings: 200,
  });
}

function buildImgBody(out: Scenario[]): void {
  pushSimple(out, 'img-object-fit', 'object-fit', 'fill', 'cover', {
    body: 'img',
    property: 'object-fit',
  });
  pushSimple(out, 'img-opacity', 'opacity', '1', '0.4', {
    body: 'img',
  });
  pushSimple(out, 'img-transform', 'transform', 'none', 'rotate(12deg)', {
    body: 'img',
  });
}

function buildFlexHost(out: Scenario[]): void {
  out.push({
    id: 'flex-host-gap-row',
    property: 'row-gap',
    cssA: 'display: flex; flex-wrap: wrap; row-gap: 4px; width: 120px',
    cssB: 'display: flex; flex-wrap: wrap; row-gap: 28px; width: 120px',
    body: 'flex-host',
  });
  out.push({
    id: 'flex-host-column-gap',
    property: 'column-gap',
    cssA: 'display: flex; column-gap: 2px',
    cssB: 'display: flex; column-gap: 24px',
    body: 'flex-host',
  });
}

function buildGeometryFlag(out: Scenario[]): void {
  pushSimple(out, 'geom-compare-width', 'width', '60px', '100px', {
    compareGeometry: true,
  });
  pushSimple(out, 'geom-compare-padding', 'padding-top', '4px', '20px', {
    compareGeometry: true,
    cssA: 'padding: 4px',
    cssB: 'padding: 20px',
  });
}

function buildScssCompiledComment(out: Scenario[]): void {
  out.push({
    id: 'scss-compiled-nested',
    property: 'color',
    cssA: 'color: rgb(90, 90, 200)',
    cssB: 'color: rgb(200, 90, 90)',
    extraHead: `
      /* expanded from SCSS nesting */
    `,
    body: 'wrap',
  });
}

function buildEquivalentUnits(out: Scenario[]): void {
  pushSimple(out, 'unit-em-font-size', 'font-size', '1em', '1.5em');
  pushSimple(out, 'unit-pct-width', 'width', '40%', '65%');
  pushSimple(out, 'unit-ch-width', 'width', '12ch', '20ch');
}

function buildMoreSurface(out: Scenario[]): void {
  pushSimple(out, 'css-text-align', 'text-align', 'left', 'right');
  pushSimple(out, 'css-vertical-align', 'vertical-align', 'baseline', 'super');
  pushSimple(out, 'css-border-right-width', 'border-right-width', '1px', '9px');
  pushSimple(
    out,
    'css-border-bottom-width',
    'border-bottom-width',
    '1px',
    '9px',
  );
  pushSimple(out, 'css-overflow-x', 'overflow-x', 'visible', 'scroll');
  pushSimple(out, 'css-overflow-y', 'overflow-y', 'visible', 'auto');
  pushSimple(out, 'css-user-select', 'user-select', 'auto', 'none');
  pushSimple(out, 'css-pointer-events', 'pointer-events', 'auto', 'none');
  pushSimple(out, 'css-cursor', 'cursor', 'default', 'pointer');
  pushSimple(out, 'css-isolation', 'isolation', 'auto', 'isolate');
  pushSimple(out, 'css-mix-blend-mode', 'mix-blend-mode', 'normal', 'multiply');
  pushSimple(out, 'css-scroll-margin-top', 'scroll-margin-top', '0px', '12px');
  pushSimple(out, 'css-column-count', 'column-count', 'auto', '2');
  pushSimple(out, 'css-flex-direction', 'flex-direction', 'row', 'column', {
    extraHead: `
      .variant-a, .variant-b { display: flex; }
    `,
  });
  pushSimple(
    out,
    'css-justify-content',
    'justify-content',
    'flex-start',
    'flex-end',
    {
      extraHead: `
      .variant-a, .variant-b { display: flex; width: 140px; }
    `,
    },
  );
  pushSimple(out, 'css-align-items', 'align-items', 'stretch', 'center', {
    extraHead: `
      .variant-a, .variant-b { display: flex; height: 48px; }
    `,
  });
  pushSimple(out, 'css-row-gap-flex', 'row-gap', '2px', '18px', {
    extraHead: `
      .variant-a, .variant-b { display: flex; flex-wrap: wrap; width: 100px; }
    `,
  });
  pushSimple(out, 'css-border-top-width', 'border-top-width', '1px', '7px');
  pushSimple(out, 'css-border-left-width', 'border-left-width', '1px', '7px');
  pushSimple(out, 'css-text-indent', 'text-indent', '0px', '12px');
}

export function buildScenarios(): Scenario[] {
  const out: Scenario[] = [];
  buildSpacingSizeBorder(out);
  buildTypographyColors(out);
  buildLayoutPosition(out);
  buildFlexGrid(out);
  buildTransformsEffects(out);
  buildLogicalUnits(out);
  buildLayersAndVars(out);
  buildDomScale(out);
  buildImgBody(out);
  buildFlexHost(out);
  buildGeometryFlag(out);
  buildScssCompiledComment(out);
  buildEquivalentUnits(out);
  buildMoreSurface(out);

  const ids = new Set(out.map(s => s.id));
  if (ids.size !== out.length) {
    throw new Error('duplicate scenario id');
  }
  if (out.length < 100) {
    throw new Error(`need at least 100 scenarios, got ${out.length}`);
  }
  return out;
}

export const SCENARIOS: Scenario[] = buildScenarios();
