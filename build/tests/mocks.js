/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon';
import { ConfigParser, } from '../src/config/ConfigParser.js';
import { McpContext } from '../src/McpContext.js';
import { McpPage } from '../src/McpPage.js';
import { McpResponse } from '../src/McpResponse.js';
import { McpWorker } from '../src/McpWorker.js';
import { CdpBrowser, CdpExtension, CdpFrame, CdpPage, DevTools, Dialog, ElementHandle, Locator, Target, TargetType, Tracing, WebWorker, WebMCP, WebMCPTool, } from '../src/third_party/index.js';
/**
 * A minimal event emitter used to back mocked `on`/`off`/`emit` methods on
 * Puppeteer objects (Page, CDPSession, Browser) so tests can trigger events
 * synchronously without a real browser.
 */
export function mockListener() {
    const listeners = {};
    return {
        on(eventName, listener) {
            const arr = listeners[eventName];
            if (arr) {
                arr.push(listener);
            }
            else {
                listeners[eventName] = [listener];
            }
        },
        off(eventName, listener) {
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
        emit(eventName, data) {
            for (const listener of listeners[eventName] ?? []) {
                listener(data);
            }
        },
        listenerCount(eventName) {
            return listeners[eventName]?.length ?? 0;
        },
    };
}
export function createMockPuppeteerBrowser() {
    const browser = sinon.createStubInstance(CdpBrowser);
    sinon.stub(browser, 'connected').get(() => true);
    browser.close.resolves();
    browser.disconnect.resolves();
    browser.pages.resolves([]);
    browser.process.returns(null);
    const browserListener = mockListener();
    browser.on.callsFake((eventName, handler) => {
        browserListener.on(eventName, handler);
        return browser;
    });
    browser.off.callsFake((eventName, handler) => {
        browserListener.off(eventName, handler);
        return browser;
    });
    browser.once.callsFake((eventName, handler) => {
        const onceHandler = (data) => {
            browserListener.off(eventName, onceHandler);
            handler(data);
        };
        browserListener.on(eventName, onceHandler);
        return browser;
    });
    browser.emit.callsFake((eventName, data) => {
        browserListener.emit(eventName, data);
        return true;
    });
    return browser;
}
export function createMockPuppeteerPage() {
    const page = sinon.createStubInstance(CdpPage);
    const pageListener = mockListener();
    page.listenerCount.callsFake(pageListener.listenerCount);
    page.on.callsFake((eventName, handler) => {
        pageListener.on(eventName, handler);
        return page;
    });
    page.off.callsFake((eventName, handler) => {
        pageListener.off(eventName, handler);
        return page;
    });
    page.emit.callsFake((eventName, data) => {
        pageListener.emit(eventName, data);
        return true;
    });
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
    page.mainFrame.returns(mainFrameStub);
    // _client() is a private internal Puppeteer API used by ConsoleCollector
    // in the McpPage constructor. Not on the CdpPage prototype, so added
    // explicitly. It needs real on/off/emit behavior so tests can trigger CDP
    // events directly via cdpSession.emit(...).
    const cdpListener = mockListener();
    const cdpSession = {
        on: sinon.stub().callsFake(cdpListener.on),
        off: sinon.stub().callsFake(cdpListener.off),
        send: sinon.stub().resolves({}),
        target: sinon.stub().returns({ _targetId: '<mock>' }),
        emit: cdpListener.emit,
    };
    // @ts-expect-error internal API
    page._client = sinon.stub().returns(cdpSession);
    const webmcp = sinon.createStubInstance(WebMCP);
    webmcp.tools.returns([]);
    Object.defineProperty(page, 'webmcp', {
        value: webmcp,
        writable: true,
        configurable: true,
    });
    // The real `tracing` getter reads a private field, which throws on a stub
    // instance, so it is replaced with a stubbed Tracing instance.
    const tracing = sinon.createStubInstance(Tracing);
    Object.defineProperty(page, 'tracing', {
        value: tracing,
        writable: true,
        configurable: true,
    });
    page.evaluateHandle.resolves(createMockElementHandle().handle);
    return Object.assign(page, { webmcp });
}
export function createMockWebMCPTool(options) {
    const tool = sinon.createStubInstance(WebMCPTool);
    tool.name = options.name;
    tool.description = options.description ?? '';
    tool.inputSchema = options.inputSchema;
    tool.annotations = options.annotations;
    return tool;
}
export class MockTarget extends Target {
    asPage() {
        throw new Error('Not implemented');
    }
    url() {
        return '';
    }
    createCDPSession() {
        throw new Error('Not implemented');
    }
    type() {
        return TargetType.PAGE;
    }
    browser() {
        throw new Error('Not implemented');
    }
    browserContext() {
        throw new Error('Not implemented');
    }
    opener() {
        return undefined;
    }
    _getTargetInfo() {
        throw new Error('Not implemented');
    }
}
export function createMockPuppeteerTarget(options = {}) {
    const target = sinon.createStubInstance(MockTarget);
    const page = options.page ?? createMockPuppeteerPage();
    page.target.returns(target);
    target.page.resolves(page);
    target.asPage.resolves(page);
    target.url.returns(options.url ?? 'https://example.com');
    target._getTargetInfo.returns({
        targetId: '<mock-target-id>',
        type: 'page',
        title: options.title ?? '',
        url: options.url ?? 'https://example.com',
        attached: true,
        canAccessOpener: false,
    });
    return target;
}
export function createMockMcpPage(options = {}) {
    const page = sinon.createStubInstance(McpPage);
    page.emulationSettings = {};
    const pptrPage = options.pptrPage ?? createMockPuppeteerPage();
    const target = options.target ?? createMockPuppeteerTarget({ page: pptrPage });
    page.init.resolves();
    page.close.callsFake(async () => {
        await pptrPage.close({ runBeforeUnload: false });
    });
    page.url.callsFake(() => pptrPage.url());
    page.getTitle.returns('');
    page.isClosed.callsFake(() => Boolean(pptrPage.isClosed()));
    page.waitForEventsAfterAction.callsFake(async (action) => {
        await action(new AbortController().signal);
        return {};
    });
    page.getWebMcpTools.returns([]);
    Object.defineProperty(page, 'pptrPage', {
        value: pptrPage,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(page, 'target', {
        value: target,
        writable: true,
        configurable: true,
    });
    return Object.assign(page, { pptrPage, target });
}
export function createMockDialog(options = {}) {
    const dialog = sinon.createStubInstance(Dialog);
    dialog.type.returns(options.type ?? 'alert');
    dialog.message.returns(options.message ?? '');
    return dialog;
}
export function createMockElementHandle() {
    const handle = sinon.createStubInstance(ElementHandle);
    handle.remoteObject.returns({ type: 'object', objectId: '<mock-object-id>' });
    handle.dispose.resolves();
    const locator = sinon.createStubInstance(Locator);
    locator.setTimeout.returns(locator);
    handle.asLocator.returns(locator);
    return { handle, locator };
}
export function createMockTarget() {
    return createMockPuppeteerTarget();
}
// Concrete subclass of Puppeteer's abstract WebWorker so sinon.createStubInstance
// can stub it without an `as unknown as` cast, mirroring MockTarget above.
class MockWebWorker extends WebWorker {
    mainRealm() {
        throw new Error('Not implemented');
    }
    get client() {
        throw new Error('Not implemented');
    }
}
export function createMockWebWorker() {
    return sinon.createStubInstance(MockWebWorker);
}
export function createMockMcpWorker(options = {}) {
    // A real McpWorker over a stubbed Target, so `url`/`worker()` resolve through
    // the same code paths as in production rather than through stubbed getters.
    const target = createMockTarget();
    target.url.returns(options.url ?? 'chrome-extension://mock-extension-id/sw.js');
    target.worker.resolves(options.worker ?? null);
    return new McpWorker(options.id ?? 'sw-1', options.type ?? 'service_worker', target);
}
export function createMockMcpContext(options = {}) {
    const context = sinon.createStubInstance(McpContext);
    const page = options.selectedPage ?? createMockMcpPage();
    context.getSelectedMcpPage.returns(page);
    context.getTargetInfos.resolves(new Map());
    return context;
}
export function createMockMcpResponse() {
    return sinon.createStubInstance(McpResponse);
}
/**
 * Convenience helper — creates a mock page, context and response in one call.
 *
 *   const {page, context, response} = createHandlerMocks();
 */
export function createHandlerMocks(options = {}) {
    const page = createMockMcpPage();
    const context = createMockMcpContext({ selectedPage: page });
    const response = createMockMcpResponse();
    const args = createMockParsedArguments(options);
    return { page, context, response, args };
}
export function createMockRunnerResult(lhrOverrides = {}) {
    const lhr = {
        finalDisplayedUrl: 'http://localhost',
        mainDocumentUrl: 'http://localhost',
        categories: {},
        audits: {},
        timing: { total: 0 },
        ...lhrOverrides,
    };
    return {
        lhr: lhr,
        report: '',
        artifacts: {},
    };
}
function isBackendNodeId(id) {
    return typeof id === 'number';
}
export function createMockDOMNode(options = {}) {
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
export function createMockCSSProperty(name, value, options = {}) {
    const prop = sinon.createStubInstance(DevTools.CSSProperty.CSSProperty);
    prop.name = name;
    prop.value = value;
    prop.important = options.important ?? false;
    prop.parsedOk = options.parsedOk ?? true;
    prop.disabled = options.disabled ?? false;
    return prop;
}
export function createMockCSSStyleDeclaration(properties, options = {}) {
    const style = sinon.createStubInstance(DevTools.CSSStyleDeclaration.CSSStyleDeclaration);
    style.type = options.type ?? DevTools.CSSStyleDeclaration.Type.Regular;
    style.allProperties.returns(properties);
    style.leadingProperties.returns(properties);
    style.parentRule = options.rule ?? null;
    style.animationName.returns(options.animationName ?? '');
    if (options.range) {
        Object.assign(style, { range: options.range });
    }
    return style;
}
export function createMockCSSInlineStyle(properties) {
    return createMockCSSStyleDeclaration(properties, {
        type: DevTools.CSSStyleDeclaration.Type.Inline,
    });
}
export function synthesizeRuleTypes(options) {
    if (options.ruleTypes !== undefined) {
        return options.ruleTypes;
    }
    const ruleTypes = [];
    const mappings = [
        [options.navigations, "NavigationRule" /* DevTools.Protocol.CSS.CSSRuleType.NavigationRule */],
        [options.nestingSelectors, "StyleRule" /* DevTools.Protocol.CSS.CSSRuleType.StyleRule */],
        [
            options.startingStyles,
            "StartingStyleRule" /* DevTools.Protocol.CSS.CSSRuleType.StartingStyleRule */,
        ],
        [options.scopes, "ScopeRule" /* DevTools.Protocol.CSS.CSSRuleType.ScopeRule */],
        [options.supports, "SupportsRule" /* DevTools.Protocol.CSS.CSSRuleType.SupportsRule */],
        [options.containerQueries, "ContainerRule" /* DevTools.Protocol.CSS.CSSRuleType.ContainerRule */],
        [options.media, "MediaRule" /* DevTools.Protocol.CSS.CSSRuleType.MediaRule */],
        [options.layers, "LayerRule" /* DevTools.Protocol.CSS.CSSRuleType.LayerRule */],
    ];
    for (const [items, ruleType] of mappings) {
        if (items) {
            for (let i = 0; i < items.length; i++) {
                ruleTypes.push(ruleType);
            }
        }
    }
    return ruleTypes.length > 0 ? ruleTypes : undefined;
}
export function attachRuleMeta(rule, sourceURL, origin = 'regular', isConstructed = false) {
    rule.isUserAgent.returns(origin === 'user-agent');
    rule.isInjected.returns(origin === 'injected');
    rule.isViaInspector.returns(origin === 'inspector');
    if (sourceURL || isConstructed) {
        const header = {
            sourceURL: sourceURL ?? '',
            lineNumberInSource: (line) => line,
            columnNumberInSource: (_line, col) => col,
            isConstructedByNew: () => isConstructed,
        };
        Object.assign(rule, { header });
    }
    Object.defineProperty(rule, 'sourceURL', {
        value: sourceURL,
        writable: true,
        configurable: true,
    });
}
function createCSSValue(text) {
    return {
        text,
        rebase() {
            // no-op
        },
    };
}
export function createMockCSSStyleRule(selector, options = {}) {
    const rule = sinon.createStubInstance(DevTools.CSSRule.CSSStyleRule);
    attachRuleMeta(rule, options.sourceURL, options.origin, options.isConstructed ?? false);
    rule.selectorText.returns(selector);
    rule.lineNumberInSource.returns(options.lineNumber ?? -1);
    rule.columnNumberInSource.returns(options.columnNumber);
    const selectors = options.selectors
        ? options.selectors.map(s => ({ ...createCSSValue(s.text), ...s }))
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
export function createMockCSSKeyframesRule(name, keyframes) {
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
        Object.assign(kfMock, { style });
        mockKeyframes.push(kfMock);
    }
    rule.name.returns(createCSSValue(name));
    rule.keyframes.returns(mockKeyframes);
    return rule;
}
export function createMockCSSAtRule(type, options) {
    const rule = sinon.createStubInstance(DevTools.CSSRule.CSSAtRule);
    attachRuleMeta(rule, options.sourceURL, options.origin);
    const style = createMockCSSStyleDeclaration(options.properties, {
        rule,
        range: options.range,
    });
    rule.type.returns(type);
    rule.name.returns(options.name ? createCSSValue(options.name) : null);
    rule.subsection.returns(options.subsection ?? null);
    Object.assign(rule, { style });
    return rule;
}
export function createMockCSSPositionTryRule(name, options) {
    const rule = sinon.createStubInstance(DevTools.CSSRule.CSSPositionTryRule);
    attachRuleMeta(rule, options.sourceURL);
    const style = createMockCSSStyleDeclaration(options.properties, {
        rule,
        range: options.range,
    });
    rule.name.returns(createCSSValue(name));
    rule.active.returns(options.active ?? false);
    Object.assign(rule, { style });
    return rule;
}
export function createMockCSSRegisteredProperty(name, options = {}) {
    const properties = [
        createMockCSSProperty('syntax', options.syntax ?? '"*"'),
        createMockCSSProperty('inherits', String(options.inherits ?? false)),
    ];
    if (options.initialValue) {
        properties.push(createMockCSSProperty('initial-value', options.initialValue));
    }
    let parentRule = null;
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
        Object.assign(parentRule, { style });
    }
    const prop = sinon.createStubInstance(DevTools.CSSMatchedStyles.CSSRegisteredProperty);
    prop.propertyName.returns(name);
    prop.inherits.returns(options.inherits ?? false);
    prop.syntax.returns(options.syntax ?? '"*"');
    prop.initialValue.returns(options.initialValue ?? null);
    prop.style.returns(style);
    return prop;
}
export function createMockCSSFunctionRule(nameWithParams, options) {
    const rule = sinon.createStubInstance(DevTools.CSSRule.CSSFunctionRule);
    attachRuleMeta(rule, options.sourceURL);
    const style = createMockCSSStyleDeclaration(options.properties, {
        rule,
        range: options.range,
    });
    const baseName = options.functionName ?? nameWithParams.split('(')[0] ?? nameWithParams;
    rule.functionName.returns(createCSSValue(baseName));
    rule.nameWithParameters.returns(nameWithParams);
    Object.assign(rule, { style });
    return rule;
}
export function createMockCSSMatchedStyles(params = {}) {
    const mockNode = typeof params.node === 'string'
        ? createMockDOMNode({ selector: params.node })
        : (params.node ?? createMockDOMNode());
    const inheritedStyles = params.inheritedStyles ?? [];
    const nodeStyles = params.nodeStyles
        ? [...params.nodeStyles, ...inheritedStyles]
        : inheritedStyles;
    const defaultParentNode = typeof params.parentNode === 'string'
        ? createMockDOMNode({ selector: params.parentNode })
        : params.parentNode;
    const nodeForStyleMap = params.nodeForStyleMap ?? new Map();
    const pseudoStylesMap = params.pseudoStyles ?? new Map();
    const pseudoTypes = new Set(pseudoStylesMap.keys());
    const customHighlights = params.customHighlights ?? new Map();
    const propertyStates = params.propertyStates ?? new Map();
    const mock = sinon.createStubInstance(DevTools.CSSMatchedStyles.CSSMatchedStyles);
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
    mock.nodeForStyle.callsFake(style => nodeForStyleMap.get(style) ?? defaultParentNode ?? null);
    mock.isInherited.callsFake(style => Boolean(inheritedStyles.find(inheritedStyle => inheritedStyle === style)));
    mock.pseudoStyles.callsFake(type => pseudoStylesMap.get(type) ?? []);
    mock.customHighlightPseudoStyles.callsFake(name => customHighlights.get(name) ?? []);
    mock.propertyState.callsFake(prop => propertyStates.get(prop) ?? 'Active');
    mock.getMatchingSelectors.callsFake(rule => params.matchingSelectorsMap?.get(rule) ?? []);
    return mock;
}
export function createMockExtension(options = {}) {
    const extension = sinon.createStubInstance(CdpExtension);
    sinon.stub(extension, 'id').value(options.id ?? 'mock-extension-id');
    sinon
        .stub(extension, 'path')
        .value(options.path ?? '/path/to/mock/extension');
    sinon.stub(extension, 'name').value(options.name ?? 'Mock Extension');
    sinon.stub(extension, 'version').value(options.version ?? '1.0.0');
    sinon.stub(extension, 'enabled').value(options.enabled ?? true);
    return extension;
}
export function createMockHeapSnapshotStats() {
    return {
        total: 1000,
        native: { total: 200, typedArrays: 50 },
        v8heap: {
            total: 800,
            code: 50,
            jsArrays: 150,
            strings: 200,
            system: 400,
        },
    };
}
export function createMockHeapSnapshotStaticData() {
    return new DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData(10, 0, 1000, 100);
}
export function createMockNativeContextSizes() {
    return {
        nativeContexts: [],
        sharedSize: 0,
        noAttributionSize: 0,
    };
}
export function createMockRetainedByContextSummary() {
    return {
        contextCount: 0,
        retainedByContextSize: 0,
        retainedByContextCount: 0,
        notRetainedByContextSize: 0,
        notRetainedByContextCount: 0,
        totalSize: 0,
    };
}
export function createMockHeapSnapshotAggregateData() {
    return {
        aggregates: [],
        objectCount: 0,
        totalSelfSize: 0,
    };
}
export function createMockItemsRange() {
    return new DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange(0, 0, 0, []);
}
export function createMockRetainingPaths() {
    return {
        paths: [],
        limitsReached: {
            depth: false,
            nodes: false,
            siblings: false,
        },
    };
}
export function createMockDominatorChain() {
    return [];
}
export function createMockClassDiff(options = {}) {
    return {
        index: options.index ?? 0,
        className: options.className ?? 'TestClass',
        addedCount: options.addedCount ?? 1,
        removedCount: options.removedCount ?? 0,
        countDelta: options.countDelta ?? 1,
        addedSize: options.addedSize ?? 10,
        removedSize: options.removedSize ?? 0,
        sizeDelta: options.sizeDelta ?? 10,
    };
}
export function createMockClassDiffTotals(options = {}) {
    return {
        addedCount: options.addedCount ?? 1,
        removedCount: options.removedCount ?? 0,
        countDelta: options.countDelta ?? 1,
        addedSize: options.addedSize ?? 10,
        removedSize: options.removedSize ?? 0,
        sizeDelta: options.sizeDelta ?? 10,
    };
}
export function createMockHeapSnapshotDiff(options = {}) {
    return {
        classDiffs: options.classDiffs ?? [createMockClassDiff()],
        totals: options.totals ?? createMockClassDiffTotals(),
    };
}
export function createMockDetailedClassDiff() {
    return {
        index: 0,
        className: 'TestClass',
        addedCount: 1,
        removedCount: 0,
        countDelta: 1,
        addedSize: 10,
        removedSize: 0,
        sizeDelta: 10,
        addedIds: [1],
        addedSelfSizes: [10],
        deletedIds: [],
        deletedSelfSizes: [],
    };
}
export function createMockDuplicateStrings() {
    return [];
}
export function createMockObjectInfo() {
    return {
        id: 1,
        nodeIndex: 0,
        name: 'Object',
        type: 'object',
        selfSize: 100,
        retainedSize: 200,
        distance: 1,
        edgeCount: 2,
        retainerCount: 1,
        detachedness: 1 /* DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState.ATTACHED */,
    };
}
export function createMockContextAnalysisResult() {
    return {
        scopes: [
            {
                scopeInfoNodeIndex: 30,
                scopeInfoNodeId: 303,
                scriptNodeIndex: 7,
                scriptNodeId: 301,
                scriptName: 'test.js',
                scopeName: 'createClosure',
                scopeStart: 14,
                scopeEnd: 104,
                contextFieldCount: 2,
                contexts: [
                    {
                        contextNodeIndex: 10,
                        contextNodeId: 101,
                        retainedSize: 5000,
                        deadFieldsRetainedSizeSum: 2000,
                        deadFields: [
                            {
                                name: 'dead',
                                valueNodeIndex: 50,
                                valueNodeId: 202,
                                valueName: 'Object',
                                valueType: 'object',
                                selfSize: 200,
                                retainedSize: 2000,
                            },
                        ],
                    },
                    {
                        contextNodeIndex: 11,
                        contextNodeId: 102,
                        retainedSize: 1000,
                        deadFieldsRetainedSizeSum: 500,
                        deadFields: [
                            {
                                name: 'alsoDead',
                                valueNodeIndex: 60,
                                valueNodeId: 204,
                                valueName: 'Array',
                                valueType: 'object',
                                selfSize: 100,
                                retainedSize: 500,
                            },
                        ],
                    },
                ],
            },
            {
                scopeInfoNodeIndex: 40,
                scopeInfoNodeId: 313,
                scriptNodeIndex: 8,
                scriptNodeId: 311,
                scriptName: 'other-scope.js',
                scopeName: 'createOtherClosure',
                scopeStart: 20,
                scopeEnd: 60,
                contextFieldCount: 1,
                contexts: [
                    {
                        contextNodeIndex: 12,
                        contextNodeId: 111,
                        retainedSize: 3000,
                        deadFieldsRetainedSizeSum: 1500,
                        deadFields: [
                            {
                                name: 'captured',
                                valueNodeIndex: 70,
                                valueNodeId: 206,
                                valueName: 'Map',
                                valueType: 'object',
                                selfSize: 150,
                                retainedSize: 1500,
                            },
                        ],
                    },
                ],
            },
        ],
        scriptsWithoutScopes: [
            {
                scriptNodeIndex: 9,
                scriptNodeId: 401,
                scriptName: 'other.js',
                contextCount: 2,
            },
        ],
    };
}
export function createMockParsedArguments(options = {}) {
    const defaultArgs = new ConfigParser('0.0.0', ['node', 'main.js'], process.env, false).parse();
    return { ...defaultArgs, ...options };
}
export function createMockHeapSnapshotNode(options = {}) {
    return {
        id: options.id ?? 1,
        name: options.name ?? 'Node',
        distance: options.distance ?? 1,
        nodeIndex: options.nodeIndex ?? 0,
        retainedSize: options.retainedSize ?? 100,
        selfSize: options.selfSize ?? 10,
        type: options.type ?? 'object',
        canBeQueried: options.canBeQueried ?? false,
        detachedDOMTreeNode: options.detachedDOMTreeNode ?? false,
        ignored: options.ignored ?? false,
        isAddedNotRemoved: options.isAddedNotRemoved ?? null,
    };
}
export function createMockHeapSnapshotEdge(options = {}) {
    return {
        name: options.name ?? 'edge',
        type: options.type ?? 'property',
        edgeIndex: options.edgeIndex ?? 0,
        isAddedNotRemoved: options.isAddedNotRemoved ?? null,
        node: options.node ?? createMockHeapSnapshotNode(),
    };
}
export function createMockHeapSnapshotAggregate(options = {}) {
    return {
        id: options.id ?? 1,
        className: options.className ?? 'Object',
        count: options.count ?? 1,
        selfSize: options.selfSize ?? 10,
        retainedSize: options.retainedSize ?? 100,
    };
}
//# sourceMappingURL=mocks.js.map