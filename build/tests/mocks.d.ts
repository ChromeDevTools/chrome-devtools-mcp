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
import './setupDevTools.js';
import type { Mouse, SerializedAXNode } from 'puppeteer-core';
import sinon from 'sinon';
import type { ParsedArguments } from '../src/config/mcp-options.js';
import { ServerConfig } from '../src/config/ServerConfig.js';
import { McpContext } from '../src/McpContext.js';
import { McpPage } from '../src/McpPage.js';
import { McpResponse } from '../src/McpResponse.js';
import { McpWorker, type WorkerType } from '../src/McpWorker.js';
import { TaskRunner } from '../src/utils/TaskRunner.js';
import type { DuplicateStringGroup, HeapSnapshotAggregate, HeapSnapshotAggregateData, HeapSnapshotClassDiff, HeapSnapshotClassDiffTotals, HeapSnapshotDetailedClassDiff, HeapSnapshotDiff, HeapSnapshotDiffObject } from '../src/processors/HeapSnapshotManager.js';
import { Accessibility, CDPSession, Connection, ConsoleMessage, DevTools, Dialog, ElementHandle, Locator, Target, TargetType, Tracing, WebWorker, WebMCP, WebMCPTool, type Browser, type BrowserContext, type ConsoleMessageLocation, type ConsoleMessageType, type Extension, type JSHandle, type Page, type Protocol, type Realm, type Result, type RunnerResult } from '../src/third_party/index.js';
export type MockPuppeteerPage = sinon.SinonStubbedInstance<Page> & {
    webmcp: sinon.SinonStubbedInstance<WebMCP>;
    tracing: sinon.SinonStubbedInstance<Tracing>;
    mouse: sinon.SinonStubbedInstance<Mouse>;
    accessibility: sinon.SinonStubbedInstance<Accessibility>;
    cdpSession: {
        on: sinon.SinonStub;
        off: sinon.SinonStub;
        send: sinon.SinonStub;
        target: sinon.SinonStub;
        emit: (eventName: string | symbol | number, data?: unknown) => void;
    };
};
export type MockMcpPage = sinon.SinonStubbedInstance<McpPage> & {
    pptrPage: MockPuppeteerPage;
    target: sinon.SinonStubbedInstance<MockTarget>;
};
export type MockMcpContext = sinon.SinonStubbedInstance<McpContext>;
export type MockMcpResponse = sinon.SinonStubbedInstance<McpResponse>;
export interface ProtocolAXNode extends SerializedAXNode {
    loaderId?: string;
    backendNodeId?: number;
    children?: ProtocolAXNode[];
    elementHandle: () => Promise<ElementHandle<Element> | null>;
}
export declare function createMockAXNode(role: string, options?: {
    name?: string;
    loaderId?: string;
    backendNodeId?: number;
    children?: ProtocolAXNode[];
}): ProtocolAXNode;
export type MockDOMNode = sinon.SinonStubbedInstance<DevTools.DOMModel.DOMNode>;
export type MockCSSProperty = sinon.SinonStubbedInstance<DevTools.CSSProperty.CSSProperty>;
export type MockCSSStyleDeclaration = sinon.SinonStubbedInstance<DevTools.CSSStyleDeclaration.CSSStyleDeclaration>;
export type MockCSSMatchedStyles = sinon.SinonStubbedInstance<DevTools.CSSMatchedStyles.CSSMatchedStyles>;
export type MockCSSStyleRule = sinon.SinonStubbedInstance<DevTools.CSSRule.CSSStyleRule>;
export type MockCSSKeyframesRule = sinon.SinonStubbedInstance<DevTools.CSSRule.CSSKeyframesRule>;
export type MockCSSAtRule = sinon.SinonStubbedInstance<DevTools.CSSRule.CSSAtRule>;
export type MockCSSPositionTryRule = sinon.SinonStubbedInstance<DevTools.CSSRule.CSSPositionTryRule>;
export type MockCSSRegisteredProperty = sinon.SinonStubbedInstance<DevTools.CSSMatchedStyles.CSSRegisteredProperty>;
export type MockCSSFunctionRule = sinon.SinonStubbedInstance<DevTools.CSSRule.CSSFunctionRule>;
/**
 * A minimal event emitter used to back mocked `on`/`off`/`emit` methods on
 * Puppeteer objects (Page, CDPSession, Browser) so tests can trigger events
 * synchronously without a real browser.
 */
