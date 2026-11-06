// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as Handlers from './handlers/handlers.js';
import * as Helpers from './helpers/helpers.js';
import * as Types from './types/types.js';
const UIStrings = {
    /**
     * @description Category in the summary view of the Performance panel to indicate time spent to load resources.
     */
    loading: 'Loading',
    /**
     * @description Event category in the Performance panel for user experience events, such as layout shifts and event timing.
     */
    experience: 'Experience',
    /**
     * @description Category in the summary view of the Performance panel to indicate time spent in script execution.
     */
    scripting: 'Scripting',
    /**
     * @description Category in the summary view of the Performance panel to indicate time spent in rendering the web page.
     */
    rendering: 'Rendering',
    /**
     * @description Category in the summary view of the Performance panel to indicate time spent to visually represent the web page.
     */
    painting: 'Painting',
    /**
     * @description Event category in the Performance panel for time spent in the GPU.
     */
    gpu: 'GPU',
    /**
     * @description Event category in the Performance panel for asynchronous tasks.
     */
    async: 'Async',
    /**
     * @description Category in the summary view of the Performance panel to indicate time spent in the rest of the system.
     */
    system: 'System',
    /**
     * @description Category in the summary view of the Performance panel to indicate idle time.
     */
    idle: 'Idle',
    /**
     * @description Label for main thread tasks in the Performance panel.
     */
    task: 'Task',
    /**
     * @description Text for running a console task in the Performance panel.
     */
    consoleTaskRun: 'Run console task',
    /**
     * @description Text shown in the Performance panel timeline for the Program trace event, which represents uncategorized or internal browser execution time.
     */
    other: 'Other',
    /**
     * @description Text that refers to the animation of the web page.
     */
    animation: 'Animation',
    /**
     * @description Text that refers to some events.
     */
    event: 'Event',
    /**
     * @description Text for an event requesting a main thread frame in the Performance panel.
     */
    requestMainThreadFrame: 'Request main thread frame',
    /**
     * @description Text indicating the start of a frame in the Performance panel.
     */
    frameStart: 'Frame start',
    /**
     * @description Text for an event when a message is received in the Performance panel.
     */
    onMessage: 'On message',
    /**
     * @description Text for an event scheduling a postMessage in the Performance panel.
     */
    schedulePostMessage: 'Schedule postMessage',
    /**
     * @description Category for messaging events in the Performance panel.
     */
    messaging: 'Messaging',
    /**
     * @description Text indicating the start of a frame on the main thread in the Performance panel.
     */
    frameStartMainThread: 'Frame start (main thread)',
    /**
     * @description Text for drawing a frame in the Performance panel.
     */
    drawFrame: 'Draw frame',
    /**
     * @description Noun for an event in the Performance panel. This marks time
     * spent in an operation that only happens when the profiler is active.
     */
    profilingOverhead: 'Profiling overhead',
    /**
     * @description The process the browser uses to determine a target element for a
     * pointer event. Typically, this is determined by considering the pointer's
     * location and also the visual layout of elements on the screen.
     */
    hitTest: 'Hit test',
    /**
     * @description Noun for an event in the Performance panel. The browser has decided
     * that the styles for some elements need to be recalculated and scheduled that
     * recalculation process at some time in the future.
     */
    scheduleStyleRecalculation: 'Schedule style recalculation',
    /**
     * @description Text for an event recalculating element styles in the Performance panel.
     */
    recalculateStyle: 'Recalculate style',
    /**
     * @description Text for an event invalidating page layout in the Performance panel.
     */
    invalidateLayout: 'Invalidate layout',
    /**
     * @description Noun for an event in the Performance panel. Layerize is a step
     * where we calculate which layers to create.
     */
    layerize: 'Layerize',
    /**
     * @description Text for a page layout event in the Performance panel.
     */
    layout: 'Layout',
    /**
     * @description Noun for an event in the Performance panel. Paint setup is a
     * step before the 'Paint' event. A paint event is when the browser draws pixels
     * to the screen. This step is the setup beforehand.
     */
    paintSetup: 'Paint setup',
    /**
     * @description Noun for a paint event in the Performance panel, where an image
     * was being painted. A paint event is when the browser draws pixels to the
     * screen, in this case specifically for an image in a website.
     */
    paintImage: 'Paint image',
    /**
     * @description Noun for an event in the Performance panel. Pre-paint is a
     * step before the 'Paint' event. A paint event is when the browser records the
     * instructions for drawing the page. This step is the setup beforehand.
     */
    prePaint: 'Pre-paint',
    /**
     * @description Text for an event updating a compositing layer in the Performance panel.
     */
    updateLayer: 'Update layer',
    /**
     * @description Text for an event updating the layer tree in the Performance panel.
     */
    updateLayerTree: 'Update layer tree',
    /**
     * @description Noun for a paint event in the Performance panel. A paint event is when the browser draws pixels to the screen.
     */
    paint: 'Paint',
    /**
     * @description Text for an event rasterizing paint operations in the Performance panel.
     */
    rasterizePaint: 'Rasterize paint',
    /**
     * @description Text shown in the Performance panel timeline for a scroll event, when the browser scrolls a layer.
     */
    scroll: 'Scroll',
    /**
     * @description Noun for an event in the Performance panel. Commit is a step
     * where we send (also known as "commit") layers to the compositor thread. This
     * step follows the "Layerize" step which is what calculates which layers to
     * create.
     */
    commit: 'Commit',
    /**
     * @description Text for an event compositing layers in the Performance panel.
     */
    compositeLayers: 'Composite layers',
    /**
     * @description Text for an event computing element intersections in the Performance panel.
     */
    computeIntersections: 'Compute intersections',
    /**
     * @description Text for an event parsing HTML in the Performance panel.
     */
    parseHtml: 'Parse HTML',
    /**
     * @description Text for an event parsing a CSS stylesheet in the Performance panel.
     */
    parseStylesheet: 'Parse stylesheet',
    /**
     * @description Text for an event installing a timer in the Performance panel.
     */
    installTimer: 'Install timer',
    /**
     * @description Text for an event removing a timer in the Performance panel.
     */
    removeTimer: 'Remove timer',
    /**
     * @description Text for an event when a timer fires in the Performance panel.
     */
    timerFired: 'Timer fired',
    /**
     * @description Text for an event. Shown in the timeline in the Performance panel.
     * XHR refers to XmlHttpRequest, a Web API. This particular Web API has a property
     * named 'readyState' (https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/readyState). When
     * the 'readyState' property changes the text is shown.
     */
    xhrReadyStateChange: '`XHR` `readyState` change',
    /**
     * @description Text for an event. Shown in the timeline in the Performance panel.
     * XHR refers to XmlHttpRequest, a Web API. (see https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)
     * The text is shown when a XmlHttpRequest load event happens on the inspected page.
     */
    xhrLoad: '`XHR` load',
    /**
     * @description Text for an event compiling a script in the Performance panel.
     */
    compileScript: 'Compile script',
    /**
     * @description Text for an event caching script code in the Performance panel.
     */
    cacheScript: 'Cache script code',
    /**
     * @description Text for an event compiling code in the Performance panel.
     */
    compileCode: 'Compile code',
    /**
     * @description Text for an event optimizing code in the Performance panel.
     */
    optimizeCode: 'Optimize code',
    /**
     * @description Text for an event evaluating a script in the Performance panel.
     */
    evaluateScript: 'Evaluate script',
    /**
     * @description Text for an event compiling a JavaScript module in the Performance panel.
     */
    compileModule: 'Compile module',
    /**
     * @description Text for an event caching a JavaScript module in the Performance panel.
     */
    cacheModule: 'Cache module code',
    /**
     * @description Text for an event. Shown in the timeline in the Performance panel.
     * "Module" refers to JavaScript modules: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
     * JavaScript modules are a way to organize JavaScript code.
     * "Evaluate" is the phase when the JavaScript code of a module is executed.
     */
    evaluateModule: 'Evaluate module',
    /**
     * @description Noun indicating that a compile task (type: streaming) happened.
     */
    streamingCompileTask: 'Streaming compile task',
    /**
     * @description Text for an event waiting for network responses in the Performance panel.
     */
    waitingForNetwork: 'Waiting for network',
    /**
     * @description Text for an event parsing and compiling code in the Performance panel.
     */
    parseAndCompile: 'Parse and compile',
    /**
     * @description Text in the Performance panel.
     * "Code Cache" refers to JavaScript bytecode cache: https://v8.dev/blog/code-caching-for-devs
     * "Deserialize" refers to the process of reading the code cache.
     */
    deserializeCodeCache: 'Deserialize code cache',
    /**
     * @description Text for an event streaming a WebAssembly response in the Performance panel.
     */
    streamingWasmResponse: 'Streaming Wasm response',
    /**
     * @description Text for an event compiling a WebAssembly module in the Performance panel.
     */
    compiledWasmModule: 'Compiled Wasm module',
    /**
     * @description Text for an event caching a WebAssembly module in the Performance panel.
     */
    cachedWasmModule: 'Cached Wasm module',
    /**
     * @description Text for a WebAssembly module cache hit in the Performance panel.
     */
    wasmModuleCacheHit: 'Wasm module cache hit',
    /**
     * @description Text for an invalid WebAssembly module cache in the Performance panel.
     */
    wasmModuleCacheInvalid: 'Wasm module cache invalid',
    /**
     * @description Text for an event when a frame started loading in the Performance panel.
     */
    frameStartedLoading: 'Frame started loading',
    /**
     * @description Text for a soft navigation start marker in the Performance panel.
     */
    softNavigationStart: 'Soft navigation start',
    /**
     * @description Text for an onload event marker in the Performance panel.
     */
    onloadEvent: 'Onload event',
    /**
     * @description Text for a DOMContentLoaded event marker in the Performance panel.
     */
    domcontentloadedEvent: 'DOMContentLoaded event',
    /**
     * @description Text for the First Paint metric marker in the Performance panel.
     */
    firstPaint: 'First Paint',
    /**
     * @description Text for the First Contentful Paint metric marker in the Performance panel.
     */
    firstContentfulPaint: 'First Contentful Paint',
    /**
     * @description Text for the Soft First Contentful Paint metric marker in the Performance panel.
     */
    softFirstContentfulPaint: 'Soft First Contentful Paint',
    /**
     * @description Text for the Largest Contentful Paint metric marker in the Performance panel.
     */
    largestContentfulPaint: 'Largest Contentful Paint',
    /**
     * @description Text for the Soft Largest Contentful Paint metric marker in the Performance panel.
     */
    softLargestContentfulPaint: 'Soft Largest Contentful Paint',
    /**
     * @description Text shown in the Performance panel timeline for a `console.timeStamp()` event.
     */
    timestamp: 'Timestamp',
    /**
     * @description Noun for a 'time' event that happens in the Console (a tool in
     * DevTools). The user can trigger console time events from their code, and
     * they will show up in the Performance panel. Time events are used to measure
     * the duration of something, e.g. the user will emit two time events at the
     * start and end of some interesting task.
     */
    consoleTime: 'Console time',
    /**
     * @description Text for a user timing entry in the Performance panel.
     */
    userTiming: 'User timing',
    /**
     * @description Name for an event shown in the Performance panel. When a network
     * request is about to be sent by the browser, the time is recorded and DevTools
     * is notified that a network request will be sent momentarily.
     */
    willSendRequest: 'Will send request',
    /**
     * @description Text for an event sending a network request in the Performance panel.
     */
    sendRequest: 'Send request',
    /**
     * @description Text for an event receiving a network response in the Performance panel.
     */
    receiveResponse: 'Receive response',
    /**
     * @description Text for an event finishing resource loading in the Performance panel.
     */
    finishLoading: 'Finish loading',
    /**
     * @description Text for an event receiving network data in the Performance panel.
     */
    receiveData: 'Receive data',
    /**
     * @description Event category in the Performance panel for time spent to execute microtasks in JavaScript.
     */
    runMicrotasks: 'Run microtasks',
    /**
     * @description Text for a function call event in the Performance panel.
     */
    functionCall: 'Function call',
    /**
     * @description Text for a garbage collection event in the Performance panel.
     */
    gcEvent: 'GC event',
    /**
     * @description Event category in the Performance panel for time spent to perform a full garbage collection pass.
     */
    majorGc: 'Major GC',
    /**
     * @description Event category in the Performance panel for time spent to perform a quick garbage collection pass.
     */
    minorGc: 'Minor GC',
    /**
     * @description Text for the request animation frame event.
     */
    requestAnimationFrame: 'Request animation frame',
    /**
     * @description Text to cancel the animation frame.
     */
    cancelAnimationFrame: 'Cancel animation frame',
    /**
     * @description Text for the event that an animation frame is fired.
     */
    animationFrameFired: 'Animation frame fired',
    /**
     * @description Text for an event requesting an idle callback in the Performance panel.
     */
    requestIdleCallback: 'Request idle callback',
    /**
     * @description Text for an event cancelling an idle callback in the Performance panel.
     */
    cancelIdleCallback: 'Cancel idle callback',
    /**
     * @description Text for an event firing an idle callback in the Performance panel.
     */
    fireIdleCallback: 'Fire idle callback',
    /**
     * @description Text for an event creating a WebSocket connection in the Performance panel.
     */
    createWebsocket: 'Create WebSocket',
    /**
     * @description Text for an event sending a WebSocket handshake in the Performance panel.
     */
    sendWebsocketHandshake: 'Send WebSocket handshake',
    /**
     * @description Text for an event receiving a WebSocket handshake in the Performance panel.
     */
    receiveWebsocketHandshake: 'Receive WebSocket handshake',
    /**
     * @description Text in the flame chart of the Performance panel for receiving a WebSocket message.
     */
    wsMessageReceived: 'Receive WebSocket message',
    /**
     * @description Text in the flame chart of the Performance panel for sending a WebSocket message.
     */
    wsMessageSent: 'Send WebSocket message',
    /**
     * @description Text for an event destroying a WebSocket connection in the Performance panel.
     */
    destroyWebsocket: 'Destroy WebSocket',
    /**
     * @description Event category in the Performance panel for time spent in the embedder of the WebView.
     */
    embedderCallback: 'Embedder callback',
    /**
     * @description Event category in the Performance panel for time spent decoding an image.
     */
    imageDecode: 'Image decode',
    /**
     * @description Event category in the Performance panel for time spent to perform garbage collection for the Document Object Model.
     */
    domGc: 'DOM GC',
    /**
     * @description Event category in the Performance panel for time spent to perform garbage collection for C++: https://chromium.googlesource.com/v8/v8/+/main/include/cppgc/README.md.
     */
    cppGc: 'C++ GC',
    /**
     * @description Event category in the Performance panel for time spent to perform encryption.
     */
    encrypt: 'Encrypt',
    /**
     * @description Text for an encryption reply event in the Performance panel.
     */
    encryptReply: 'Encrypt reply',
    /**
     * @description Event category in the Performance panel for time spent to perform decryption.
     */
    decrypt: 'Decrypt',
    /**
     * @description Text for a decryption reply event in the Performance panel.
     */
    decryptReply: 'Decrypt reply',
    /**
     * @description Noun phrase meaning 'the browser was preparing the digest'.
     * Digest: https://developer.mozilla.org/en-US/docs/Glossary/Digest
     */
    digest: 'Digest',
    /**
     * @description Noun phrase meaning 'the browser was preparing the digest
     * reply'. Digest: https://developer.mozilla.org/en-US/docs/Glossary/Digest
     */
    digestReply: 'Digest reply',
    /**
     * @description The 'sign' stage of a web crypto event. Shown when displaying what the website was doing at a particular point in time.
     */
    sign: 'Sign',
    /**
     * @description Noun phrase for an event of the Web Crypto API. The event is recorded when the signing process is concluded.
     * Signature: https://developer.mozilla.org/en-US/docs/Glossary/Signature/Security
     */
    signReply: 'Sign reply',
    /**
     * @description Text for a verification stage event in the Performance panel.
     */
    verify: 'Verify',
    /**
     * @description Text for a verification reply event in the Performance panel.
     */
    verifyReply: 'Verify reply',
    /**
     * @description Text for an asynchronous task in the Performance panel.
     */
    asyncTask: 'Async task',
    /**
     * @description Text in the Performance panel for layout shift records.
     */
    layoutShift: 'Layout shift',
    /**
     * @description Text in the Performance panel for layout shift cluster records.
     */
    layoutShiftCluster: 'Layout shift cluster',
    /**
     * @description Text in the Performance panel for an event timing record.
     */
    eventTiming: 'Event timing',
    /**
     * @description Event category in the Performance panel for JavaScript nodes in CPUProfile.
     */
    jsFrame: 'JS frame',
    /**
     * @description Text in UIDevtools Utils of the Performance panel.
     */
    rasterizing: 'Rasterizing',
    /**
     * @description Text in UIDevtools Utils of the Performance panel.
     */
    drawing: 'Drawing',
    /**
     * @description Label for an event in the Performance panel indicating that a
     * callback function has been scheduled to run at a later time using the
     * postTask API.
     */
    schedulePostTaskCallback: 'Schedule postTask',
    /**
     * @description Label for an event in the Performance panel indicating that a
     * callback function that was scheduled to run using the postTask API was
     * fired (invoked).
     */
    runPostTaskCallback: 'Fire postTask',
    /**
     * @description Label for an event in the Performance panel indicating that a
     * callback function that was scheduled to run at a later time using the
     * postTask API was cancelled, so will no longer run.
     */
    abortPostTaskCallback: 'Cancel postTask',
};
export var EventCategory;
(function (EventCategory) {
    EventCategory["DRAWING"] = "drawing";
    EventCategory["RASTERIZING"] = "rasterizing";
    EventCategory["LAYOUT"] = "layout";
    EventCategory["LOADING"] = "loading";
    EventCategory["EXPERIENCE"] = "experience";
    EventCategory["SCRIPTING"] = "scripting";
    EventCategory["MESSAGING"] = "messaging";
    EventCategory["RENDERING"] = "rendering";
    EventCategory["PAINTING"] = "painting";
    EventCategory["GPU"] = "gpu";
    EventCategory["ASYNC"] = "async";
    EventCategory["OTHER"] = "other";
    EventCategory["IDLE"] = "idle";
})(EventCategory || (EventCategory = {}));
let mainEventCategories;
const str_ = i18n.i18n.registerUIStrings('models/trace/Styles.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class TimelineRecordStyle {
    title;
    category;
    hidden;
    constructor(title, category, hidden = false) {
        this.title = title;
        this.category = category;
        this.hidden = hidden;
    }
}
export class TimelineCategory {
    name;
    title;
    visible;
    #hidden;
    #cssVariable;
    constructor(name, title, visible, cssVariable) {
        this.name = name;
        this.title = title;
        this.visible = visible;
        this.#cssVariable = cssVariable;
        this.hidden = false;
    }
    get hidden() {
        return Boolean(this.#hidden);
    }
    get cssVariable() {
        return this.#cssVariable;
    }
    getCSSValue() {
        return `var(${this.#cssVariable})`;
    }
    set hidden(hidden) {
        this.#hidden = hidden;
    }
}
/**
 * This object defines the styles for the categories used in the
 * timeline (loading, rendering, scripting, etc.).
 */
let categoryStyles;
/**
 * This map defines the styles for events shown in the panel. This
 * includes its color (which on the event's category, the label it's
 * displayed with and flag to know weather it's visible in the flamechart
 * or not).
 * The thread appenders use this map to determine if an event should be
 * shown in the flame chart. If an event is not in the map, then it
 * won't be shown, but it also won't be shown if it's marked as "hidden"
 * in its styles.
 *
 * The map is also used in other places, like the event's details view.
 */
let eventStylesMap;
export function getEventStyle(eventName) {
    return maybeInitSylesMap()[eventName];
}
export function stringIsEventCategory(it) {
    return Object.values(EventCategory).includes(it);
}
export function getCategoryStyles() {
    if (categoryStyles) {
        return categoryStyles;
    }
    categoryStyles = {
        loading: new TimelineCategory(EventCategory.LOADING, i18nString(UIStrings.loading), true, '--app-color-loading'),
        experience: new TimelineCategory(EventCategory.EXPERIENCE, i18nString(UIStrings.experience), false, '--app-color-rendering'),
        messaging: new TimelineCategory(EventCategory.MESSAGING, i18nString(UIStrings.messaging), true, '--app-color-messaging'),
        scripting: new TimelineCategory(EventCategory.SCRIPTING, i18nString(UIStrings.scripting), true, '--app-color-scripting'),
        rendering: new TimelineCategory(EventCategory.RENDERING, i18nString(UIStrings.rendering), true, '--app-color-rendering'),
        painting: new TimelineCategory(EventCategory.PAINTING, i18nString(UIStrings.painting), true, '--app-color-painting'),
        gpu: new TimelineCategory(EventCategory.GPU, i18nString(UIStrings.gpu), false, '--app-color-painting'),
        async: new TimelineCategory(EventCategory.ASYNC, i18nString(UIStrings.async), false, '--app-color-async'),
        other: new TimelineCategory(EventCategory.OTHER, i18nString(UIStrings.system), false, '--app-color-system'),
        idle: new TimelineCategory(EventCategory.IDLE, i18nString(UIStrings.idle), false, '--app-color-idle'),
        layout: new TimelineCategory(EventCategory.LAYOUT, i18nString(UIStrings.layout), false, '--app-color-loading'),
        rasterizing: new TimelineCategory(EventCategory.RASTERIZING, i18nString(UIStrings.rasterizing), false, '--app-color-scripting'),
        drawing: new TimelineCategory(EventCategory.DRAWING, i18nString(UIStrings.drawing), false, '--app-color-rendering'),
    };
    return categoryStyles;
}
export function maybeInitSylesMap() {
    if (eventStylesMap) {
        return eventStylesMap;
    }
    const defaultCategoryStyles = getCategoryStyles();
    eventStylesMap = {
        [Types.Events.Name.RUN_TASK]: new TimelineRecordStyle(i18nString(UIStrings.task), defaultCategoryStyles.other),
        [Types.Events.Name.PROFILE_CALL]: new TimelineRecordStyle(i18nString(UIStrings.jsFrame), defaultCategoryStyles.scripting),
        [Types.Events.Name.JS_SAMPLE]: new TimelineRecordStyle(Types.Events.Name.JS_SAMPLE, defaultCategoryStyles.scripting),
        [Types.Events.Name.PROGRAM]: new TimelineRecordStyle(i18nString(UIStrings.other), defaultCategoryStyles.other),
        [Types.Events.Name.START_PROFILING]: new TimelineRecordStyle(i18nString(UIStrings.profilingOverhead), defaultCategoryStyles.other),
        [Types.Events.Name.ANIMATION]: new TimelineRecordStyle(i18nString(UIStrings.animation), defaultCategoryStyles.rendering),
        [Types.Events.Name.EVENT_DISPATCH]: new TimelineRecordStyle(i18nString(UIStrings.event), defaultCategoryStyles.scripting),
        [Types.Events.Name.REQUEST_MAIN_THREAD_FRAME]: new TimelineRecordStyle(i18nString(UIStrings.requestMainThreadFrame), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.BEGIN_FRAME]: new TimelineRecordStyle(i18nString(UIStrings.frameStart), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.BEGIN_MAIN_THREAD_FRAME]: new TimelineRecordStyle(i18nString(UIStrings.frameStartMainThread), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.DRAW_FRAME]: new TimelineRecordStyle(i18nString(UIStrings.drawFrame), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.HIT_TEST]: new TimelineRecordStyle(i18nString(UIStrings.hitTest), defaultCategoryStyles.rendering),
        [Types.Events.Name.SCHEDULE_STYLE_RECALCULATION]: new TimelineRecordStyle(i18nString(UIStrings.scheduleStyleRecalculation), defaultCategoryStyles.rendering),
        [Types.Events.Name.RECALC_STYLE]: new TimelineRecordStyle(i18nString(UIStrings.recalculateStyle), defaultCategoryStyles.rendering),
        [Types.Events.Name.INVALIDATE_LAYOUT]: new TimelineRecordStyle(i18nString(UIStrings.invalidateLayout), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.LAYERIZE]: new TimelineRecordStyle(i18nString(UIStrings.layerize), defaultCategoryStyles.rendering),
        [Types.Events.Name.LAYOUT]: new TimelineRecordStyle(i18nString(UIStrings.layout), defaultCategoryStyles.rendering),
        [Types.Events.Name.PAINT_SETUP]: new TimelineRecordStyle(i18nString(UIStrings.paintSetup), defaultCategoryStyles.painting),
        [Types.Events.Name.PAINT_IMAGE]: new TimelineRecordStyle(i18nString(UIStrings.paintImage), defaultCategoryStyles.painting, true),
        [Types.Events.Name.UPDATE_LAYER]: new TimelineRecordStyle(i18nString(UIStrings.updateLayer), defaultCategoryStyles.painting, true),
        [Types.Events.Name.UPDATE_LAYER_TREE]: new TimelineRecordStyle(i18nString(UIStrings.updateLayerTree), defaultCategoryStyles.rendering),
        [Types.Events.Name.PAINT]: new TimelineRecordStyle(i18nString(UIStrings.paint), defaultCategoryStyles.painting),
        [Types.Events.Name.PRE_PAINT]: new TimelineRecordStyle(i18nString(UIStrings.prePaint), defaultCategoryStyles.rendering),
        [Types.Events.Name.RASTER_TASK]: new TimelineRecordStyle(i18nString(UIStrings.rasterizePaint), defaultCategoryStyles.painting),
        [Types.Events.Name.SCROLL_LAYER]: new TimelineRecordStyle(i18nString(UIStrings.scroll), defaultCategoryStyles.rendering),
        [Types.Events.Name.COMMIT]: new TimelineRecordStyle(i18nString(UIStrings.commit), defaultCategoryStyles.painting),
        [Types.Events.Name.COMPOSITE_LAYERS]: new TimelineRecordStyle(i18nString(UIStrings.compositeLayers), defaultCategoryStyles.painting),
        [Types.Events.Name.COMPUTE_INTERSECTION]: new TimelineRecordStyle(i18nString(UIStrings.computeIntersections), defaultCategoryStyles.rendering),
        [Types.Events.Name.PARSE_HTML]: new TimelineRecordStyle(i18nString(UIStrings.parseHtml), defaultCategoryStyles.loading),
        [Types.Events.Name.PARSE_AUTHOR_STYLE_SHEET]: new TimelineRecordStyle(i18nString(UIStrings.parseStylesheet), defaultCategoryStyles.loading),
        [Types.Events.Name.TIMER_INSTALL]: new TimelineRecordStyle(i18nString(UIStrings.installTimer), defaultCategoryStyles.scripting),
        [Types.Events.Name.TIMER_REMOVE]: new TimelineRecordStyle(i18nString(UIStrings.removeTimer), defaultCategoryStyles.scripting),
        [Types.Events.Name.TIMER_FIRE]: new TimelineRecordStyle(i18nString(UIStrings.timerFired), defaultCategoryStyles.scripting),
        [Types.Events.Name.XHR_READY_STATE_CHANGED]: new TimelineRecordStyle(i18nString(UIStrings.xhrReadyStateChange), defaultCategoryStyles.scripting),
        [Types.Events.Name.XHR_LOAD]: new TimelineRecordStyle(i18nString(UIStrings.xhrLoad), defaultCategoryStyles.scripting),
        [Types.Events.Name.COMPILE]: new TimelineRecordStyle(i18nString(UIStrings.compileScript), defaultCategoryStyles.scripting),
        [Types.Events.Name.CACHE_SCRIPT]: new TimelineRecordStyle(i18nString(UIStrings.cacheScript), defaultCategoryStyles.scripting),
        [Types.Events.Name.COMPILE_CODE]: new TimelineRecordStyle(i18nString(UIStrings.compileCode), defaultCategoryStyles.scripting),
        [Types.Events.Name.OPTIMIZE_CODE]: new TimelineRecordStyle(i18nString(UIStrings.optimizeCode), defaultCategoryStyles.scripting),
        [Types.Events.Name.EVALUATE_SCRIPT]: new TimelineRecordStyle(i18nString(UIStrings.evaluateScript), defaultCategoryStyles.scripting),
        [Types.Events.Name.COMPILE_MODULE]: new TimelineRecordStyle(i18nString(UIStrings.compileModule), defaultCategoryStyles.scripting),
        [Types.Events.Name.CACHE_MODULE]: new TimelineRecordStyle(i18nString(UIStrings.cacheModule), defaultCategoryStyles.scripting),
        [Types.Events.Name.EVALUATE_MODULE]: new TimelineRecordStyle(i18nString(UIStrings.evaluateModule), defaultCategoryStyles.scripting),
        [Types.Events.Name.STREAMING_COMPILE_SCRIPT]: new TimelineRecordStyle(i18nString(UIStrings.streamingCompileTask), defaultCategoryStyles.other),
        [Types.Events.Name.STREAMING_COMPILE_SCRIPT_WAITING]: new TimelineRecordStyle(i18nString(UIStrings.waitingForNetwork), defaultCategoryStyles.idle),
        [Types.Events.Name.STREAMING_COMPILE_SCRIPT_PARSING]: new TimelineRecordStyle(i18nString(UIStrings.parseAndCompile), defaultCategoryStyles.scripting),
        [Types.Events.Name.BACKGROUND_DESERIALIZE]: new TimelineRecordStyle(i18nString(UIStrings.deserializeCodeCache), defaultCategoryStyles.scripting),
        [Types.Events.Name.FINALIZE_DESERIALIZATION]: new TimelineRecordStyle(i18nString(UIStrings.profilingOverhead), defaultCategoryStyles.other),
        [Types.Events.Name.WASM_STREAM_FROM_RESPONSE_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.streamingWasmResponse), defaultCategoryStyles.scripting),
        [Types.Events.Name.WASM_COMPILED_MODULE]: new TimelineRecordStyle(i18nString(UIStrings.compiledWasmModule), defaultCategoryStyles.scripting),
        [Types.Events.Name.WASM_CACHED_MODULE]: new TimelineRecordStyle(i18nString(UIStrings.cachedWasmModule), defaultCategoryStyles.scripting),
        [Types.Events.Name.WASM_MODULE_CACHE_HIT]: new TimelineRecordStyle(i18nString(UIStrings.wasmModuleCacheHit), defaultCategoryStyles.scripting),
        [Types.Events.Name.WASM_MODULE_CACHE_INVALID]: new TimelineRecordStyle(i18nString(UIStrings.wasmModuleCacheInvalid), defaultCategoryStyles.scripting),
        [Types.Events.Name.FRAME_STARTED_LOADING]: new TimelineRecordStyle(i18nString(UIStrings.frameStartedLoading), defaultCategoryStyles.loading, true),
        [Types.Events.Name.MARK_LOAD]: new TimelineRecordStyle(i18nString(UIStrings.onloadEvent), defaultCategoryStyles.scripting, true),
        [Types.Events.Name.MARK_DOM_CONTENT]: new TimelineRecordStyle(i18nString(UIStrings.domcontentloadedEvent), defaultCategoryStyles.scripting, true),
        [Types.Events.Name.SOFT_NAVIGATION_START]: new TimelineRecordStyle(i18nString(UIStrings.softNavigationStart), defaultCategoryStyles.loading, true),
        [Types.Events.Name.MARK_FIRST_PAINT]: new TimelineRecordStyle(i18nString(UIStrings.firstPaint), defaultCategoryStyles.painting, true),
        [Types.Events.Name.MARK_FCP]: new TimelineRecordStyle(i18nString(UIStrings.firstContentfulPaint), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.MARK_SOFT_FCP]: new TimelineRecordStyle(i18nString(UIStrings.softFirstContentfulPaint), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.MARK_LCP_CANDIDATE]: new TimelineRecordStyle(i18nString(UIStrings.largestContentfulPaint), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.MARK_LCP_CANDIDATE_FOR_SOFT_NAVIGATION]: new TimelineRecordStyle(i18nString(UIStrings.softLargestContentfulPaint), defaultCategoryStyles.rendering, true),
        [Types.Events.Name.TIME_STAMP]: new TimelineRecordStyle(i18nString(UIStrings.timestamp), defaultCategoryStyles.scripting),
        [Types.Events.Name.CONSOLE_TIME]: new TimelineRecordStyle(i18nString(UIStrings.consoleTime), defaultCategoryStyles.scripting),
        [Types.Events.Name.USER_TIMING]: new TimelineRecordStyle(i18nString(UIStrings.userTiming), defaultCategoryStyles.scripting),
        [Types.Events.Name.RESOURCE_WILL_SEND_REQUEST]: new TimelineRecordStyle(i18nString(UIStrings.willSendRequest), defaultCategoryStyles.loading),
        [Types.Events.Name.RESOURCE_SEND_REQUEST]: new TimelineRecordStyle(i18nString(UIStrings.sendRequest), defaultCategoryStyles.loading),
        [Types.Events.Name.RESOURCE_RECEIVE_RESPONSE]: new TimelineRecordStyle(i18nString(UIStrings.receiveResponse), defaultCategoryStyles.loading),
        [Types.Events.Name.RESOURCE_FINISH]: new TimelineRecordStyle(i18nString(UIStrings.finishLoading), defaultCategoryStyles.loading),
        [Types.Events.Name.RESOURCE_RECEIVE_DATA]: new TimelineRecordStyle(i18nString(UIStrings.receiveData), defaultCategoryStyles.loading),
        [Types.Events.Name.RUN_MICROTASKS]: new TimelineRecordStyle(i18nString(UIStrings.runMicrotasks), defaultCategoryStyles.scripting),
        [Types.Events.Name.FUNCTION_CALL]: new TimelineRecordStyle(i18nString(UIStrings.functionCall), defaultCategoryStyles.scripting),
        [Types.Events.Name.GC]: new TimelineRecordStyle(i18nString(UIStrings.gcEvent), defaultCategoryStyles.scripting),
        [Types.Events.Name.MAJOR_GC]: new TimelineRecordStyle(i18nString(UIStrings.majorGc), defaultCategoryStyles.scripting),
        [Types.Events.Name.MINOR_GC]: new TimelineRecordStyle(i18nString(UIStrings.minorGc), defaultCategoryStyles.scripting),
        [Types.Events.Name.CPPGC_SWEEP]: new TimelineRecordStyle(i18nString(UIStrings.cppGc), defaultCategoryStyles.scripting),
        [Types.Events.Name.REQUEST_ANIMATION_FRAME]: new TimelineRecordStyle(i18nString(UIStrings.requestAnimationFrame), defaultCategoryStyles.scripting),
        [Types.Events.Name.CANCEL_ANIMATION_FRAME]: new TimelineRecordStyle(i18nString(UIStrings.cancelAnimationFrame), defaultCategoryStyles.scripting),
        [Types.Events.Name.FIRE_ANIMATION_FRAME]: new TimelineRecordStyle(i18nString(UIStrings.animationFrameFired), defaultCategoryStyles.scripting),
        [Types.Events.Name.REQUEST_IDLE_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.requestIdleCallback), defaultCategoryStyles.scripting),
        [Types.Events.Name.CANCEL_IDLE_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.cancelIdleCallback), defaultCategoryStyles.scripting),
        [Types.Events.Name.FIRE_IDLE_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.fireIdleCallback), defaultCategoryStyles.scripting),
        [Types.Events.Name.WEB_SOCKET_CREATE]: new TimelineRecordStyle(i18nString(UIStrings.createWebsocket), defaultCategoryStyles.scripting),
        [Types.Events.Name.WEB_SOCKET_SEND_HANDSHAKE_REQUEST]: new TimelineRecordStyle(i18nString(UIStrings.sendWebsocketHandshake), defaultCategoryStyles.scripting),
        [Types.Events.Name.WEB_SOCKET_RECEIVE_HANDSHAKE_REQUEST]: new TimelineRecordStyle(i18nString(UIStrings.receiveWebsocketHandshake), defaultCategoryStyles.scripting),
        [Types.Events.Name.WEB_SOCKET_DESTROY]: new TimelineRecordStyle(i18nString(UIStrings.destroyWebsocket), defaultCategoryStyles.scripting),
        [Types.Events.Name.WEB_SOCKET_SEND]: new TimelineRecordStyle(i18nString(UIStrings.wsMessageSent), defaultCategoryStyles.scripting),
        [Types.Events.Name.WEB_SOCKET_RECEIVE]: new TimelineRecordStyle(i18nString(UIStrings.wsMessageReceived), defaultCategoryStyles.scripting),
        [Types.Events.Name.EMBEDDER_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.embedderCallback), defaultCategoryStyles.scripting),
        [Types.Events.Name.DECODE_IMAGE]: new TimelineRecordStyle(i18nString(UIStrings.imageDecode), defaultCategoryStyles.painting),
        [Types.Events.Name.GPU_TASK]: new TimelineRecordStyle(i18nString(UIStrings.gpu), defaultCategoryStyles.gpu),
        [Types.Events.Name.GC_COLLECT_GARBARGE]: new TimelineRecordStyle(i18nString(UIStrings.domGc), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_ENCRYPT]: new TimelineRecordStyle(i18nString(UIStrings.encrypt), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_ENCRYPT_REPLY]: new TimelineRecordStyle(i18nString(UIStrings.encryptReply), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_DECRYPT]: new TimelineRecordStyle(i18nString(UIStrings.decrypt), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_DECRYPT_REPLY]: new TimelineRecordStyle(i18nString(UIStrings.decryptReply), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_DIGEST]: new TimelineRecordStyle(i18nString(UIStrings.digest), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_DIGEST_REPLY]: new TimelineRecordStyle(i18nString(UIStrings.digestReply), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_SIGN]: new TimelineRecordStyle(i18nString(UIStrings.sign), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_SIGN_REPLY]: new TimelineRecordStyle(i18nString(UIStrings.signReply), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_VERIFY]: new TimelineRecordStyle(i18nString(UIStrings.verify), defaultCategoryStyles.scripting),
        [Types.Events.Name.CRYPTO_DO_VERIFY_REPLY]: new TimelineRecordStyle(i18nString(UIStrings.verifyReply), defaultCategoryStyles.scripting),
        [Types.Events.Name.ASYNC_TASK]: new TimelineRecordStyle(i18nString(UIStrings.asyncTask), defaultCategoryStyles.async),
        [Types.Events.Name.LAYOUT_SHIFT]: new TimelineRecordStyle(i18nString(UIStrings.layoutShift), defaultCategoryStyles.experience, 
        /* Mark LayoutShifts as hidden; in the timeline we render
         * SyntheticLayoutShifts so those are the ones visible to the user */
        true),
        [Types.Events.Name.SYNTHETIC_LAYOUT_SHIFT]: new TimelineRecordStyle(i18nString(UIStrings.layoutShift), defaultCategoryStyles.experience),
        [Types.Events.Name.SYNTHETIC_LAYOUT_SHIFT_CLUSTER]: new TimelineRecordStyle(i18nString(UIStrings.layoutShiftCluster), defaultCategoryStyles.experience),
        [Types.Events.Name.EVENT_TIMING]: new TimelineRecordStyle(i18nString(UIStrings.eventTiming), defaultCategoryStyles.experience),
        [Types.Events.Name.HANDLE_POST_MESSAGE]: new TimelineRecordStyle(i18nString(UIStrings.onMessage), defaultCategoryStyles.messaging),
        [Types.Events.Name.SCHEDULE_POST_MESSAGE]: new TimelineRecordStyle(i18nString(UIStrings.schedulePostMessage), defaultCategoryStyles.messaging),
        [Types.Events.Name.SCHEDULE_POST_TASK_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.schedulePostTaskCallback), defaultCategoryStyles.scripting),
        [Types.Events.Name.RUN_POST_TASK_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.runPostTaskCallback), defaultCategoryStyles.scripting),
        [Types.Events.Name.ABORT_POST_TASK_CALLBACK]: new TimelineRecordStyle(i18nString(UIStrings.abortPostTaskCallback), defaultCategoryStyles.scripting),
        [Types.Events.Name.V8_CONSOLE_RUN_TASK]: new TimelineRecordStyle(i18nString(UIStrings.consoleTaskRun), defaultCategoryStyles.scripting),
    };
    // TODO(crbug.com/410884528): remove assertion after deduped eventStylesMap for VISIBLE_TRACE_EVENT_TYPES.
    const visibleEventStyles = Object.entries(eventStylesMap).filter(([, style]) => style.hidden === false).map(([key,]) => key);
    const visibleTraceEventsComplete = visibleEventStyles.every(eventType => {
        return Helpers.Trace.VISIBLE_TRACE_EVENT_TYPES.has(eventType);
    });
    const eventStylesMapKeys = Object.keys(eventStylesMap);
    const eventStylesComplete = Array.from(Helpers.Trace.VISIBLE_TRACE_EVENT_TYPES).every(eventType => {
        return eventStylesMapKeys.includes(eventType);
    });
    if (!visibleTraceEventsComplete || !eventStylesComplete) {
        throw new Error('eventStylesMap and VISIBLE_TRACE_EVENT_TYPES are out of sync!');
    }
    return eventStylesMap;
}
export function setEventStylesMap(eventStyles) {
    eventStylesMap = eventStyles;
}
export function setCategories(cats) {
    categoryStyles = cats;
}
export function visibleTypes() {
    const eventStyles = maybeInitSylesMap();
    const result = [];
    for (const name in eventStyles) {
        // Typescript cannot infer that `name` is a key of eventStyles
        const nameAsKey = name;
        if (!eventStyles[nameAsKey]?.hidden) {
            result.push(name);
        }
    }
    return result;
}
export function getTimelineMainEventCategories() {
    if (mainEventCategories) {
        return mainEventCategories;
    }
    mainEventCategories = [
        EventCategory.IDLE,
        EventCategory.LOADING,
        EventCategory.PAINTING,
        EventCategory.RENDERING,
        EventCategory.SCRIPTING,
        EventCategory.OTHER,
    ];
    return mainEventCategories;
}
export function setTimelineMainEventCategories(categories) {
    mainEventCategories = categories;
}
export function markerDetailsForEvent(event) {
    let title = '';
    let color = 'var(--color-text-primary)';
    if (Types.Events.isAnyFirstContentfulPaint(event)) {
        color = 'var(--sys-color-green-bright)';
        title = (Types.Events.isSoftFirstContentfulPaint(event)) ?
            Handlers.ModelHandlers.PageLoadMetrics.MetricName.SOFT_FCP :
            Handlers.ModelHandlers.PageLoadMetrics.MetricName.FCP;
    }
    if (Types.Events.isAnyLargestContentfulPaintCandidate(event)) {
        color = 'var(--sys-color-green)';
        title = Types.Events.isSoftLargestContentfulPaintCandidate(event) ?
            Handlers.ModelHandlers.PageLoadMetrics.MetricName.SOFT_LCP :
            Handlers.ModelHandlers.PageLoadMetrics.MetricName.LCP;
    }
    if (Types.Events.isNavigationStart(event) || Types.Events.isSoftNavigationStart(event)) {
        color = 'var(--color-text-primary)';
        title = Types.Events.isSoftNavigationStart(event) ? Handlers.ModelHandlers.PageLoadMetrics.MetricName.SOFT_NAV :
            Handlers.ModelHandlers.PageLoadMetrics.MetricName.NAV;
    }
    if (Types.Events.isMarkDOMContent(event)) {
        color = 'var(--color-text-disabled)';
        title = Handlers.ModelHandlers.PageLoadMetrics.MetricName.DCL;
    }
    if (Types.Events.isMarkLoad(event)) {
        color = 'var(--color-text-disabled)';
        title = Handlers.ModelHandlers.PageLoadMetrics.MetricName.L;
    }
    return { color, title };
}
//# sourceMappingURL=Styles.js.map