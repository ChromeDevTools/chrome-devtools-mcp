/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {beforeEach, describe, it} from 'node:test';

import type {Frame, HTTPRequest, Target, Protocol} from 'puppeteer-core';
import sinon from 'sinon';

import type {ListenerMap} from '../src/PageCollector.js';
import {
  ConsoleCollector,
  NetworkCollector,
  PageCollector,
} from '../src/PageCollector.js';
import {DevTools} from '../src/third_party/index.js';

import {getMockRequest, getMockBrowser} from './utils.js';

describe('PageCollector', () => {
  it('works', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init([page]);
    page.emit('request', request);

    assert.equal(collector.getData(page)[0], request);
  });

  it('clean up after navigation', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init([page]);
    page.emit('request', request);

    assert.equal(collector.getData(page)[0], request);
    page.emit('framenavigated', mainFrame);

    assert.equal(collector.getData(page).length, 0);
  });

  it('does not clean up after sub frame navigation', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init([page]);
    page.emit('request', request);
    page.emit('framenavigated', {} as Frame);

    assert.equal(collector.getData(page).length, 1);
  });

  it('clean up after navigation and be able to add data after', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init([page]);
    page.emit('request', request);

    assert.equal(collector.getData(page)[0], request);
    page.emit('framenavigated', mainFrame);

    assert.equal(collector.getData(page).length, 0);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 1);
  });

  it('should only subscribe once', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init([page]);
    browser.emit('targetcreated', {
      page() {
        return Promise.resolve(page);
      },
    } as Target);

    // The page inside part is async so we need to await some time
    await new Promise<void>(res => res());

    assert.equal(collector.getData(page).length, 0);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 1);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 2);
  });

  it('should clear data on page destroy', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request = getMockRequest();
    const collector = new PageCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init([page]);

    page.emit('request', request);

    assert.equal(collector.getData(page).length, 1);

    browser.emit('targetdestroyed', {
      page() {
        return Promise.resolve(page);
      },
    } as Target);

    // The page inside part is async so we need to await some time
    await new Promise<void>(res => res());

    assert.equal(collector.getData(page).length, 0);
  });

  it('should assign ids to requests', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const request1 = getMockRequest();
    const request2 = getMockRequest();
    const collector = new PageCollector<HTTPRequest>(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    });
    await collector.init([page]);

    page.emit('request', request1);
    page.emit('request', request2);

    assert.equal(collector.getData(page).length, 2);

    assert.equal(collector.getIdForResource(request1), 1);
    assert.equal(collector.getIdForResource(request2), 2);
  });
});

describe('NetworkCollector', () => {
  it('correctly picks up navigation requests to latest navigation', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const request = getMockRequest();
    const navRequest = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const request2 = getMockRequest();
    const collector = new NetworkCollector(browser);
    await collector.init([page]);
    page.emit('request', request);
    page.emit('request', navRequest);

    assert.equal(collector.getData(page)[0], request);
    assert.equal(collector.getData(page)[1], navRequest);
    page.emit('framenavigated', mainFrame);

    assert.equal(collector.getData(page).length, 1);
    assert.equal(collector.getData(page)[0], navRequest);

    page.emit('request', request2);

    assert.equal(collector.getData(page).length, 2);
    assert.equal(collector.getData(page)[0], navRequest);
    assert.equal(collector.getData(page)[1], request2);
  });

  it('correctly picks up after multiple back to back navigations', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const navRequest = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const navRequest2 = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const request = getMockRequest();

    const collector = new NetworkCollector(browser);
    await collector.init([page]);
    page.emit('request', navRequest);
    assert.equal(collector.getData(page)[0], navRequest);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page).length, 1);
    assert.equal(collector.getData(page)[0], navRequest);

    page.emit('request', navRequest2);
    assert.equal(collector.getData(page).length, 2);
    assert.equal(collector.getData(page)[0], navRequest);
    assert.equal(collector.getData(page)[1], navRequest2);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page).length, 1);
    assert.equal(collector.getData(page)[0], navRequest2);

    page.emit('request', request);
    assert.equal(collector.getData(page).length, 2);
  });

  it('works with previous navigations', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    const mainFrame = page.mainFrame();
    const navRequest = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const navRequest2 = getMockRequest({
      navigationRequest: true,
      frame: page.mainFrame(),
    });
    const request = getMockRequest();

    const collector = new NetworkCollector(browser);
    await collector.init([page]);
    page.emit('request', navRequest);
    assert.equal(collector.getData(page, true).length, 1);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page, true).length, 1);

    page.emit('request', navRequest2);
    assert.equal(collector.getData(page, true).length, 2);

    page.emit('framenavigated', mainFrame);
    assert.equal(collector.getData(page, true).length, 2);

    page.emit('request', request);
    assert.equal(collector.getData(page, true).length, 3);
  });

  it('works with extra headers', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    
    let setExtraHTTPHeadersCalled = 0;
    let setExtraHTTPHeadersArgs = null;
    
    page.setExtraHTTPHeaders = async (headers) => {
      setExtraHTTPHeadersCalled++;
      setExtraHTTPHeadersArgs = headers;
      return Promise.resolve();
    };

    const collector = new NetworkCollector(browser, collect => {
      return {
        request: req => {
          collect(req);
        },
      } as ListenerMap;
    }, {
      headers: {
        "x-env": "test_mcp",
        "x-user": "mock_user"
      }
    });
    
    await collector.init([page]);
    
    assert.equal(setExtraHTTPHeadersCalled > 0, true, 'page.setExtraHTTPHeaders should be called');
    assert.deepEqual(setExtraHTTPHeadersArgs, {
      "x-env": "test_mcp",
      "x-user": "mock_user"
    }, 'should set extra headers');
  });
});