export declare function mockListener(): {
    on: (eventName: string | symbol | number, listener: (data: unknown) => void) => void;
    off: (eventName: string | symbol | number, listener?: (data: unknown) => void) => void;
    emit: (eventName: string | symbol | number, data?: unknown) => void;
    listenerCount: (eventName: string | symbol | number) => number;
};
export declare function createMockPuppeteerBrowser(): sinon.SinonStubbedInstance<Browser>;
export declare class MockCDPSession extends CDPSession {
    connection(): Connection | undefined;
    get detached(): boolean;
    send(): Promise<never>;
    detach(): Promise<void>;
    id(): string;
}
export declare function createMockCDPSession(): sinon.SinonStubbedInstance<MockCDPSession>;
export declare function createMockPuppeteerPage(): MockPuppeteerPage;
export declare function createMockWebMCPTool(options: {
    name: string;
    description?: string;
    inputSchema?: object;
    annotations?: Protocol.WebMCP.Annotation & {
        debugging?: boolean;
    };
}): sinon.SinonStubbedInstance<WebMCPTool>;
export declare class MockTarget extends Target {
    asPage(): Promise<Page>;
    url(): string;
    createCDPSession(): Promise<CDPSession>;
    type(): TargetType;
    browser(): Browser;
    browserContext(): BrowserContext;
    opener(): Target | undefined;
    _getTargetInfo(): Protocol.Target.TargetInfo;
}
export declare function createMockPuppeteerTarget(options?: {
    page?: sinon.SinonStubbedInstance<Page>;
    url?: string;
    title?: string;
    type?: TargetType;
}): sinon.SinonStubbedInstance<MockTarget>;
export declare function createMockMcpPage(options?: {
    id?: number;
    pptrPage?: MockPuppeteerPage;
    target?: sinon.SinonStubbedInstance<MockTarget>;
}): MockMcpPage;
export declare function createMockDialog(options?: {
    type?: Protocol.Page.DialogType;
    message?: string;
    handled?: boolean;
}): sinon.SinonStubbedInstance<Dialog>;
export declare function createMockElementHandle(): {
    handle: sinon.SinonStubbedInstance<ElementHandle<Element>>;
    locator: sinon.SinonStubbedInstance<Locator<Element>>;
};
export declare function createMockTarget(): sinon.SinonStubbedInstance<MockTarget>;
declare class MockWebWorker extends WebWorker {
    mainRealm(): Realm;
    get client(): CDPSession;
}
export declare function createMockWebWorker(): sinon.SinonStubbedInstance<MockWebWorker>;
export declare function createMockMcpWorker(options?: {
    id?: string;
    type?: WorkerType;
    url?: string;
    worker?: WebWorker;
}): McpWorker;
export declare function createMockMcpContext(options?: {
    selectedPage?: MockMcpPage;
    taskRunner?: TaskRunner;
}): MockMcpContext;
export declare function createMockMcpResponse(): MockMcpResponse;
/**
 * Convenience helper — creates a mock page, context and response in one call.
 *
 *   const {page, context, response} = createHandlerMocks();
 */
