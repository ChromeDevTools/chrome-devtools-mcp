/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {ISSUE_UTILS} from '../../src/devtools/issueDescriptions.js';
import {IssueFormatter} from '../../src/formatters/IssueFormatter.js';
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
      t.assert.snapshot(formatter.toString());
    });
    it(label + ' toJSON', async t => {
      const formatter = await setup(t);
      t.assert.snapshot(JSON.stringify(formatter.toJSON(), null, 2));
    });
  }

  function formatterTestDetailed(
    label: string,
    setup: (t: it.TestContext) => Promise<IssueFormatter>,
  ) {
    it(label + ' toStringDetailed', async t => {
      const formatter = await setup(t);
      t.assert.snapshot(formatter.toStringDetailed());
    });
    it(label + ' toJSONDetailed', async t => {
      const formatter = await setup(t);
      t.assert.snapshot(JSON.stringify(formatter.toJSONDetailed(), null, 2));
    });
  }

  function getMockIssueWithDetails(details: object | null) {
    const mockAggregatedIssue = getMockAggregatedIssue();
    mockAggregatedIssue.getDescription.returns({
      file: 'mock.md',
      links: [],
    });
    getIssueDescriptionStub
      .withArgs('mock.md')
      .returns('# Mock Issue Title\n\nThis is a mock issue description');
    // @ts-expect-error stubbed issue does not match the complete type.
    mockAggregatedIssue.getAllIssues.returns([{details: () => details}]);
    return mockAggregatedIssue;
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

  formatterTestDetailed(
    'formats a detailed issue with a resolved request id',
    async () => {
      const mockAggregatedIssue = getMockIssueWithDetails({
        request: {
          url: 'http://example.com/data.json',
          requestId: 'REQUEST-1',
        },
        errorType: 'MockError',
        frameId: 'FRAME-1',
      });

      return new IssueFormatter(mockAggregatedIssue, {
        id: 6,
        requestIdResolver: requestId =>
          requestId === 'REQUEST-1' ? 42 : undefined,
      });
    },
  );

  formatterTestDetailed(
    'formats a detailed issue with an unresolved request id',
    async () => {
      const mockAggregatedIssue = getMockIssueWithDetails({
        request: {
          url: 'http://example.com/data.json',
          requestId: 'REQUEST-1',
        },
      });

      return new IssueFormatter(mockAggregatedIssue, {
        id: 7,
      });
    },
  );

  it('falls back to "Unknown Issue" when there is no description metadata', () => {
    const mockAggregatedIssue = getMockAggregatedIssue();
    mockAggregatedIssue.getDescription.returns(null);
    mockAggregatedIssue.getAggregatedIssuesCount.returns(1);

    const formatter = new IssueFormatter(mockAggregatedIssue, {id: 3});
    assert.strictEqual(
      formatter.toString(),
      'msgid=3 [issue] Unknown Issue (count: 1)',
    );
    assert.strictEqual(
      formatter.toStringDetailed(),
      'ID: 3\nMessage: issue> Unknown Issue',
    );
  });

  describe('affected resources', () => {
    it('resolves nodeId with the element id resolver', () => {
      const formatter = new IssueFormatter(
        getMockIssueWithDetails({nodeId: 42, extra: 'info'}),
        {
          id: 1,
          elementIdResolver: backendNodeId =>
            backendNodeId === 42 ? '2_7' : undefined,
        },
      );
      assert.deepStrictEqual(formatter.toJSONDetailed().affectedResources, [
        {uid: '2_7', data: {extra: 'info'}, request: undefined},
      ]);
    });

    it('resolves documentNodeId with the element id resolver', () => {
      const formatter = new IssueFormatter(
        getMockIssueWithDetails({documentNodeId: 7}),
        {
          id: 1,
          elementIdResolver: backendNodeId =>
            backendNodeId === 7 ? '3_1' : undefined,
        },
      );
      assert.deepStrictEqual(formatter.toJSONDetailed().affectedResources, [
        {uid: '3_1', data: {}, request: undefined},
      ]);
    });

    it('keeps node ids if there is no element id resolver', () => {
      const formatter = new IssueFormatter(
        getMockIssueWithDetails({nodeId: 42}),
        {id: 1},
      );
      assert.deepStrictEqual(formatter.toJSONDetailed().affectedResources, [
        {uid: undefined, data: {nodeId: 42}, request: undefined},
      ]);
    });

    it('skips issues without details', () => {
      const formatter = new IssueFormatter(getMockIssueWithDetails(null), {
        id: 1,
      });
      assert.deepStrictEqual(formatter.toJSONDetailed().affectedResources, []);
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
