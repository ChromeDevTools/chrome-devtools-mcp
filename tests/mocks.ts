/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sinon-based mock factories for McpPage, McpContext, McpResponse and
 * the underlying Puppeteer Page.
 *
 * Uses sinon.createStubInstance() so all methods are automatically stubbed
 * from the real class prototype — no hand-rolled interface definitions needed.
 *
 * Usage example:
 *
 *   const page = createMockMcpPage();
 *   const context = createMockMcpContext({selectedPage: page});
 *   const response = createMockMcpResponse();
 *
 *   await myTool.handler({params: {networkConditions: 'Slow 3G'}, page}, response, context);
 *
 *   sinon.assert.calledOnceWithExactly(page.emulate, {networkConditions: 'Slow 3G'});
 */

import type {Frame} from 'puppeteer-core';
import sinon from 'sinon';

import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {McpResponse} from '../src/McpResponse.js';
import {
  CdpExtension,
  CdpFrame,
  CdpPage,
  DevTools,
} from '../src/third_party/index.js';
import type {
  Extension,
  Page,
  Result,
  RunnerResult,
} from '../src/third_party/index.js';

export type MockMcpPage = sinon.SinonStubbedInstance<McpPage> & {
  pptrPage: sinon.SinonStubbedInstance<Page>;
};
export type MockMcpContext = sinon.SinonStubbedInstance<McpContext>;
export type MockMcpResponse = sinon.SinonStubbedInstance<McpResponse>;
export type MockDOMNode = sinon.SinonStubbedInstance<DevTools.DOMModel.DOMNode>;
export type MockCSSProperty =
  sinon.SinonStubbedInstance<DevTools.CSSProperty.CSSProperty>;
export type MockCSSStyleDeclaration =
  sinon.SinonStubbedInstance<DevTools.CSSStyleDeclaration.CSSStyleDeclaration>;
export type MockCSSMatchedStyles =
  sinon.SinonStubbedInstance<DevTools.CSSMatchedStyles.CSSMatchedStyles>;
export type MockCSSStyleRule =
  sinon.SinonStubbedInstance<DevTools.CSSRule.CSSStyleRule>;
export type MockCSSKeyframesRule =
  sinon.SinonStubbedInstance<DevTools.CSSRule.CSSKeyframesRule>;
export type MockCSSAtRule =
  sinon.SinonStubbedInstance<DevTools.CSSRule.CSSAtRule>;
export type MockCSSPositionTryRule =
  sinon.SinonStubbedInstance<DevTools.CSSRule.CSSPositionTryRule>;
export type MockCSSRegisteredProperty =
  sinon.SinonStubbedInstance<DevTools.CSSMatchedStyles.CSSRegisteredProperty>;
export type MockCSSFunctionRule =
  sinon.SinonStubbedInstance<DevTools.CSSRule.CSSFunctionRule>;

/**
 * A minimal event emitter used to back mocked `on`/`off`/`emit` methods on
 * Puppeteer objects (Page, CDPSession, Browser) so tests can trigger events
 * synchronously without a real browser.
 */
export function mockListener() {
  const listeners: Record<
    string | symbol | number,
    Array<(data: unknown) => void>
  > = {};
  return {
    on(eventName: string | symbol | number, listener: (data: unknown) => void) {
      const arr = listeners[eventName];
      if (arr) {
        arr.push(listener);
      } else {
        listeners[eventName] = [listener];
      }
    },
    off(
      eventName: string | symbol | number,
      listener?: (data: unknown) => void,
    ) {
      const arr = listeners[eventName];
      if (!arr) {
        return;
      }
      if (!listener) {
        delete listeners[eventName];
        return;
      }
      listeners[eventName] = arr.filter(entry => entry !== listener);
    },
    emit(eventName: string | symbol | number, data?: unknown) {
      for (const listener of listeners[eventName] ?? []) {
        listener(data);
      }
    },
  };
}