describe('ConsoleCollector', () => {
  let issue: Protocol.Audits.InspectorIssue;

  beforeEach(() => {
    issue = {
      code: 'MixedContentIssue',
      details: {
        mixedContentIssueDetails: {
          insecureURL: 'test.url',
          resolutionStatus: 'MixedContentBlocked',
          mainResourceURL: '',
        },
      },
    };
  });

  it('emits issues on page', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    // @ts-expect-error internal API.
    const cdpSession = page._client();
    const onIssuesListener = sinon.spy();

    page.on('issue', onIssuesListener);

    const collector = new ConsoleCollector(browser, collect => {
      return {
        issue: issue => {
          collect(issue as DevTools.AggregatedIssue);
        },
      } as ListenerMap;
    });
    await collector.init([page]);
    cdpSession.emit('Audits.issueAdded', {issue});
    sinon.assert.calledOnce(onIssuesListener);

    const issueArgument = onIssuesListener.getCall(0).args[0];
    assert(issueArgument instanceof DevTools.AggregatedIssue);
  });

  it('collects issues', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    // @ts-expect-error internal API.
    const cdpSession = page._client();

    const collector = new ConsoleCollector(browser, collect => {
      return {
        issue: issue => {
          collect(issue as DevTools.AggregatedIssue);
        },
      } as ListenerMap;
    });
    await collector.init([page]);

    const issue2 = {
      code: 'ElementAccessibilityIssue' as const,
      details: {
        elementAccessibilityIssueDetails: {
          nodeId: 1,
          elementAccessibilityIssueReason: 'DisallowedSelectChild',
          hasDisallowedAttributes: true,
        },
      },
    } satisfies Protocol.Audits.InspectorIssue;

    cdpSession.emit('Audits.issueAdded', {issue});
    cdpSession.emit('Audits.issueAdded', {issue: issue2});
    const data = collector.getData(page);
    assert.equal(data.length, 2);
  });

  it('filters duplicated issues', async () => {
    const browser = getMockBrowser();
    const page = (await browser.pages())[0];
    // @ts-expect-error internal API.
    const cdpSession = page._client();

    const collector = new ConsoleCollector(browser, collect => {
      return {
        issue: issue => {
          collect(issue as DevTools.AggregatedIssue);
        },
      } as ListenerMap;
    });
    await collector.init([page]);

    cdpSession.emit('Audits.issueAdded', {issue});
    cdpSession.emit('Audits.issueAdded', {issue});
    const data = collector.getData(page);
    assert.equal(data.length, 1);
    const collectedIssue = data[0];
    assert(collectedIssue instanceof DevTools.AggregatedIssue);
    assert.equal(collectedIssue.code(), 'MixedContentIssue');
    assert.equal(collectedIssue.getAggregatedIssuesCount(), 1);
  });
});
