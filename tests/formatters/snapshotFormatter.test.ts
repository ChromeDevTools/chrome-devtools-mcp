/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ElementHandle} from 'puppeteer-core';

import {SnapshotFormatter} from '../../src/formatters/SnapshotFormatter.js';
import type {TextSnapshot} from '../../src/TextSnapshot.js';
import type {TextSnapshotNode} from '../../src/types.js';

describe('snapshotFormatter', () => {
  function createNode(
    id: string,
    role: string,
    name: string,
    children: TextSnapshotNode[] = [],
  ): TextSnapshotNode {
    return {
      id,
      role,
      name,
      children,
      elementHandle: async (): Promise<ElementHandle<Element> | null> => {
        return null;
      },
    };
  }

  it('omits the StaticText role in text output', () => {
    const node = createNode('1_1', 'link', 'Privacy', [
      createNode('1_2', 'StaticText', 'Privacy Policy'),
    ]);

    const formatter = new SnapshotFormatter({root: node} as TextSnapshot);
    assert.strictEqual(
      formatter.toString(),
      `uid=1_1 link "Privacy"
  uid=1_2 "Privacy Policy"
`,
    );
    assert.deepStrictEqual(formatter.toJSON(), {
      id: '1_1',
      role: 'link',
      name: 'Privacy',
      children: [{id: '1_2', role: 'StaticText', name: 'Privacy Policy'}],
    });
  });

  it('skips the only StaticText child duplicating the parent name', () => {
    const node = createNode('1_1', 'link', 'Privacy Policy', [
      createNode('1_2', 'StaticText', 'Privacy Policy'),
    ]);

    const formatter = new SnapshotFormatter({
      root: node,
      verbose: false,
    } as TextSnapshot);
    assert.strictEqual(formatter.toString(), `uid=1_1 link "Privacy Policy"\n`);
  });

  it('keeps the duplicate StaticText child in verbose mode', () => {
    const node = createNode('1_1', 'link', 'Privacy Policy', [
      createNode('1_2', 'StaticText', 'Privacy Policy'),
    ]);

    const formatter = new SnapshotFormatter({
      root: node,
      verbose: true,
    } as TextSnapshot);
    assert.strictEqual(
      formatter.toString(),
      `uid=1_1 link "Privacy Policy"
  uid=1_2 "Privacy Policy"
`,
    );
  });

  it('keeps the duplicate StaticText child if it has non-text siblings', () => {
    const node = createNode('1_1', 'link', 'Privacy Policy', [
      createNode('1_2', 'StaticText', 'Privacy Policy'),
      createNode('1_3', 'image', 'icon'),
    ]);

    const formatter = new SnapshotFormatter({
      root: node,
      verbose: false,
    } as TextSnapshot);
    assert.strictEqual(
      formatter.toString(),
      `uid=1_1 link "Privacy Policy"
  uid=1_2 "Privacy Policy"
  uid=1_3 image "icon"
`,
    );
  });

  it('skips StaticText children whose combined text equals the parent name', () => {
    const node = createNode('1_1', 'link', 'English 7,245,000+ articles', [
      createNode('1_2', 'StaticText', 'English'),
      createNode('1_3', 'StaticText', '7,245,000+ '),
      createNode('1_4', 'StaticText', 'articles'),
    ]);

    const formatter = new SnapshotFormatter({
      root: node,
      verbose: false,
    } as TextSnapshot);
    assert.strictEqual(
      formatter.toString(),
      `uid=1_1 link "English 7,245,000+ articles"\n`,
    );
  });

  it('keeps StaticText children whose combined text differs from the parent name', () => {
    const node = createNode('1_1', 'link', 'English', [
      createNode('1_2', 'StaticText', 'English'),
      createNode('1_3', 'StaticText', 'articles'),
    ]);

    const formatter = new SnapshotFormatter({
      root: node,
      verbose: false,
    } as TextSnapshot);
    assert.strictEqual(
      formatter.toString(),
      `uid=1_1 link "English"
  uid=1_2 "English"
  uid=1_3 "articles"
`,
    );
  });

  it('omits redundant option attributes in text output', () => {
    const node = createNode('1_1', 'combobox', 'Language', [
      {...createNode('1_2', 'option', 'English'), value: 'English'},
      {
        ...createNode('1_3', 'option', 'Deutsch'),
        value: 'de',
        selected: true,
      },
    ]);

    const formatter = new SnapshotFormatter({root: node} as TextSnapshot);
    assert.strictEqual(
      formatter.toString(),
      `uid=1_1 combobox "Language"
  uid=1_2 option "English"
  uid=1_3 option "Deutsch" selected value="de"
`,
    );
  });

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
        {
          id: '1_4',
          role: 'slider',
          name: 'volume',
          valuemin: 0,
          valuemax: 100,
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
  uid=1_4 slider "volume" valuemax="100" valuemin="0"
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
      resolveCdpElementId() {
        return undefined;
      },
    });
    const formatted = formatter.toString();

    t.assert.snapshot(formatted);
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
      resolveCdpElementId() {
        return undefined;
      },
    });
    const formatted = formatter.toString();

    t.assert.snapshot(formatted);
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
      resolveCdpElementId() {
        return '1_1';
      },
    });
    const formatted = formatter.toString();

    t.assert.snapshot(formatted);
  });

  it('formats a node with role "none" as ignored', () => {
    const node: TextSnapshotNode = {
      id: '1_1',
      role: 'none',
      name: '',
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
      `uid=1_1 ignored
  uid=1_2 statictext "text"
`,
    );
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
