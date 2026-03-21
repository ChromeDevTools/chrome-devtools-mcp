/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ToolNameAliaser} from '../../src/tools/tool-name-aliaser.js';

describe('ToolNameAliaser', () => {
  describe('passthrough', () => {
    it('returns names unchanged when within the limit', () => {
      const aliaser = new ToolNameAliaser(20);
      assert.strictEqual(aliaser.register('list_pages'), 'list_pages');
      assert.strictEqual(aliaser.register('click'), 'click');
      assert.strictEqual(aliaser.register('wait_for'), 'wait_for');
    });

    it('returns names at exactly the limit unchanged', () => {
      const aliaser = new ToolNameAliaser(15);
      assert.strictEqual(
        aliaser.register('take_screenshot'),
        'take_screenshot',
      );
      assert.strictEqual(
        aliaser.register('evaluate_script'),
        'evaluate_script',
      );
    });
  });

  describe('shortening', () => {
    it('shortens names exceeding the limit using abbreviations', () => {
      const aliaser = new ToolNameAliaser(15);
      const alias = aliaser.register('performance_analyze_insight');
      assert.ok(alias.length <= 15, `"${alias}" exceeds 15 chars`);
      assert.strictEqual(alias, 'perf_anlz_ins');
    });

    it('truncates segments when abbreviations alone are insufficient', () => {
      const aliaser = new ToolNameAliaser(15);
      // 'perf_start_trace' = 16 chars after abbreviation, needs truncation
      const alias = aliaser.register('performance_start_trace');
      assert.ok(alias.length <= 15, `"${alias}" exceeds 15 chars`);
    });

    it('uses abbreviation dictionary for common words', () => {
      const aliaser = new ToolNameAliaser(15);
      assert.strictEqual(
        aliaser.register('lighthouse_audit'),
        'lh_audit',
      );
      assert.strictEqual(
        aliaser.register('get_console_message'),
        'get_cons_msg',
      );
      assert.strictEqual(
        aliaser.register('list_network_requests'),
        'list_net_reqs',
      );
    });
  });

  describe('collision handling', () => {
    it('appends a numeric suffix on collision', () => {
      // Use a very short maxLength to force collisions between similar names.
      const aliaser = new ToolNameAliaser(5);
      const alias1 = aliaser.register('abcdef_one');
      const alias2 = aliaser.register('abcdef_two');
      assert.notStrictEqual(alias1, alias2);
      assert.ok(alias1.length <= 5, `"${alias1}" exceeds 5 chars`);
      assert.ok(alias2.length <= 5, `"${alias2}" exceeds 5 chars`);
    });

    it('resolves colliding aliases back to correct originals', () => {
      const aliaser = new ToolNameAliaser(5);
      const alias1 = aliaser.register('abcdef_one');
      const alias2 = aliaser.register('abcdef_two');
      assert.strictEqual(aliaser.resolve(alias1), 'abcdef_one');
      assert.strictEqual(aliaser.resolve(alias2), 'abcdef_two');
    });
  });

  describe('round-trip mapping', () => {
    it('maps alias→original and original→alias for all shortened names', () => {
      const aliaser = new ToolNameAliaser(15);
      const names = [
        'get_console_message',
        'list_console_messages',
        'get_network_request',
        'list_network_requests',
        'performance_start_trace',
        'performance_stop_trace',
        'performance_analyze_insight',
        'lighthouse_audit',
        'take_memory_snapshot',
      ];
      for (const name of names) {
        const alias = aliaser.register(name);
        assert.ok(
          alias.length <= 15,
          `"${alias}" for "${name}" exceeds 15 chars`,
        );
        assert.strictEqual(
          aliaser.resolve(alias),
          name,
          `resolve("${alias}") should return "${name}"`,
        );
        assert.strictEqual(
          aliaser.getAlias(name),
          alias,
          `getAlias("${name}") should return "${alias}"`,
        );
      }
    });

    it('round-trips passthrough names correctly', () => {
      const aliaser = new ToolNameAliaser(15);
      assert.strictEqual(aliaser.register('click'), 'click');
      assert.strictEqual(aliaser.resolve('click'), 'click');
      assert.strictEqual(aliaser.getAlias('click'), 'click');
    });
  });

  describe('chrome-devtools-mcp long-name examples', () => {
    // Bedrock 64-char limit with a 49-char MCP client prefix
    // mcp__plugin_chrome-devtools-mcp_chrome-devtools__ = 49 chars
    // Max tool name length = 64 - 49 = 15
    const MAX_LENGTH = 15;

    const FAILING_NAMES = [
      'get_console_message',
      'get_network_request',
      'lighthouse_audit',
      'list_console_messages',
      'list_network_requests',
      'performance_analyze_insight',
      'performance_start_trace',
      'performance_stop_trace',
      'take_memory_snapshot',
    ];

    it('all failing names produce aliases within the 15-char limit', () => {
      const aliaser = new ToolNameAliaser(MAX_LENGTH);
      for (const name of FAILING_NAMES) {
        const alias = aliaser.register(name);
        assert.ok(
          alias.length <= MAX_LENGTH,
          `"${alias}" (${alias.length} chars) for "${name}" exceeds ${MAX_LENGTH}`,
        );
      }
    });

    it('all aliases are unique', () => {
      const aliaser = new ToolNameAliaser(MAX_LENGTH);
      const seen = new Set<string>();
      for (const name of FAILING_NAMES) {
        const alias = aliaser.register(name);
        assert.ok(!seen.has(alias), `Duplicate alias "${alias}"`);
        seen.add(alias);
      }
    });

    it('full tool name with prefix stays within 64 chars', () => {
      const PREFIX = 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__';
      const aliaser = new ToolNameAliaser(MAX_LENGTH);
      for (const name of FAILING_NAMES) {
        const alias = aliaser.register(name);
        const fullName = PREFIX + alias;
        assert.ok(
          fullName.length <= 64,
          `"${fullName}" (${fullName.length} chars) exceeds 64`,
        );
      }
    });

    it('produces human-readable aliases', () => {
      const aliaser = new ToolNameAliaser(MAX_LENGTH);
      const aliases = FAILING_NAMES.map(n => aliaser.register(n));
      // All aliases should contain only [a-z0-9_]
      for (const alias of aliases) {
        assert.match(alias, /^[a-z0-9_]+$/);
      }
    });
  });

  describe('full tool set uniqueness', () => {
    it('produces unique aliases for all chrome-devtools-mcp tools', () => {
      const aliaser = new ToolNameAliaser(15);
      const allTools = [
        'click',
        'click_at',
        'close_page',
        'drag',
        'emulate',
        'evaluate_script',
        'fill',
        'fill_form',
        'get_console_message',
        'get_network_request',
        'get_tab_id',
        'handle_dialog',
        'hover',
        'install_extension',
        'lighthouse_audit',
        'list_console_messages',
        'list_extensions',
        'list_network_requests',
        'list_pages',
        'navigate_page',
        'new_page',
        'performance_analyze_insight',
        'performance_start_trace',
        'performance_stop_trace',
        'press_key',
        'reload_extension',
        'resize_page',
        'screencast_start',
        'screencast_stop',
        'select_page',
        'take_memory_snapshot',
        'take_screenshot',
        'take_snapshot',
        'trigger_extension_action',
        'type_text',
        'uninstall_extension',
        'upload_file',
        'wait_for',
      ];

      const aliases = new Set<string>();
      for (const name of allTools) {
        const alias = aliaser.register(name);
        assert.ok(
          alias.length <= 15,
          `Alias "${alias}" for "${name}" exceeds 15 chars`,
        );
        assert.ok(
          !aliases.has(alias),
          `Duplicate alias "${alias}" (from "${name}")`,
        );
        aliases.add(alias);
      }
    });
  });

  describe('determinism', () => {
    it('produces the same aliases across separate instantiations', () => {
      const names = [
        'get_console_message',
        'get_network_request',
        'performance_start_trace',
        'performance_stop_trace',
        'performance_analyze_insight',
        'take_memory_snapshot',
      ];

      const run = () => {
        const a = new ToolNameAliaser(15);
        return names.map(n => a.register(n));
      };

      assert.deepStrictEqual(run(), run());
    });

    it('returns the same alias for duplicate registrations', () => {
      const aliaser = new ToolNameAliaser(15);
      const first = aliaser.register('performance_analyze_insight');
      const second = aliaser.register('performance_analyze_insight');
      assert.strictEqual(first, second);
    });
  });

  describe('edge cases', () => {
    it('throws on maxLength < 1', () => {
      assert.throws(() => new ToolNameAliaser(0), /maxLength must be at least 1/);
    });

    it('handles single-character maxLength', () => {
      const aliaser = new ToolNameAliaser(1);
      const alias = aliaser.register('ab');
      assert.ok(alias.length <= 1);
    });

    it('resolve returns undefined for unknown aliases', () => {
      const aliaser = new ToolNameAliaser(15);
      assert.strictEqual(aliaser.resolve('nonexistent'), undefined);
    });

    it('getAlias returns undefined for unregistered names', () => {
      const aliaser = new ToolNameAliaser(15);
      assert.strictEqual(aliaser.getAlias('nonexistent'), undefined);
    });

    it('entries returns all registered mappings', () => {
      const aliaser = new ToolNameAliaser(15);
      aliaser.register('click');
      aliaser.register('performance_analyze_insight');
      const entries = aliaser.entries();
      assert.strictEqual(entries.length, 2);
    });
  });
});