export declare function createHandlerMocks(options?: Partial<ParsedArguments>): {
    page: MockMcpPage;
    context: MockMcpContext;
    response: MockMcpResponse;
    args: ParsedArguments;
};
export declare function createMockRunnerResult(lhrOverrides?: Partial<Result>): RunnerResult;
type RuleOrigin = 'regular' | 'user-agent' | 'injected' | 'inspector';
export interface MockDOMNodeOptions {
    selector?: string;
    backendNodeId?: number;
}
export declare function createMockDOMNode(options?: MockDOMNodeOptions): MockDOMNode;
export interface MockCSSPropertyOptions {
    important?: boolean;
    parsedOk?: boolean;
    disabled?: boolean;
}
export declare function createMockCSSProperty(name: string, value: string, options?: MockCSSPropertyOptions): MockCSSProperty;
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
export declare function createMockCSSStyleDeclaration(properties: DevTools.CSSProperty.CSSProperty[], options?: MockCSSStyleDeclarationOptions): MockCSSStyleDeclaration;
export declare function createMockCSSInlineStyle(properties: DevTools.CSSProperty.CSSProperty[]): MockCSSStyleDeclaration;
export interface MockRuleOptions {
    sourceURL?: string;
    lineNumber?: number;
    columnNumber?: number;
    origin?: RuleOrigin;
    isConstructed?: boolean;
    nestingSelectors?: string[];
    selectors?: Array<{
        text: string;
    }>;
    layers?: Array<{
        text?: string;
    }>;
    media?: Array<{
        text: string;
    }>;
    containerQueries?: Array<{
        text?: string;
        name?: string;
        getContainerForNode?: (nodeId: number) => Promise<unknown>;
    }>;
    scopes?: Array<{
        text: string;
    }>;
    supports?: Array<{
        text: string;
    }>;
    startingStyles?: unknown[];
    navigations?: Array<{
        text?: string;
    }>;
    ruleTypes?: DevTools.Protocol.CSS.CSSRuleType[];
}
export declare function synthesizeRuleTypes(options: MockRuleOptions): DevTools.Protocol.CSS.CSSRuleType[] | undefined;
export declare function attachRuleMeta(rule: sinon.SinonStubbedInstance<DevTools.CSSRule.CSSRule>, sourceURL?: string, origin?: RuleOrigin, isConstructed?: boolean): void;
export declare function createMockCSSStyleRule(selector: string, options?: MockRuleOptions): MockCSSStyleRule;
export declare function createMockCSSKeyframesRule(name: string, keyframes: Array<{
    key: string;
    properties: DevTools.CSSProperty.CSSProperty[];
    sourceURL?: string;
    range?: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
}>): MockCSSKeyframesRule;
export declare function createMockCSSAtRule(type: string, options: {
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
}): MockCSSAtRule;
export declare function createMockCSSPositionTryRule(name: string, options: {
    active?: boolean;
    properties: DevTools.CSSProperty.CSSProperty[];
    sourceURL?: string;
    range?: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
}): MockCSSPositionTryRule;
export declare function createMockCSSRegisteredProperty(name: string, options?: {
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
}): MockCSSRegisteredProperty;
export declare function createMockCSSFunctionRule(nameWithParams: string, options: {
    functionName?: string;
    properties: DevTools.CSSProperty.CSSProperty[];
    sourceURL?: string;
    range?: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
    };
}): MockCSSFunctionRule;
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
    nodeForStyleMap?: Map<DevTools.CSSStyleDeclaration.CSSStyleDeclaration, DevTools.DOMModel.DOMNode>;
    pseudoStyles?: Map<DevTools.Protocol.DOM.PseudoType, DevTools.CSSStyleDeclaration.CSSStyleDeclaration[]>;
    customHighlights?: Map<string, DevTools.CSSStyleDeclaration.CSSStyleDeclaration[]>;
    propertyStates?: Map<DevTools.CSSProperty.CSSProperty, string>;
    matchingSelectorsMap?: Map<unknown, number[]>;
}
export declare function createMockCSSMatchedStyles(params?: MockCSSMatchedStylesParams): MockCSSMatchedStyles;
export declare function createMockExtension(options?: {
    id?: string;
    path?: string;
    name?: string;
    version?: string;
    enabled?: boolean;
}): Extension;
export declare function createMockHeapSnapshotStats(): DevTools.HeapSnapshotModel.HeapSnapshotModel.Statistics;
export declare function createMockHeapSnapshotStaticData(): DevTools.HeapSnapshotModel.HeapSnapshotModel.StaticData;
export declare function createMockNativeContextSizes(): DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes;
export declare function createMockRetainedByContextSummary(): DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary;
export declare function createMockHeapSnapshotAggregateData(): HeapSnapshotAggregateData;
export declare function createMockItemsRange(): DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange;
export declare function createMockRetainingPaths(): DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingPaths;
export declare function createMockDominatorChain(): DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain;
export declare function createMockClassDiff(options?: Partial<HeapSnapshotClassDiff>): HeapSnapshotClassDiff;
export declare function createMockClassDiffTotals(options?: Partial<HeapSnapshotClassDiffTotals>): HeapSnapshotClassDiffTotals;
export declare function createMockHeapSnapshotDiff(options?: Partial<HeapSnapshotDiff>): HeapSnapshotDiff;
export declare function createMockDiffObject(options?: Partial<HeapSnapshotDiffObject>): HeapSnapshotDiffObject;
export declare function createMockDetailedClassDiff(options?: Partial<HeapSnapshotDetailedClassDiff>): HeapSnapshotDetailedClassDiff;
export declare function createMockDuplicateStrings(): DuplicateStringGroup[];
export declare function createMockObjectInfo(): DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo;
export declare function createMockContextAnalysisResult(): DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult;
export declare function stripUndefined<T extends object>(options: T): T;
export declare function createMockParsedArguments(options?: Partial<ParsedArguments>): ParsedArguments;
export declare function createMockServerConfig(options?: Partial<ParsedArguments>): ServerConfig;
export declare function createMockHeapSnapshotNode(options?: Partial<DevTools.HeapSnapshotModel.HeapSnapshotModel.Node>): DevTools.HeapSnapshotModel.HeapSnapshotModel.Node;
export declare function createMockHeapSnapshotEdge(options?: Partial<DevTools.HeapSnapshotModel.HeapSnapshotModel.Edge>): DevTools.HeapSnapshotModel.HeapSnapshotModel.Edge;
export declare function createMockHeapSnapshotAggregate(options?: Partial<HeapSnapshotAggregate>): HeapSnapshotAggregate;
export declare function createMockConsoleMessage(options?: {
    type?: ConsoleMessageType;
    text?: string;
    args?: JSHandle[];
    location?: ConsoleMessageLocation;
}): sinon.SinonStubbedInstance<ConsoleMessage>;
export {};
