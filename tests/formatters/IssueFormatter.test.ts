/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {IssueFormatter} from '../../src/formatters/IssueFormatter.js';
import {ISSUE_UTILS} from '../../src/issue-descriptions.js';
import {getMockAggregatedIssue} from '../utils.js';

describe('IssueFormatter', () => {
  let getIssueDescriptionStub: sinon.SinonStub;

  beforeEach(() => {
    getIssueDescriptionStub = sinon.stub(ISSUE_UTILS, 'getIssueDescription');
  });

  afterEach(() => {
    getIssueDescriptionStub.restore();
  });

  it('formats an issue message', t => {
    const testGenericIssue = {
      details: () => {
        return {
          violatingNodeId: 2,
          violatingNodeAttribute: 'test',
        };
      },
    };
    const mockAggregatedIssue = getMockAggregatedIssue();
    const mockDescription = {
      file: 'mock.md',
      links: [
        {link: 'http://example.com/learnmore', linkTitle: 'Learn more'},
        {
          link: 'http://example.com/another-learnmore',
          linkTitle: 'Learn more 2',
        },
      ],
    };
    mockAggregatedIssue.getDescription.returns(mockDescription);
    // @ts-expect-error generic issue stub bypass
    mockAggregatedIssue.getGenericIssues.returns(new Set([testGenericIssue]));

    const mockDescriptionFileContent =
      '# Mock Issue Title\n\nThis is a mock issue description';

    getIssueDescriptionStub
      .withArgs('mock.md')
      .returns(mockDescriptionFileContent);

    const formatter = new IssueFormatter(mockAggregatedIssue, {
      id: 5,
    });

    const result = formatter.toStringDetailed();
    t.assert.snapshot?.(result);
  });

  describe('isValid', () => {
    it('returns false for the issue with no description', () => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      mockAggregatedIssue.getDescription.returns(null);

      const formatter = new IssueFormatter(mockAggregatedIssue, {id: 1});
      assert.strictEqual(formatter.isValid(), false);
    });

    it('returns false if there is no description file', () => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      mockAggregatedIssue.getDescription.returns({
        file: 'mock.md',
        links: [],
      });
      getIssueDescriptionStub.withArgs('mock.md').returns(null);

      const formatter = new IssueFormatter(mockAggregatedIssue, {id: 1});
      assert.strictEqual(formatter.isValid(), false);
    });

    it("returns false if can't parse the title", () => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      mockAggregatedIssue.getDescription.returns({
        file: 'mock.md',
        links: [],
      });
      getIssueDescriptionStub
        .withArgs('mock.md')
        .returns('No title test {PLACEHOLDER_VALUE}');

      const formatter = new IssueFormatter(mockAggregatedIssue, {id: 1});
      assert.strictEqual(formatter.isValid(), false);
    });

    it('returns false if devtools util function throws an error', () => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      mockAggregatedIssue.getDescription.returns({
        file: 'mock.md',
        links: [],
        substitutions: new Map([['PLACEHOLDER_VALUE', 'substitution value']]),
      });

      getIssueDescriptionStub
        .withArgs('mock.md')
        .returns('No title test {WRONG_PLACEHOLDER}');

      const formatter = new IssueFormatter(mockAggregatedIssue, {id: 1});
      assert.strictEqual(formatter.isValid(), false);
    });

    it('returns true for valid issue', () => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      mockAggregatedIssue.getDescription.returns({
        file: 'mock.md',
        links: [],
        substitutions: new Map([['PLACEHOLDER_VALUE', 'substitution value']]),
      });
      getIssueDescriptionStub
        .withArgs('mock.md')
        .returns('# Valid Title\n\nContent {PLACEHOLDER_VALUE}');

      const formatter = new IssueFormatter(mockAggregatedIssue, {id: 1});
      assert.strictEqual(formatter.isValid(), true);

      // Verify usage of substitutions in detailed output
      const detailed = formatter.toStringDetailed();
      assert.ok(detailed.includes('substitution value'));
      assert.ok(detailed.includes('Valid Title'));
    });
  });
  describe('toJSON', () => {
    it('formats a simplified issue', () => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      mockAggregatedIssue.getDescription.returns({
        file: 'mock.md',
        links: [],
      });
      mockAggregatedIssue.getAggregatedIssuesCount.returns(5);
      getIssueDescriptionStub
        .withArgs('mock.md')
        .returns('# Issue Title\n\nIssue content');

      const formatter = new IssueFormatter(mockAggregatedIssue, {id: 1});
      assert.deepStrictEqual(formatter.toJSON(), {
        type: 'issue',
        title: 'Issue Title',
        count: 5,
        id: 1,
      });
    });
  });

  describe('toJSONDetailed', () => {
    it('formats a detailed issue', () => {
      const testGenericIssue = {
        details: () => {
          return {
            violatingNodeId: 2,
            violatingNodeAttribute: 'test',
          };
        },
      };
      const mockAggregatedIssue = getMockAggregatedIssue();
      const mockDescription = {
        file: 'mock.md',
        links: [{link: 'http://example.com', linkTitle: 'Link 1'}],
        substitutions: new Map([['PLACEHOLDER_VALUE', 'sub value']]),
      };
      mockAggregatedIssue.getDescription.returns(mockDescription);
      // @ts-expect-error stubbed generic issue does not match the complete type.
      mockAggregatedIssue.getAllIssues.returns([testGenericIssue]);

      const mockDescriptionFileContent =
        '# Mock Issue Title\n\nThis is a mock issue description {PLACEHOLDER_VALUE}';

      getIssueDescriptionStub
        .withArgs('mock.md')
        .returns(mockDescriptionFileContent);

      const formatter = new IssueFormatter(mockAggregatedIssue, {
        id: 5,
      });

      const detailedResult = formatter.toJSONDetailed() as unknown as Record<
        string,
        object
      > & {affectedResources: Array<{data: object}>};
      assert.strictEqual(detailedResult.id, 5);
      assert.strictEqual(detailedResult.type, 'issue');
      assert.strictEqual(detailedResult.title, 'Mock Issue Title');
      assert.strictEqual(
        detailedResult.description,
        '# Mock Issue Title\n\nThis is a mock issue description sub value',
      );
      assert.deepStrictEqual(detailedResult.links, mockDescription.links);
      assert.strictEqual(detailedResult.affectedResources.length, 1);
      assert.deepStrictEqual(detailedResult.affectedResources[0].data, {
        violatingNodeAttribute: 'test',
        violatingNodeId: 2,
      });
    });
  });
});
