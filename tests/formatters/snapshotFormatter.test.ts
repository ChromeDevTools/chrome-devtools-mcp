/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ElementHandle} from 'puppeteer-core';

import {formatSnapshotNode} from '../../src/formatters/snapshotFormatter.js';
import type {TextSnapshotNode} from '../../src/McpContext.js';

describe('snapshotFormatter', () => {
  it('formats a snapshot with value properties', () => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'textbox',
      name: 'textbox',
      value: 'value',
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

    const formatted = formatSnapshotNode(node);
    assert.strictEqual(
      formatted,
      `uid=1_1 textbox "textbox" value="value"
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

    const formatted = formatSnapshotNode(node);
    assert.strictEqual(
      formatted,
      `uid=1_1 button "button" disableable disabled
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

    const formatted = formatSnapshotNode(node);
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

    const formatted = formatSnapshotNode(node);
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

    const formatted = formatSnapshotNode(node, {
      snapshotId: '1',
      root: node,
      idToNode: new Map(),
      hasSelectedElement: true,
      verbose: false,
    });

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

    const formatted = formatSnapshotNode(node, {
      snapshotId: '1',
      root: node,
      idToNode: new Map(),
      hasSelectedElement: true,
      verbose: true,
    });

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

    const formatted = formatSnapshotNode(node, {
      snapshotId: '1',
      root: node,
      idToNode: new Map(),
      hasSelectedElement: true,
      selectedElementUid: '1_1',
      verbose: false,
    });

    t.assert.snapshot?.(formatted);
  });
});
