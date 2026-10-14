/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  CliUsageError,
  assertNoArgs,
  normalizeBooleanFlags,
  parseGlobalArgs,
  parseToolArgs,
} from '../../src/cli/parser.js';
import {commands, type ArgDef} from '../../src/config/cli-options.js';

const SESSION_ID = 'aabbccdd-1122-3344-5566-77889900aabb';

function usageError(expected: {message: RegExp; showTip?: boolean}) {
  return (error: unknown) => {
    assert.ok(error instanceof CliUsageError, `not a CliUsageError: ${error}`);
    assert.match(error.message, expected.message);
    if (expected.showTip !== undefined) {
      assert.strictEqual(error.showTip, expected.showTip);
    }
    return true;
  };
}

describe('parseGlobalArgs', () => {
  it('detects the command and keeps the rest verbatim', () => {
    const result = parseGlobalArgs([
      'start',
      '--headless=false',
      '--userDataDir',
      '/x',
      '--no-javascript-evaluation',
    ]);
    assert.deepStrictEqual(result, {
      command: 'start',
      rest: [
        '--headless=false',
        '--userDataDir',
        '/x',
        '--no-javascript-evaluation',
      ],
      sessionId: '',
      help: false,
      version: false,
    });
  });

  it('strips --sessionId before and after the command', () => {
    assert.strictEqual(
      parseGlobalArgs(['--sessionId', SESSION_ID, 'status']).sessionId,
      SESSION_ID,
    );
    const result = parseGlobalArgs(['status', `--sessionId=${SESSION_ID}`]);
    assert.strictEqual(result.command, 'status');
    assert.strictEqual(result.sessionId, SESSION_ID);
    assert.deepStrictEqual(result.rest, []);
  });

  it('uses the default session id', () => {
    assert.strictEqual(
      parseGlobalArgs(['status'], SESSION_ID).sessionId,
      SESSION_ID,
    );
  });

  it('rejects an invalid session id', () => {
    assert.throws(
      () => parseGlobalArgs(['status', '--sessionId', '../etc']),
      usageError({message: /Invalid sessionId/}),
    );
    assert.throws(
      () => parseGlobalArgs(['status', '--sessionId']),
      usageError({message: /argument missing/}),
    );
  });

  it('parses help and version flags', () => {
    assert.strictEqual(parseGlobalArgs(['--help']).help, true);
    assert.strictEqual(parseGlobalArgs(['-h']).help, true);
    assert.strictEqual(parseGlobalArgs(['click', '--help']).command, 'click');
    assert.strictEqual(parseGlobalArgs(['--version']).version, true);
    assert.strictEqual(parseGlobalArgs(['-v']).version, true);
    assert.strictEqual(parseGlobalArgs([]).command, undefined);
  });

  it('does not treat arguments after -- as options', () => {
    const result = parseGlobalArgs(['fill', '1', 'uid', '--', '--help']);
    assert.strictEqual(result.help, false);
    assert.deepStrictEqual(result.rest, ['1', 'uid', '--', '--help']);
  });
});

describe('normalizeBooleanFlags', () => {
  const booleans = new Set(['dblClick', 'includeSnapshot']);

  it('rewrites explicit true/false values', () => {
    assert.deepStrictEqual(
      normalizeBooleanFlags(
        [
          '1',
          '--dblClick',
          'true',
          '--includeSnapshot=false',
          '--dblClick=true',
          '--includeSnapshot',
          'false',
        ],
        booleans,
      ),
      [
        '1',
        '--dblClick',
        '--no-includeSnapshot',
        '--dblClick',
        '--no-includeSnapshot',
      ],
    );
  });

  it('keeps bare flags, negated flags and other arguments', () => {
    assert.deepStrictEqual(
      normalizeBooleanFlags(
        ['--dblClick', 'uid', '--no-includeSnapshot', '--text', 'true'],
        booleans,
      ),
      ['--dblClick', 'uid', '--no-includeSnapshot', '--text', 'true'],
    );
  });

  it('stops at the option terminator', () => {
    assert.deepStrictEqual(
      normalizeBooleanFlags(['--', '--dblClick', 'true'], booleans),
      ['--', '--dblClick', 'true'],
    );
  });

  it('rejects non-boolean values', () => {
    assert.throws(
      () => normalizeBooleanFlags(['--dblClick=yes'], booleans),
      usageError({message: /expected true or false/}),
    );
  });
});