export function createMockPuppeteerPage(): sinon.SinonStubbedInstance<Page> {
  const page = sinon.createStubInstance(
    CdpPage,
  ) as unknown as sinon.SinonStubbedInstance<Page>;

  // mainFrame() must return a stable object so tests can pass it back into
  // page.emit('framenavigated', mainFrame) and have it recognized as the
  // same frame instance across calls. It needs real on/off/emit so the
  // PageCollector can subscribe to FrameNavigatedWithinDocument and tests
  // can trigger it.
  const mainFrameStub = sinon.createStubInstance(CdpFrame);
  const mainFrameListener = mockListener();
  mainFrameStub.on.callsFake((eventName, handler) => {
    mainFrameListener.on(eventName, handler);
    return mainFrameStub;
  });
  mainFrameStub.off.callsFake((eventName, handler) => {
    mainFrameListener.off(eventName, handler);
    return mainFrameStub;
  });
  mainFrameStub.emit.callsFake((eventName, data) => {
    mainFrameListener.emit(eventName, data);
    return true;
  });
  // SinonStubbedInstance<CdpFrame> is not assignable to Frame due to private fields.
  page.mainFrame.returns(mainFrameStub as unknown as Frame);

  // _client() is a private internal Puppeteer API used by ConsoleCollector
  // in the McpPage constructor. Not on the CdpPage prototype, so added
  // explicitly. It needs real on/off/emit behavior so tests can trigger CDP
  // events directly via cdpSession.emit(...).
  const cdpListener = mockListener();
  const cdpSession = {
    on: sinon.stub().callsFake(cdpListener.on),
    off: sinon.stub().callsFake(cdpListener.off),
    send: sinon.stub().resolves({}),
    target: sinon.stub().returns({_targetId: '<mock>'}),
    emit: cdpListener.emit,
  };
  // @ts-expect-error internal API
  page._client = sinon.stub().returns(cdpSession);

  return page;
}

export function createMockMcpPage(
  options: {pptrPage?: sinon.SinonStubbedInstance<Page>} = {},
): MockMcpPage {
  const page = sinon.createStubInstance(McpPage);
  const pptrPage = options.pptrPage ?? createMockPuppeteerPage();
  return Object.assign(page, {pptrPage});
}

export function createMockMcpContext(
  options: {selectedPage?: MockMcpPage} = {},
): MockMcpContext {
  const context = sinon.createStubInstance(McpContext);
  const page = options.selectedPage ?? createMockMcpPage();
  context.getSelectedMcpPage.returns(page satisfies McpPage);

  return context;
}

export function createMockMcpResponse(): MockMcpResponse {
  return sinon.createStubInstance(McpResponse);
}

/**
 * Convenience helper — creates a mock page, context and response in one call.
 *
 *   const {page, context, response} = createHandlerMocks();
 */
export function createHandlerMocks(): {
  page: MockMcpPage;
  context: MockMcpContext;
  response: MockMcpResponse;
} {
  const page = createMockMcpPage();
  const context = createMockMcpContext({selectedPage: page});
  const response = createMockMcpResponse();
  return {page, context, response};
}

export function createMockRunnerResult(): RunnerResult {
  const lhr = {
    mainDocumentUrl: 'http://localhost',
    categories: {},
    audits: {},
    timing: {total: 0},
  };
  return {
    lhr: lhr as unknown as Result,
    report: '',
    artifacts: {} as unknown as RunnerResult['artifacts'],
  };
}

type RuleOrigin = 'regular' | 'user-agent' | 'injected' | 'inspector';

function isBackendNodeId(
  id: unknown,
): id is DevTools.Protocol.DOM.BackendNodeId {
  return typeof id === 'number';
}

export interface MockDOMNodeOptions {
  selector?: string;
  backendNodeId?: number;
}

