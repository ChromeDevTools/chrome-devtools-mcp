/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {AggregatedIssue} from '../node_modules/chrome-devtools-frontend/mcp/mcp.js';
import {
  extractUrlLikeFromDevToolsTitle,
  urlsEqual,
  mapIssueToMessageObject,
} from '../src/DevtoolsUtils.js';
import {ISSUE_UTILS} from '../src/issue-descriptions.js';

describe('extractUrlFromDevToolsTitle', () => {
  it('deals with no trailing /', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - example.com'),
      'example.com',
    );
  });
  it('deals with a trailing /', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - example.com/'),
      'example.com/',
    );
  });
  it('deals with www', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - www.example.com/'),
      'www.example.com/',
    );
  });
  it('deals with complex url', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle(
        'DevTools - www.example.com/path.html?a=b#3',
      ),
      'www.example.com/path.html?a=b#3',
    );
  });
});

describe('urlsEqual', () => {
  it('ignores trailing slashes', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://google.com'),
      true,
    );
  });

  it('ignores www', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://www.google.com'),
      true,
    );
  });

  it('ignores protocols', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'http://www.google.com'),
      true,
    );
  });

  it('does not ignore other subdomains', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://photos.google.com'),
      false,
    );
  });
});

describe('mapIssueToMessageObject', () => {
  const mockDescription = {
    file: 'mock-issue.md',
    substitutions: new Map([['PLACEHOLDER_VALUE', 'substitution value']]),
    links: [
      {link: 'http://example.com/learnmore', linkTitle: 'Learn more'},
      {
        link: 'http://example.com/another-learnmore',
        linkTitle: 'Learn more 2',
      },
    ],
  };

  afterEach(() => {
    sinon.restore();
  });

  it('maps aggregated issue with substituted description', () => {
    const mockAggregatedIssue = sinon.createStubInstance(AggregatedIssue);
    mockAggregatedIssue.getDescription.returns(mockDescription);
    mockAggregatedIssue.getAggregatedIssuesCount.returns(1);

    const getIssueDescriptionStub = sinon.stub(
      ISSUE_UTILS,
      'getIssueDescription',
    );

    getIssueDescriptionStub
      .withArgs('mock-issue.md')
      .returns(
        '# Mock Issue Title\n\nThis is a mock issue description with a {PLACEHOLDER_VALUE}.',
      );

    const result = mapIssueToMessageObject(mockAggregatedIssue);
    const expected = {
      type: 'issue',
      item: mockAggregatedIssue,
      message: 'Mock Issue Title',
      count: 1,
      description:
        '# Mock Issue Title\n\nThis is a mock issue description with a substitution value.',
    };
    assert.deepStrictEqual(result, expected);
  });

  it('returns null for the issue with no description', () => {
    const mockAggregatedIssue = sinon.createStubInstance(AggregatedIssue);
    mockAggregatedIssue.getDescription.returns(null);

    const result = mapIssueToMessageObject(mockAggregatedIssue);
    assert.equal(result, null);
  });

  it('returns null if there is no desciption file', () => {
    const mockAggregatedIssue = sinon.createStubInstance(AggregatedIssue);
    mockAggregatedIssue.getDescription.returns(mockDescription);
    mockAggregatedIssue.getAggregatedIssuesCount.returns(1);

    const getIssueDescriptionStub = sinon.stub(
      ISSUE_UTILS,
      'getIssueDescription',
    );

    getIssueDescriptionStub.withArgs('mock-issue.md').returns(null);
    const result = mapIssueToMessageObject(mockAggregatedIssue);
    assert.equal(result, null);
  });

  it("returns null if can't parse the title", () => {
    const mockAggregatedIssue = sinon.createStubInstance(AggregatedIssue);
    mockAggregatedIssue.getDescription.returns(mockDescription);
    mockAggregatedIssue.getAggregatedIssuesCount.returns(1);

    const getIssueDescriptionStub = sinon.stub(
      ISSUE_UTILS,
      'getIssueDescription',
    );

    getIssueDescriptionStub
      .withArgs('mock-issue.md')
      .returns('No title test {PLACEHOLDER_VALUE}');
    assert.deepStrictEqual(mapIssueToMessageObject(mockAggregatedIssue), null);
  });

  it('returns null if devtools utill function throws an error', () => {
    const mockAggregatedIssue = sinon.createStubInstance(AggregatedIssue);
    mockAggregatedIssue.getDescription.returns(mockDescription);
    mockAggregatedIssue.getAggregatedIssuesCount.returns(1);

    const getIssueDescriptionStub = sinon.stub(
      ISSUE_UTILS,
      'getIssueDescription',
    );
    // An error will be thrown if placeholder doesn't start from PLACEHOLDER_
    getIssueDescriptionStub
      .withArgs('mock-issue.md')
      .returns('No title test {WRONG_PLACEHOLDER}');
    assert.deepStrictEqual(mapIssueToMessageObject(mockAggregatedIssue), null);
  });
});
