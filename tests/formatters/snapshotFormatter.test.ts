/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ElementHandle} from 'puppeteer-core';

import {SnapshotFormatter} from '../../src/formatters/SnapshotFormatter.js';
import type {TextSnapshot, TextSnapshotNode} from '../../src/McpContext.js';

describe('snapshotFormatter', () => {
  it('formats a snapshot with value properties', () => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'textbox',
      name: 'textbox',
      value: 'value',
      live: 'polite',
      relevant: 'additions',
      errormessage: 'error-id',
      details: 'details-id',
      children: [
        {
          id: '1_2',
          role: 'statictext',
          name: 'text',
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
      ],
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };

    const formatter = new SnapshotFormatter({root: node} as TextSnapshot);
    const formatted = formatter.toString();
    assert.strictEqual(
      formatted,
      `uid=1_1 textbox "textbox" details="details-id" errormessage="error-id" live="polite" relevant="additions" value="value"
  uid=1_2 statictext "text"
`,
    );
  });

  it('formats a snapshot with boolean properties', () => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'button',
      name: 'button',
      disabled: true,
      busy: true,
      atomic: true,
      children: [
        {
          id: '1_2',
          role: 'statictext',
          name: 'text',
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
      ],
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };

    const formatter = new SnapshotFormatter({root: node} as TextSnapshot);
    const formatted = formatter.toString();
    assert.strictEqual(
      formatted,
      `uid=1_1 button "button" atomic busy disableable disabled
  uid=1_2 statictext "text"
`,
    );
  });

  it('formats a snapshot with checked properties', () => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'checkbox',
      name: 'checkbox',
      checked: true,
      children: [
        {
          id: '1_2',
          role: 'statictext',
          name: 'text',
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
      ],
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };

    const formatter = new SnapshotFormatter({root: node} as TextSnapshot);
    const formatted = formatter.toString();
    assert.strictEqual(
      formatted,
      `uid=1_1 checkbox "checkbox" checked
  uid=1_2 statictext "text"
`,
    );
  });

  it('formats a snapshot with multiple different type attributes', () => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'root',
      name: 'root',
      children: [
        {
          id: '1_2',
          role: 'button',
          name: 'button',
          focused: true,
          disabled: true,
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
        {
          id: '1_3',
          role: 'textbox',
          name: 'textbox',
          value: 'value',
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
      ],
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };

    const formatter = new SnapshotFormatter({root: node} as TextSnapshot);
    const formatted = formatter.toString();
    assert.strictEqual(
      formatted,
      `uid=1_1 root "root"
  uid=1_2 button "button" disableable disabled focusable focused
  uid=1_3 textbox "textbox" value="value"
`,
    );
  });

  it('formats with DevTools data not included into a snapshot', t => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'checkbox',
      name: 'checkbox',
      checked: true,
      children: [
        {
          id: '1_2',
          role: 'statictext',
          name: 'text',
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
      ],
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };

    const formatter = new SnapshotFormatter({
      snapshotId: '1',
      root: node,
      idToNode: new Map(),
      hasSelectedElement: true,
      verbose: false,
    });
    const formatted = formatter.toString();

    t.assert.snapshot?.(formatted);
  });

  it('does not include a note if the snapshot is already verbose', t => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'checkbox',
      name: 'checkbox',
      checked: true,
      children: [
        {
          id: '1_2',
          role: 'statictext',
          name: 'text',
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
      ],
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };

    const formatter = new SnapshotFormatter({
      snapshotId: '1',
      root: node,
      idToNode: new Map(),
      hasSelectedElement: true,
      verbose: true,
    });
    const formatted = formatter.toString();

    t.assert.snapshot?.(formatted);
  });

  it('formats with DevTools data included into a snapshot', t => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'checkbox',
      name: 'checkbox',
      checked: true,
      children: [
        {
          id: '1_2',
          role: 'statictext',
          name: 'text',
          children: [],
          elementHandle: async (): Promise<ElementHandle<Element> | null> => {
            return null;
          },
        },
      ],
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };

    const formatter = new SnapshotFormatter({
      snapshotId: '1',
      root: node,
      idToNode: new Map(),
      hasSelectedElement: true,
      selectedElementUid: '1_1',
      verbose: false,
    });
    const formatted = formatter.toString();

    t.assert.snapshot?.(formatted);
  });

  it('toJSON returns expected structure', () => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'root',
      name: 'root',
      busy: true,
      live: 'polite',
      children: [
        {
          id: '1_2',
          role: 'button',
          name: 'button',
          disabled: true,
          children: [],
          elementHandle: async () => null,
        },
      ],
      elementHandle: async () => null,
    };

    const formatter = new SnapshotFormatter({root: node} as TextSnapshot);
    const json = formatter.toJSON();

    assert.deepStrictEqual(json, {
      id: '1_1',
      role: 'root',
      name: 'root',
      busy: true,
      live: 'polite',
      children: [
        {
          id: '1_2',
          role: 'button',
          name: 'button',
          disableable: true,
          disabled: true,
        },
      ],
    });
  });
});