describe('parseToolArgs', () => {
  const click = {name: 'click', args: commands['click'].args};
  const clickAt = {name: 'click_at', args: commands['click_at'].args};
  const uploadFile = {name: 'upload_file', args: commands['upload_file'].args};
  const evaluateScript = {
    name: 'evaluate_script',
    args: commands['evaluate_script'].args,
  };
  const listConsoleMessages = {
    name: 'list_console_messages',
    args: commands['list_console_messages'].args,
  };
  const lighthouse = {
    name: 'lighthouse_audit',
    args: commands['lighthouse_audit'].args,
  };

  it('maps positionals and boolean flags', () => {
    const {args, outputFormat} = parseToolArgs(click, [
      '1',
      'abc',
      '--dblClick',
      'true',
      '--includeSnapshot=false',
    ]);
    assert.deepStrictEqual(args, {
      pageId: 1,
      uid: 'abc',
      dblClick: true,
      includeSnapshot: false,
    });
    assert.strictEqual(outputFormat, 'md');
  });

  it('supports bare and negated boolean flags', () => {
    assert.deepStrictEqual(
      parseToolArgs(click, ['1', 'abc', '--dblClick', '--no-includeSnapshot'])
        .args,
      {pageId: 1, uid: 'abc', dblClick: true, includeSnapshot: false},
    );
  });

  it('coerces numeric positionals', () => {
    assert.deepStrictEqual(parseToolArgs(clickAt, ['1', '100', '200.5']).args, {
      pageId: 1,
      x: 100,
      y: 200.5,
    });
  });

  it('rejects invalid numbers', () => {
    assert.throws(
      () => parseToolArgs(clickAt, ['1', 'abc', '10']),
      usageError({message: /Invalid value for x: expected a number/}),
    );
    const heapsnapshot = {
      name: 'analyze_heapsnapshot_contexts',
      args: commands['analyze_heapsnapshot_contexts'].args,
    };
    assert.throws(
      () => parseToolArgs(heapsnapshot, ['x.heapsnapshot', '--pageIdx=1.5']),
      usageError({message: /Invalid value for pageIdx: expected an integer/}),
    );
  });

  it('collects a trailing required array positional', () => {
    assert.deepStrictEqual(
      parseToolArgs(uploadFile, ['1', 'uid', 'a.txt', 'b.txt']).args,
      {pageId: 1, uid: 'uid', filePaths: ['a.txt', 'b.txt']},
    );
  });

  it('collects repeated array flags', () => {
    assert.deepStrictEqual(
      parseToolArgs(listConsoleMessages, [
        '1',
        '--types',
        'error',
        '--types',
        'info',
      ]).args,
      {
        pageId: 1,
        types: ['error', 'info'],
        includePreservedMessages: false,
        includeStackTraces: false,
      },
    );
  });

  it('handles the optional evaluate_script positional', () => {
    assert.deepStrictEqual(
      parseToolArgs(evaluateScript, ['() => 1', '--pageId', '1']).args,
      {function: '() => 1', pageId: 1},
    );
    assert.deepStrictEqual(
      parseToolArgs(evaluateScript, ['--pageId', '1', '--sourcePath', 'x.js'])
        .args,
      {pageId: 1, sourcePath: 'x.js'},
    );
  });

  it('validates enum values', () => {
    assert.deepStrictEqual(
      parseToolArgs(lighthouse, ['1', '--mode', 'snapshot']).args.mode,
      'snapshot',
    );
    assert.throws(
      () => parseToolArgs(lighthouse, ['1', '--mode', 'bogus']),
      usageError({message: /Invalid value for mode: expected one of/}),
    );
  });

  it('applies schema defaults', () => {
    const withDefault: Record<string, ArgDef> = {
      flag: {
        name: 'flag',
        type: 'string',
        description: '',
        required: false,
        default: 'x',
      },
    };
    assert.deepStrictEqual(
      parseToolArgs({name: 'dummy', args: withDefault}, []).args,
      {flag: 'x'},
    );
  });

  it('reports missing positionals with the usage tip', () => {
    assert.throws(
      () => parseToolArgs(click, ['1']),
      usageError({
        message: /Not enough non-option arguments: got 1, need at least 2/,
        showTip: true,
      }),
    );
  });

  it('reports extra positionals and unknown flags with the usage tip', () => {
    assert.throws(
      () => parseToolArgs(click, ['1', 'abc', 'extra']),
      usageError({message: /Unknown arguments: extra/, showTip: true}),
    );
    assert.throws(
      () => parseToolArgs(click, ['1', '--uid', 'abc']),
      usageError({message: /Unknown option '--uid'/, showTip: true}),
    );
  });

  it('accepts values starting with a dash after --', () => {
    const fill = {name: 'fill', args: commands['fill'].args};
    assert.deepStrictEqual(parseToolArgs(fill, ['1', 'uid', '--', '-5']).args, {
      pageId: 1,
      uid: 'uid',
      value: '-5',
    });
  });

  it('parses the output format', () => {
    assert.strictEqual(
      parseToolArgs(click, ['1', 'abc', '--output-format', 'json'])
        .outputFormat,
      'json',
    );
    assert.throws(
      () => parseToolArgs(click, ['1', 'abc', '--output-format=xml']),
      usageError({message: /Invalid value for output-format/}),
    );
  });

  it('parses a valid invocation of every generated command', () => {
    for (const [name, {args}] of Object.entries(commands)) {
      const argv: string[] = [];
      const expected: Record<string, unknown> = {};
      for (const [argName, arg] of Object.entries(args)) {
        if (!arg.required) {
          continue;
        }
        const value =
          arg.enum?.[0] ??
          (arg.type === 'number' || arg.type === 'integer' ? 1 : 'value');
        argv.push(String(value));
        expected[argName] = arg.type === 'array' ? [value] : value;
      }
      for (const [argName, arg] of Object.entries(args)) {
        if (arg.default !== undefined && !(argName in expected)) {
          expected[argName] = arg.default;
        }
      }
      assert.deepStrictEqual(
        parseToolArgs({name, args}, argv).args,
        expected,
        `${name} ${argv.join(' ')}`,
      );
    }
  });
});

describe('assertNoArgs', () => {
  it('rejects leftover arguments', () => {
    assert.doesNotThrow(() => assertNoArgs('status', []));
    assert.throws(
      () => assertNoArgs('status', ['--foo']),
      usageError({message: /Unknown arguments for status: --foo/}),
    );
  });
});
