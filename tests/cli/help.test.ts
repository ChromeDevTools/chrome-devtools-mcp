/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  buildSignature,
  buildUsage,
  formatRootHelp,
  formatStartHelp,
  formatToolHelp,
} from '../../src/cli/help.js';
import {commands, type ArgDef} from '../../src/config/cli-options.js';
import {getCliOptions} from '../../src/config/mcp-options.js';
import type {YargsOptions} from '../../src/third_party/index.js';

describe('buildUsage', () => {
  const dummyArgsVariadic: Record<string, ArgDef> = {
    arg1: {name: 'arg1', type: 'string', description: '', required: true},
    arrArg: {name: 'arrArg', type: 'array', description: '', required: true},
  };

  const dummyArgsPlain: Record<string, ArgDef> = {
    arg1: {name: 'arg1', type: 'string', description: '', required: true},
    arg2: {name: 'arg2', type: 'string', description: '', required: true},
  };

  const dummyArgsOptional: Record<string, ArgDef> = {
    arg1: {name: 'arg1', type: 'string', description: '', required: true},
    optArg: {name: 'optArg', type: 'boolean', description: '', required: false},
  };

  it('renders a required array arg as a variadic positional', () => {
    assert.strictEqual(
      buildUsage('dummy_cmd', dummyArgsVariadic),
      'dummy_cmd <arg1> <arrArg..>',
    );
  });

  it('renders required non-array args as plain positionals', () => {
    assert.strictEqual(
      buildUsage('dummy_cmd', dummyArgsPlain),
      'dummy_cmd <arg1> <arg2>',
    );
  });

  it('keeps evaluate_script function as an optional positional', () => {
    const usage = buildUsage(
      'evaluate_script',
      commands['evaluate_script'].args,
    );
    assert.ok(usage.startsWith('evaluate_script [function] '));
    assert.ok(!usage.includes('[--function]'));
    assert.ok(usage.includes('[--sourcePath]'));
  });

  it('lists optional args as flags after the positionals', () => {
    assert.strictEqual(
      buildUsage('dummy_cmd', dummyArgsOptional),
      'dummy_cmd <arg1> [--optArg]',
    );
  });

  it('keeps a variadic positional last for every generated command', () => {
    for (const [name, {args}] of Object.entries(commands)) {
      const signature = buildSignature(name, args);
      const variadic = signature.indexOf('..>');
      assert.ok(
        variadic === -1 || variadic === signature.length - 3,
        `${name}: a variadic positional must be last`,
      );
    }
  });
});

describe('help output', () => {
  it('lists builtin and generated commands in the root help', () => {
    const help = formatRootHelp(commands);
    assert.ok(help.includes('chrome-devtools <command> [...args] --flags'));
    assert.ok(help.includes('start'));
    assert.ok(help.includes('click <pageId> <uid>'));
    assert.ok(help.includes('--version, -v'));
  });

  it('renders positionals, options and choices for a tool', () => {
    const help = formatToolHelp(
      'lighthouse_audit',
      commands['lighthouse_audit'],
    );
    assert.ok(help.startsWith('chrome-devtools lighthouse_audit <pageId>'));
    assert.ok(help.includes('Positionals:'));
    assert.ok(help.includes('--mode'));
    assert.ok(help.includes('[choices: "desktop", "mobile"]'));
    assert.ok(help.includes('--output-format'));
  });

  it('omits hidden options and shows aliases and defaults for start', () => {
    const options: Record<string, YargsOptions> = {
      visible: {
        type: 'string',
        describe: 'Visible option',
        choices: ['a', 'b'],
        defaultDescription: 'a',
      },
      aliased: {type: 'boolean', describe: 'Aliased', alias: 'other'},
      secret: {type: 'boolean', describe: 'Secret', hidden: true},
    };
    const help = formatStartHelp(options);
    assert.ok(help.includes('--visible'));
    assert.ok(help.includes('[choices: "a", "b"] [default: a]'));
    assert.ok(help.includes('--aliased, --other'));
    assert.ok(!help.includes('--secret'));
  });

  it('wraps the real start options within 120 columns', () => {
    for (const line of formatStartHelp(getCliOptions()).split('\n')) {
      assert.ok(line.length <= 120, `line too long: ${line}`);
    }
  });
});
