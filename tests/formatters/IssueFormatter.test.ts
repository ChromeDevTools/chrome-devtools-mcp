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
    sinon.restore();
  });

  function formatterTestConcise(
    label: string,
    setup: (t: it.TestContext) => Promise<IssueFormatter>,
  ) {
    it(label + ' toString', async t => {
      const formatter = await setup(t);
      t.assert.snapshot?.(formatter.toString());
    });
    it(label + ' toJSON', async t => {
      const formatter = await setup(t);
      t.assert.snapshot?.(JSON.stringify(formatter.toJSON(), null, 2));
    });
  }

  function formatterTestDetailed(
    label: string,
    setup: (t: it.TestContext) => Promise<IssueFormatter>,
  ) {
    it(label + ' toStringDetailed', async t => {
      const formatter = await setup(t);
      t.assert.snapshot?.(formatter.toStringDetailed());
    });
    it(label + ' toJSONDetailed', async t => {
      const formatter = await setup(t);
      t.assert.snapshot?.(JSON.stringify(formatter.toJSONDetailed(), null, 2));
    });
  }

  formatterTestConcise('formats an issue message', async () => {
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

    return new IssueFormatter(mockAggregatedIssue, {
      id: 5,
    });
  });

  formatterTestConcise('formats a simplified issue', async () => {
    const mockAggregatedIssue = getMockAggregatedIssue();
    mockAggregatedIssue.getDescription.returns({
      file: 'mock.md',
      links: [],
    });
    mockAggregatedIssue.getAggregatedIssuesCount.returns(5);
    getIssueDescriptionStub
      .withArgs('mock.md')
      .returns('# Issue Title\n\nIssue content');

    return new IssueFormatter(mockAggregatedIssue, {id: 1});
  });

  formatterTestDetailed('formats a detailed issue', async () => {
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

    return new IssueFormatter(mockAggregatedIssue, {
      id: 5,
      elementIdResolver: () => '1_1',
    });
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
});
