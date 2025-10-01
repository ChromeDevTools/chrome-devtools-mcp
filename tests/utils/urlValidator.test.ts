/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {UrlValidator} from '../../src/utils/urlValidator.js';
import {createLogger} from '../utils.js';

describe('UrlValidator', () => {
  describe('parseOrigins', () => {
    it('should parse semicolon-separated origins', () => {
      const result = UrlValidator.parseOrigins(
        'https://example.com;https://api.example.com',
      );
      assert.deepStrictEqual(result, [
        'https://example.com',
        'https://api.example.com',
      ]);
    });

    it('should trim whitespace', () => {
      const result = UrlValidator.parseOrigins(
        ' https://example.com ; https://api.example.com ',
      );
      assert.deepStrictEqual(result, [
        'https://example.com',
        'https://api.example.com',
      ]);
    });

    it('should filter empty strings', () => {
      const result = UrlValidator.parseOrigins('https://example.com;;');
      assert.deepStrictEqual(result, ['https://example.com']);
    });

    it('should return empty array for undefined', () => {
      const result = UrlValidator.parseOrigins(undefined);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('isAllowed', () => {
    it('should allow all URLs when no restrictions', () => {
      const validator = new UrlValidator({}, createLogger());
      assert.strictEqual(validator.isAllowed('https://example.com'), true);
      assert.strictEqual(validator.isAllowed('https://blocked.com'), true);
    });

    it('should allow special URLs', () => {
      const validator = new UrlValidator(
        {allowedOrigins: ['https://example.com']},
        createLogger(),
      );
      assert.strictEqual(validator.isAllowed('about:blank'), true);
      assert.strictEqual(validator.isAllowed('data:text/html,test'), true);
      assert.strictEqual(validator.isAllowed('blob:test'), true);
      assert.strictEqual(validator.isAllowed('file:///test'), true);
    });

    it('should block URLs not in allowlist', () => {
      const validator = new UrlValidator(
        {allowedOrigins: ['https://example.com']},
        createLogger(),
      );
      assert.strictEqual(validator.isAllowed('https://example.com'), true);
      assert.strictEqual(validator.isAllowed('https://example.com/path'), true);
      assert.strictEqual(validator.isAllowed('https://other.com'), false);
    });

    it('should block URLs in blocklist', () => {
      const validator = new UrlValidator(
        {blockedOrigins: ['https://blocked.com']},
        createLogger(),
      );
      assert.strictEqual(validator.isAllowed('https://example.com'), true);
      assert.strictEqual(validator.isAllowed('https://blocked.com'), false);
    });

    it('should prioritize blocklist over allowlist', () => {
      const validator = new UrlValidator(
        {
          allowedOrigins: ['https://example.com'],
          blockedOrigins: ['https://example.com'],
        },
        createLogger(),
      );
      assert.strictEqual(validator.isAllowed('https://example.com'), false);
    });

    it('should support wildcard patterns', () => {
      const validator = new UrlValidator(
        {allowedOrigins: ['https://*.example.com']},
        createLogger(),
      );
      assert.strictEqual(validator.isAllowed('https://api.example.com'), true);
      assert.strictEqual(validator.isAllowed('https://cdn.example.com'), true);
      assert.strictEqual(validator.isAllowed('https://example.com'), false);
      assert.strictEqual(validator.isAllowed('https://other.com'), false);
    });

    it('should support wildcard in blocklist', () => {
      const validator = new UrlValidator(
        {blockedOrigins: ['https://*.ads.example.com']},
        createLogger(),
      );
      assert.strictEqual(
        validator.isAllowed('https://tracker.ads.example.com'),
        false,
      );
      assert.strictEqual(
        validator.isAllowed('https://stats.ads.example.com'),
        false,
      );
      assert.strictEqual(validator.isAllowed('https://example.com'), true);
    });
  });

  describe('hasRestrictions', () => {
    it('should return false when no restrictions', () => {
      const validator = new UrlValidator({}, createLogger());
      assert.strictEqual(validator.hasRestrictions(), false);
    });

    it('should return true when allowlist is set', () => {
      const validator = new UrlValidator(
        {allowedOrigins: ['https://example.com']},
        createLogger(),
      );
      assert.strictEqual(validator.hasRestrictions(), true);
    });

    it('should return true when blocklist is set', () => {
      const validator = new UrlValidator(
        {blockedOrigins: ['https://blocked.com']},
        createLogger(),
      );
      assert.strictEqual(validator.hasRestrictions(), true);
    });
  });
});