export function createMockDOMNode(
  options: MockDOMNodeOptions = {},
): MockDOMNode {
  const node = sinon.createStubInstance(DevTools.DOMModel.DOMNode);
  const selector = options.selector ?? 'button';
  const backendNodeId = options.backendNodeId ?? 1;
  if (isBackendNodeId(backendNodeId)) {
    node.backendNodeId.returns(backendNodeId);
  }
  node.simpleSelector.returns(selector);
  node.nodeNameInCorrectCase.returns(selector.split(/[#.]/)[0] || selector);
  return node;
}

export interface MockCSSPropertyOptions {
  important?: boolean;
  parsedOk?: boolean;
  disabled?: boolean;
}

export function createMockCSSProperty(
  name: string,
  value: string,
  options: MockCSSPropertyOptions = {},
): MockCSSProperty {
  const prop = sinon.createStubInstance(DevTools.CSSProperty.CSSProperty);
  prop.name = name;
  prop.value = value;
  prop.important = options.important ?? false;
  prop.parsedOk = options.parsedOk ?? true;
  prop.disabled = options.disabled ?? false;
  return prop;
}

export interface MockCSSStyleDeclarationOptions {
  rule?: DevTools.CSSRule.CSSRule | null;
  type?: DevTools.CSSStyleDeclaration.Type;
  animationName?: string;
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export function createMockCSSStyleDeclaration(
  properties: DevTools.CSSProperty.CSSProperty[],
  options: MockCSSStyleDeclarationOptions = {},
): MockCSSStyleDeclaration {
  const style = sinon.createStubInstance(
    DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
  );
  style.type = options.type ?? DevTools.CSSStyleDeclaration.Type.Regular;
  style.allProperties.returns(properties);
  style.leadingProperties.returns(properties);
  style.parentRule = options.rule ?? null;
  style.animationName.returns(options.animationName ?? '');
  if (options.range) {
    Object.assign(style, {range: options.range});
  }
  return style;
}

export function createMockCSSInlineStyle(
  properties: DevTools.CSSProperty.CSSProperty[],
): MockCSSStyleDeclaration {
  return createMockCSSStyleDeclaration(properties, {
    type: DevTools.CSSStyleDeclaration.Type.Inline,
  });
}

export interface MockRuleOptions {
  sourceURL?: string;
  lineNumber?: number;
  columnNumber?: number;
  origin?: RuleOrigin;
  isConstructed?: boolean;
  nestingSelectors?: string[];
  selectors?: Array<{text: string}>;
  layers?: Array<{text?: string}>;
  media?: Array<{text: string}>;
  containerQueries?: Array<{
    text?: string;
    name?: string;
    getContainerForNode?: (nodeId: number) => Promise<unknown>;
  }>;
  scopes?: Array<{text: string}>;
  supports?: Array<{text: string}>;
  startingStyles?: unknown[];
  navigations?: Array<{text?: string}>;
  ruleTypes?: DevTools.Protocol.CSS.CSSRuleType[];
}

export function synthesizeRuleTypes(
  options: MockRuleOptions,
): DevTools.Protocol.CSS.CSSRuleType[] | undefined {
  if (options.ruleTypes !== undefined) {
    return options.ruleTypes;
  }
  const ruleTypes: DevTools.Protocol.CSS.CSSRuleType[] = [];
  const mappings: Array<
    [unknown[] | undefined, DevTools.Protocol.CSS.CSSRuleType]
  > = [
    [options.navigations, DevTools.Protocol.CSS.CSSRuleType.NavigationRule],
    [options.nestingSelectors, DevTools.Protocol.CSS.CSSRuleType.StyleRule],
    [
      options.startingStyles,
      DevTools.Protocol.CSS.CSSRuleType.StartingStyleRule,
    ],
    [options.scopes, DevTools.Protocol.CSS.CSSRuleType.ScopeRule],
    [options.supports, DevTools.Protocol.CSS.CSSRuleType.SupportsRule],
    [options.containerQueries, DevTools.Protocol.CSS.CSSRuleType.ContainerRule],
    [options.media, DevTools.Protocol.CSS.CSSRuleType.MediaRule],
    [options.layers, DevTools.Protocol.CSS.CSSRuleType.LayerRule],
  ];
  for (const [items, ruleType] of mappings) {
    if (items) {
      for (const _ of items) {
        ruleTypes.push(ruleType);
      }
    }
  }
  return ruleTypes.length > 0 ? ruleTypes : undefined;
}

export function attachRuleMeta(
  rule: sinon.SinonStubbedInstance<DevTools.CSSRule.CSSRule>,
  sourceURL?: string,
  origin: RuleOrigin = 'regular',
  isConstructed = false,
): void {
  rule.isUserAgent.returns(origin === 'user-agent');
  rule.isInjected.returns(origin === 'injected');
  rule.isViaInspector.returns(origin === 'inspector');
  if (sourceURL || isConstructed) {
    const header = {
      sourceURL: sourceURL ?? '',
      lineNumberInSource: (line: number) => line,
      columnNumberInSource: (_line: number, col: number) => col,
      isConstructedByNew: () => isConstructed,
    };
    Object.assign(rule, {header});
  }
  Object.defineProperty(rule, 'sourceURL', {
    value: sourceURL,
    writable: true,
    configurable: true,
  });
}

function createCSSValue(text: string) {
  return {
    text,
    rebase() {
      // no-op
    },
  };
}

export function createMockCSSStyleRule(
  selector: string,
  options: MockRuleOptions = {},
): MockCSSStyleRule {
  const rule = sinon.createStubInstance(DevTools.CSSRule.CSSStyleRule);
  attachRuleMeta(
    rule,
    options.sourceURL,
    options.origin,
    options.isConstructed ?? false,
  );
  rule.selectorText.returns(selector);
  rule.lineNumberInSource.returns(options.lineNumber ?? -1);
  rule.columnNumberInSource.returns(options.columnNumber);
  const selectors = options.selectors
    ? options.selectors.map(s => ({...createCSSValue(s.text), ...s}))
    : [createCSSValue(selector)];
  Object.assign(rule, {
    selectors,
    nestingSelectors: options.nestingSelectors,
    layers: options.layers,
    media: options.media,
    containerQueries: options.containerQueries,
    scopes: options.scopes,
    supports: options.supports,
    startingStyles: options.startingStyles,
    navigations: options.navigations,
    ruleTypes: synthesizeRuleTypes(options),
  });
  return rule;
}

export function createMockCSSKeyframesRule(
  name: string,
  keyframes: Array<{
    key: string;
    properties: DevTools.CSSProperty.CSSProperty[];
    sourceURL?: string;
    range?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  }>,
): MockCSSKeyframesRule {
  const rule = sinon.createStubInstance(DevTools.CSSRule.CSSKeyframesRule);
  const mockKeyframes = [];
  for (const kf of keyframes) {
    const kfMock = sinon.createStubInstance(DevTools.CSSRule.CSSKeyframeRule);
    attachRuleMeta(kfMock, kf.sourceURL);
    const style = createMockCSSStyleDeclaration(kf.properties, {
      rule: kfMock,
      range: kf.range,
    });
    kfMock.key.returns(createCSSValue(kf.key));
    Object.assign(kfMock, {style});
    mockKeyframes.push(kfMock);
  }
  rule.name.returns(createCSSValue(name));
  rule.keyframes.returns(mockKeyframes);
  return rule;
}

export function createMockCSSAtRule(
  type: string,
  options: {
    name?: string;
    subsection?: string;
    properties: DevTools.CSSProperty.CSSProperty[];
    sourceURL?: string;
    origin?: RuleOrigin;
    range?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  },
): MockCSSAtRule {
  const rule = sinon.createStubInstance(DevTools.CSSRule.CSSAtRule);
  attachRuleMeta(rule, options.sourceURL, options.origin);
  const style = createMockCSSStyleDeclaration(options.properties, {
    rule,
    range: options.range,
  });
  rule.type.returns(type);
  rule.name.returns(options.name ? createCSSValue(options.name) : null);
  rule.subsection.returns(options.subsection ?? null);
  Object.assign(rule, {style});
  return rule;
}

export function createMockCSSPositionTryRule(
  name: string,
  options: {
    active?: boolean;
    properties: DevTools.CSSProperty.CSSProperty[];
    sourceURL?: string;
    range?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  },
): MockCSSPositionTryRule {
  const rule = sinon.createStubInstance(DevTools.CSSRule.CSSPositionTryRule);
  attachRuleMeta(rule, options.sourceURL);
  const style = createMockCSSStyleDeclaration(options.properties, {
    rule,
    range: options.range,
  });
  rule.name.returns(createCSSValue(name));
  rule.active.returns(options.active ?? false);
  Object.assign(rule, {style});
  return rule;
}

export function createMockCSSRegisteredProperty(
  name: string,
  options: {
    syntax?: string;
    inherits?: boolean;
    initialValue?: string;
    sourceURL?: string;
    range?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
    isProgrammatic?: boolean;
  } = {},
): MockCSSRegisteredProperty {
  const properties = [
    createMockCSSProperty('syntax', options.syntax ?? '"*"'),
    createMockCSSProperty('inherits', String(options.inherits ?? false)),
  ];
  if (options.initialValue) {
    properties.push(
      createMockCSSProperty('initial-value', options.initialValue),
    );
  }

  let parentRule: sinon.SinonStubbedInstance<DevTools.CSSRule.CSSPropertyRule> | null =
    null;
  if (!options.isProgrammatic) {
    const mockRule = sinon.createStubInstance(DevTools.CSSRule.CSSPropertyRule);
    attachRuleMeta(mockRule, options.sourceURL);
    mockRule.propertyName.returns(createCSSValue(name));
    parentRule = mockRule;
  }

  const style = createMockCSSStyleDeclaration(properties, {
    rule: parentRule,
    range: options.range,
  });
  if (parentRule) {
    Object.assign(parentRule, {style});
  }

  const prop = sinon.createStubInstance(
    DevTools.CSSMatchedStyles.CSSRegisteredProperty,
  );
  prop.propertyName.returns(name);
  prop.inherits.returns(options.inherits ?? false);
  prop.syntax.returns(options.syntax ?? '"*"');
  prop.initialValue.returns(options.initialValue ?? null);
  prop.style.returns(style);
  return prop;
}

export function createMockCSSFunctionRule(
  nameWithParams: string,
  options: {
    functionName?: string;
    properties: DevTools.CSSProperty.CSSProperty[];
    sourceURL?: string;
    range?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  },
): MockCSSFunctionRule {
  const rule = sinon.createStubInstance(DevTools.CSSRule.CSSFunctionRule);
  attachRuleMeta(rule, options.sourceURL);
  const style = createMockCSSStyleDeclaration(options.properties, {
    rule,
    range: options.range,
  });
  const baseName =
    options.functionName ?? nameWithParams.split('(')[0] ?? nameWithParams;
  rule.functionName.returns(createCSSValue(baseName));
  rule.nameWithParameters.returns(nameWithParams);
  Object.assign(rule, {style});
  return rule;
}

export interface MockCSSMatchedStylesParams {
  node?: string | DevTools.DOMModel.DOMNode;
  nodeStyles?: DevTools.CSSStyleDeclaration.CSSStyleDeclaration[];
  inheritedStyles?: DevTools.CSSStyleDeclaration.CSSStyleDeclaration[];
  keyframes?: DevTools.CSSRule.CSSKeyframesRule[];
  atRules?: DevTools.CSSRule.CSSAtRule[];
  positionTryRules?: DevTools.CSSRule.CSSPositionTryRule[];
  registeredProperties?: DevTools.CSSMatchedStyles.CSSRegisteredProperty[];
  functionRules?: DevTools.CSSRule.CSSFunctionRule[];
  parentNode?: string | DevTools.DOMModel.DOMNode;
  nodeForStyleMap?: Map<
    DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
    DevTools.DOMModel.DOMNode
  >;
  pseudoStyles?: Map<
    DevTools.Protocol.DOM.PseudoType,
    DevTools.CSSStyleDeclaration.CSSStyleDeclaration[]
  >;
  customHighlights?: Map<
    string,
    DevTools.CSSStyleDeclaration.CSSStyleDeclaration[]
  >;
  propertyStates?: Map<DevTools.CSSProperty.CSSProperty, string>;
  matchingSelectorsMap?: Map<unknown, number[]>;
}

export function createMockCSSMatchedStyles(
  params: MockCSSMatchedStylesParams = {},
): MockCSSMatchedStyles {
  const mockNode =
    typeof params.node === 'string'
      ? createMockDOMNode({selector: params.node})
      : (params.node ?? createMockDOMNode());

  const inheritedStyles = params.inheritedStyles ?? [];
  const nodeStyles = params.nodeStyles
    ? [...params.nodeStyles, ...inheritedStyles]
    : inheritedStyles;

  const defaultParentNode =
    typeof params.parentNode === 'string'
      ? createMockDOMNode({selector: params.parentNode})
      : params.parentNode;
  const nodeForStyleMap = params.nodeForStyleMap ?? new Map();

  const pseudoStylesMap = params.pseudoStyles ?? new Map();
  const pseudoTypes = new Set(pseudoStylesMap.keys());
  const customHighlights = params.customHighlights ?? new Map();

  const propertyStates = params.propertyStates ?? new Map();

  const mock = sinon.createStubInstance(
    DevTools.CSSMatchedStyles.CSSMatchedStyles,
  );
  mock.node.returns(mockNode);
  mock.nodeStyles.returns(nodeStyles);
  mock.inheritedStyles.returns(inheritedStyles);
  mock.keyframes.returns(params.keyframes ?? []);
  mock.atRules.returns(params.atRules ?? []);
  mock.positionTryRules.returns(params.positionTryRules ?? []);
  mock.registeredProperties.returns(params.registeredProperties ?? []);
  mock.functionRules.returns(params.functionRules ?? []);
  mock.pseudoTypes.returns(pseudoTypes);
  mock.customHighlightPseudoNames.returns(new Set(customHighlights.keys()));

  mock.nodeForStyle.callsFake(
    style => nodeForStyleMap.get(style) ?? defaultParentNode ?? null,
  );
  mock.isInherited.callsFake(style =>
    Boolean(inheritedStyles.find(inheritedStyle => inheritedStyle === style)),
  );
  mock.pseudoStyles.callsFake(type => pseudoStylesMap.get(type) ?? []);
  mock.customHighlightPseudoStyles.callsFake(
    name => customHighlights.get(name) ?? [],
  );
  mock.propertyState.callsFake(prop => propertyStates.get(prop) ?? 'Active');
  mock.getMatchingSelectors.callsFake(
    rule => params.matchingSelectorsMap?.get(rule) ?? [],
  );

  return mock;
}

export function createMockExtension(
  options: {
    id?: string;
    path?: string;
    name?: string;
    version?: string;
    enabled?: boolean;
  } = {},
): Extension {
  const extension = sinon.createStubInstance(CdpExtension);
  sinon.stub(extension, 'id').value(options.id ?? 'mock-extension-id');
  sinon
    .stub(extension, 'path')
    .value(options.path ?? '/path/to/mock/extension');
  sinon.stub(extension, 'name').value(options.name ?? 'Mock Extension');
  sinon.stub(extension, 'version').value(options.version ?? '1.0.0');
  sinon.stub(extension, 'enabled').value(options.enabled ?? true);
  return extension as unknown as Extension;
}
