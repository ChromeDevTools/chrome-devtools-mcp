// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import { IgnoreListManager } from './IgnoreListManager.js';
import { Events as WorkspaceImplEvents } from './WorkspaceImpl.js';
const UIStrings = {
    /**
     * @description Text for the index of something.
     */
    index: '(index)',
    /**
     * @description Text in UISourceCode of the DevTools local workspace.
     */
    thisFileWasChangedExternally: 'This file was changed externally. Reload?',
};
const str_ = i18n.i18n.registerUIStrings('models/workspace/UISourceCode.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class UISourceCode extends Common.ObjectWrapper.ObjectWrapper {
    #origin;
    #parentURL;
    #securityOrigin;
    #project;
    #url;
    #name;
    #contentType;
    #requestContentPromise = null;
    #decorations = new Map();
    #hasCommits = false;
    #messages = null;
    #content = null;
    #forceLoadOnCheckContent = false;
    #checkingContent = false;
    #lastAcceptedContent = null;
    #workingCopy = null;
    #workingCopyGetter = null;
    #disableEdit = false;
    #contentEncoded;
    #isKnownThirdParty = false;
    #isUnconditionallyIgnoreListed = false;
    constructor(project, url, contentType) {
        super();
        this.#project = project;
        this.#url = url;
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(url);
        if (parsedURL) {
            this.#origin = parsedURL.securityOrigin();
            this.#parentURL = Common.ParsedURL.ParsedURL.concatenate(this.#origin, parsedURL.folderPathComponents);
            if (parsedURL.queryParams && !(parsedURL.lastPathComponent && contentType.isFromSourceMap())) {
                // If there is a query param, display it like a URL. Unless it is from a source map,
                // in which case the query param is probably a hash that is best left hidden.
                this.#name = parsedURL.lastPathComponent + '?' + parsedURL.queryParams;
            }
            else {
                // file name looks best decoded
                try {
                    this.#name = decodeURIComponent(parsedURL.lastPathComponent);
                }
                catch {
                    // Decoding might fail.
                    this.#name = parsedURL.lastPathComponent;
                }
            }
        }
        else {
            this.#origin = Platform.DevToolsPath.EmptyUrlString;
            this.#parentURL = Platform.DevToolsPath.EmptyUrlString;
            this.#name = url;
        }
        this.#contentType = contentType;
    }
    requestMetadata() {
        return this.#project.requestMetadata(this);
    }
    name() {
        return this.#name;
    }
    mimeType() {
        return this.#project.mimeType(this);
    }
    url() {
        return this.#url;
    }
    // Identifier used for deduplicating scripts that are considered by the
    // DevTools UI to be the same script. For now this is just the url but this
    // is likely to change in the future.
    canonicalScriptId() {
        return `${this.#contentType.name()},${this.#url}`;
    }
    parentURL() {
        return this.#parentURL;
    }
    origin() {
        return this.#origin;
    }
    /**
     * Returns the security origin for this source code.
     * Prefers the project security origin if available. If the project does not
     * define a security origin, derives it from the source code's URL and caches
     * the result until the source code is renamed.
     */
    securityOrigin() {
        const projectOrigin = this.#project.securityOrigin?.();
        if (projectOrigin) {
            return projectOrigin;
        }
        if (!this.#securityOrigin) {
            this.#securityOrigin = SDK.SecurityOrigin.SecurityOrigin.create(this.#url);
        }
        return this.#securityOrigin;
    }
    fullDisplayName() {
        return this.#project.fullDisplayName(this);
    }
    displayName(skipTrim) {
        if (!this.#name) {
            return i18nString(UIStrings.index);
        }
        const name = this.#name;
        return skipTrim ? name : Platform.StringUtilities.trimEndWithMaxLength(name, 100);
    }
    canRename() {
        return this.#project.canRename();
    }
    rename(newName) {
        const { resolve, promise } = Promise.withResolvers();
        this.#project.rename(this, newName, innerCallback.bind(this));
        return promise;
        function innerCallback(success, newName, newURL, newContentType) {
            if (success) {
                this.#updateName(newName, newURL, newContentType);
            }
            resolve(success);
        }
    }
    remove() {
        this.#project.deleteFile(this);
    }
    #updateName(name, url, contentType) {
        this.#securityOrigin = undefined;
        const oldURL = this.#url;
        this.#name = name;
        if (url) {
            this.#url = url;
        }
        else {
            this.#url = Common.ParsedURL.ParsedURL.relativePathToUrlString(name, oldURL);
        }
        if (contentType) {
            this.#contentType = contentType;
        }
        this.dispatchEventToListeners(Events.TitleChanged, this);
        this.project().workspace().dispatchEventToListeners(WorkspaceImplEvents.UISourceCodeRenamed, { oldURL, uiSourceCode: this });
    }
    contentURL() {
        return this.url();
    }
    contentType() {
        return this.#contentType;
    }
    project() {
        return this.#project;
    }
    requestContentData({ cachedWasmOnly } = {}) {
        if (this.#requestContentPromise) {
            return this.#requestContentPromise;
        }
        if (this.#content) {
            return Promise.resolve(this.#content);
        }
        if (cachedWasmOnly && this.mimeType() === 'application/wasm') {
            return Promise.resolve(new TextUtils.WasmDisassembly.WasmDisassembly([], [], []));
        }
        this.#requestContentPromise = this.#requestContent();
        return this.#requestContentPromise;
    }
    async #requestContent() {
        if (this.#content) {
            throw new Error('Called UISourceCode#requestContentImpl even though content is available for ' + this.#url);
        }
        try {
            this.#content = await this.#project.requestFileContent(this);
        }
        catch (err) {
            this.#content = { error: err ? String(err) : '' };
        }
        return this.#content;
    }
    #decodeContent(content) {
        if (!content) {
            return null;
        }
        return content.isEncoded && content.content ? atob(content.content) : content.content;
    }
    /** Only used to compare whether content changed */
    #unsafeDecodeContentData(content) {
        if (!content || TextUtils.ContentData.ContentData.isError(content)) {
            return null;
        }
        return content.createdFromBase64 ? atob(content.base64) : content.text;
    }
    async checkContentUpdated() {
        if (!this.#content && !this.#forceLoadOnCheckContent) {
            return;
        }
        if (!this.#project.canSetFileContent() || this.#checkingContent) {
            return;
        }
        this.#checkingContent = true;
        const updatedContent = TextUtils.ContentData.ContentData.asDeferredContent(await this.#project.requestFileContent(this));
        if ('error' in updatedContent) {
            return;
        }
        this.#checkingContent = false;
        if (updatedContent.content === null) {
            const workingCopy = this.workingCopy();
            this.#contentCommitted('', false);
            this.setWorkingCopy(workingCopy);
            return;
        }
        if (this.#lastAcceptedContent === updatedContent.content) {
            return;
        }
        if (this.#unsafeDecodeContentData(this.#content) === this.#decodeContent(updatedContent)) {
            this.#lastAcceptedContent = null;
            return;
        }
        if (!this.isDirty() || this.#workingCopy === updatedContent.content) {
            this.#contentCommitted(updatedContent.content, false);
            return;
        }
        await Common.Revealer.reveal(this);
        // Make sure we are in the next frame before stopping the world with confirm
        await new Promise(resolve => setTimeout(resolve, 0));
        // FIXME: we should not call confirm() from the models.
        const shouldUpdate = typeof globalThis.confirm === 'function' ?
            globalThis.confirm(i18nString(UIStrings.thisFileWasChangedExternally)) :
            true;
        if (shouldUpdate) {
            this.#contentCommitted(updatedContent.content, false);
        }
        else {
            this.#lastAcceptedContent = updatedContent.content;
        }
    }
    forceLoadOnCheckContent() {
        this.#forceLoadOnCheckContent = true;
    }
    #commitContent(content) {
        if (this.#project.canSetFileContent()) {
            void this.#project.setFileContent(this, content, false);
        }
        this.#contentCommitted(content, true);
    }
    #contentCommitted(content, committedByUser) {
        this.#lastAcceptedContent = null;
        this.#content = new TextUtils.ContentData.ContentData(content, Boolean(this.#contentEncoded), this.mimeType());
        this.#requestContentPromise = null;
        this.#hasCommits = true;
        this.#resetWorkingCopy();
        const data = { uiSourceCode: this, content, encoded: this.#contentEncoded };
        this.dispatchEventToListeners(Events.WorkingCopyCommitted, data);
        this.#project.workspace().dispatchEventToListeners(WorkspaceImplEvents.WorkingCopyCommitted, data);
        if (committedByUser) {
            this.#project.workspace().dispatchEventToListeners(WorkspaceImplEvents.WorkingCopyCommittedByUser, data);
        }
    }
    addRevision(content) {
        this.#commitContent(content);
    }
    hasCommits() {
        return this.#hasCommits;
    }
    workingCopy() {
        return this.workingCopyContent().content || '';
    }
    workingCopyContent() {
        return this.workingCopyContentData().asDeferedContent();
    }
    workingCopyContentData() {
        if (this.#workingCopyGetter) {
            this.#workingCopy = this.#workingCopyGetter();
            this.#workingCopyGetter = null;
        }
        const contentData = this.#content ? TextUtils.ContentData.ContentData.contentDataOrEmpty(this.#content) :
            TextUtils.ContentData.EMPTY_TEXT_CONTENT_DATA;
        if (this.#workingCopy !== null) {
            return new TextUtils.ContentData.ContentData(this.#workingCopy, /* isBase64 */ false, contentData.mimeType);
        }
        return contentData;
    }
    resetWorkingCopy() {
        this.#resetWorkingCopy();
        this.#workingCopyChanged();
    }
    #resetWorkingCopy() {
        this.#workingCopy = null;
        this.#workingCopyGetter = null;
    }
    setWorkingCopy(newWorkingCopy) {
        this.#workingCopy = newWorkingCopy;
        this.#workingCopyGetter = null;
        this.#workingCopyChanged();
    }
    setContent(content, isBase64) {
        this.#contentEncoded = isBase64;
        if (this.#project.canSetFileContent()) {
            void this.#project.setFileContent(this, content, isBase64);
        }
        this.#contentCommitted(content, true);
    }
    setWorkingCopyGetter(workingCopyGetter) {
        this.#workingCopyGetter = workingCopyGetter;
        this.#workingCopyChanged();
    }
    #workingCopyChanged() {
        this.#removeAllMessages();
        this.dispatchEventToListeners(Events.WorkingCopyChanged, this);
        this.#project.workspace().dispatchEventToListeners(WorkspaceImplEvents.WorkingCopyChanged, { uiSourceCode: this });
    }
    removeWorkingCopyGetter() {
        if (!this.#workingCopyGetter) {
            return;
        }
        this.#workingCopy = this.#workingCopyGetter();
        this.#workingCopyGetter = null;
    }
    commitWorkingCopy() {
        if (this.isDirty()) {
            this.#commitContent(this.workingCopy());
        }
    }
    isDirty() {
        return this.#workingCopy !== null || this.#workingCopyGetter !== null;
    }
    isKnownThirdParty() {
        return this.#isKnownThirdParty;
    }
    markKnownThirdParty() {
        this.#isKnownThirdParty = true;
    }
    /**
     * {@link markAsUnconditionallyIgnoreListed}
     */
    isUnconditionallyIgnoreListed() {
        return this.#isUnconditionallyIgnoreListed;
    }
    isFetchXHR() {
        return [Common.ResourceType.resourceTypes.XHR, Common.ResourceType.resourceTypes.Fetch].includes(this.contentType());
    }
    /**
     * Unconditionally ignore list this UISourcecode, ignoring any user
     * setting. We use this to mark breakpoint/logpoint condition scripts for now.
     */
    markAsUnconditionallyIgnoreListed() {
        this.#isUnconditionallyIgnoreListed = true;
    }
    extension() {
        return Common.ParsedURL.ParsedURL.extractExtension(this.#name);
    }
    content() {
        if (!this.#content || 'error' in this.#content) {
            return '';
        }
        return this.#content.text;
    }
    loadError() {
        return (this.#content && 'error' in this.#content && this.#content.error) || null;
    }
    searchInContent(query, caseSensitive, isRegex) {
        if (!this.#content || 'error' in this.#content) {
            return this.#project.searchInFileContent(this, query, caseSensitive, isRegex);
        }
        return Promise.resolve(TextUtils.TextUtils.performSearchInContentData(this.#content, query, caseSensitive, isRegex));
    }
    contentLoaded() {
        return Boolean(this.#content);
    }
    uiLocation(lineNumber, columnNumber) {
        return new UILocation(this, lineNumber, columnNumber);
    }
    messages() {
        return this.#messages ? new Set(this.#messages) : new Set();
    }
    addLineMessage(level, text, lineNumber, columnNumber, clickHandler) {
        const range = TextUtils.TextRange.TextRange.createFromLocation(lineNumber, columnNumber || 0);
        const message = new Message(level, text, clickHandler, range);
        this.addMessage(message);
        return message;
    }
    addMessage(message) {
        if (!this.#messages) {
            this.#messages = new Set();
        }
        this.#messages.add(message);
        this.dispatchEventToListeners(Events.MessageAdded, message);
    }
    removeMessage(message) {
        if (this.#messages?.delete(message)) {
            this.dispatchEventToListeners(Events.MessageRemoved, message);
        }
    }
    #removeAllMessages() {
        if (!this.#messages) {
            return;
        }
        for (const message of this.#messages) {
            this.dispatchEventToListeners(Events.MessageRemoved, message);
        }
        this.#messages = null;
    }
    setDecorationData(type, data) {
        if (data !== this.#decorations.get(type)) {
            this.#decorations.set(type, data);
            this.dispatchEventToListeners(Events.DecorationChanged, type);
        }
    }
    getDecorationData(type) {
        return this.#decorations.get(type);
    }
    disableEdit() {
        this.#disableEdit = true;
    }
    editDisabled() {
        return this.#disableEdit;
    }
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    isIgnoreListed(ignoreListManager = IgnoreListManager.instance()) {
        return ignoreListManager.isUserOrSourceMapIgnoreListedUISourceCode(this);
    }
}
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["WorkingCopyChanged"] = "WorkingCopyChanged";
    Events["WorkingCopyCommitted"] = "WorkingCopyCommitted";
    Events["TitleChanged"] = "TitleChanged";
    Events["MessageAdded"] = "MessageAdded";
    Events["MessageRemoved"] = "MessageRemoved";
    Events["DecorationChanged"] = "DecorationChanged";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
export class UILocation {
    uiSourceCode;
    lineNumber;
    columnNumber;
    constructor(uiSourceCode, lineNumber, columnNumber) {
        this.uiSourceCode = uiSourceCode;
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber;
    }
    linkText(skipTrim = false, showColumnNumber = false) {
        const displayName = this.uiSourceCode.displayName(skipTrim);
        const lineAndColumnText = this.lineAndColumnText(showColumnNumber);
        let text = lineAndColumnText ? displayName + ':' + lineAndColumnText : displayName;
        if (this.uiSourceCode.isDirty()) {
            text = '*' + text;
        }
        return text;
    }
    lineAndColumnText(showColumnNumber = false) {
        let lineAndColumnText;
        if (this.uiSourceCode.mimeType() === 'application/wasm') {
            // For WebAssembly locations, we follow the conventions described in
            // github.com/WebAssembly/design/blob/master/Web.md#developer-facing-display-conventions
            if (typeof this.columnNumber === 'number') {
                lineAndColumnText = `0x${this.columnNumber.toString(16)}`;
            }
        }
        else {
            lineAndColumnText = `${this.lineNumber + 1}`;
            if (showColumnNumber && typeof this.columnNumber === 'number') {
                lineAndColumnText += ':' + (this.columnNumber + 1);
            }
        }
        return lineAndColumnText;
    }
    id() {
        if (typeof this.columnNumber === 'number') {
            return this.uiSourceCode.project().id() + ':' + this.uiSourceCode.url() + ':' + this.lineNumber + ':' +
                this.columnNumber;
        }
        return this.lineId();
    }
    lineId() {
        return this.uiSourceCode.project().id() + ':' + this.uiSourceCode.url() + ':' + this.lineNumber;
    }
    static comparator(location1, location2) {
        return location1.compareTo(location2);
    }
    compareTo(other) {
        if (this.uiSourceCode.url() !== other.uiSourceCode.url()) {
            return this.uiSourceCode.url() > other.uiSourceCode.url() ? 1 : -1;
        }
        if (this.lineNumber !== other.lineNumber) {
            return this.lineNumber - other.lineNumber;
        }
        // We consider `undefined` less than an actual column number, since
        // UI location without a column number corresponds to the whole line.
        if (this.columnNumber === other.columnNumber) {
            return 0;
        }
        if (typeof this.columnNumber !== 'number') {
            return -1;
        }
        if (typeof other.columnNumber !== 'number') {
            return 1;
        }
        return this.columnNumber - other.columnNumber;
    }
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    isIgnoreListed(ignoreListManager = IgnoreListManager.instance()) {
        return this.uiSourceCode.isIgnoreListed(ignoreListManager);
    }
}
/**
 * A text range inside a specific {@link UISourceCode}.
 *
 * We use a class instead of an interface so we can implement a revealer for it.
 */
export class UILocationRange {
    uiSourceCode;
    range;
    constructor(uiSourceCode, range) {
        this.uiSourceCode = uiSourceCode;
        this.range = range;
    }
}
/**
 * A text range inside a specific {@link UISourceCode}, representing a function.
 */
export class UIFunctionBounds {
    uiSourceCode;
    range;
    name;
    constructor(uiSourceCode, range, name) {
        this.uiSourceCode = uiSourceCode;
        this.range = range;
        this.name = name;
    }
}
/**
 * A message associated with a range in a `UISourceCode`. The range will be
 * underlined starting at the range's start and ending at the line end (the
 * end of the range is currently disregarded).
 * An icon is going to appear at the end of the line according to the
 * `level` of the Message. This is only the model; displaying is handled
 * where UISourceCode displaying is handled.
 */
export class Message {
    #level;
    #text;
    range;
    #clickHandler;
    constructor(level, text, clickHandler, range) {
        this.#level = level;
        this.#text = text;
        this.range = range ?? new TextUtils.TextRange.TextRange(0, 0, 0, 0);
        this.#clickHandler = clickHandler;
    }
    level() {
        return this.#level;
    }
    text() {
        return this.#text;
    }
    clickHandler() {
        return this.#clickHandler;
    }
    lineNumber() {
        return this.range.startLine;
    }
    columnNumber() {
        return this.range.startColumn;
    }
    isEqual(another) {
        return this.text() === another.text() && this.level() === another.level() && this.range.equal(another.range);
    }
}
(function (Message) {
    let Level;
    (function (Level) {
        Level["ERROR"] = "Error";
        Level["ISSUE"] = "Issue";
        Level["WARNING"] = "Warning";
    })(Level = Message.Level || (Message.Level = {}));
})(Message || (Message = {}));
export class UISourceCodeMetadata {
    modificationTime;
    contentSize;
    constructor(modificationTime, contentSize) {
        this.modificationTime = modificationTime;
        this.contentSize = contentSize;
    }
}
export var DecoratorType;
(function (DecoratorType) {
    DecoratorType["PERFORMANCE"] = "performance";
    DecoratorType["COVERAGE"] = "coverage";
})(DecoratorType || (DecoratorType = {}));
/**
 * Converts an existing LineColumnProfileMap to a new one using the provided mapping.
 *
 * The input and output line/column of originalToMappedLocation is 0-indexed.
 */
export function createMappedProfileData(profileData, originalToMappedLocation) {
    const mappedProfileData = new Map();
    for (const [lineNumber, columnData] of profileData) {
        for (const [columnNumber, data] of columnData) {
            const mappedLocation = originalToMappedLocation(lineNumber - 1, columnNumber - 1);
            if (!mappedLocation) {
                continue;
            }
            const oneBasedFormattedLineNumber = mappedLocation[0] + 1;
            const oneBasedFormattedColumnNumber = mappedLocation[1] + 1;
            let mappedColumnData = mappedProfileData.get(oneBasedFormattedLineNumber);
            if (!mappedColumnData) {
                mappedColumnData = new Map();
                mappedProfileData.set(oneBasedFormattedLineNumber, mappedColumnData);
            }
            mappedColumnData.set(oneBasedFormattedColumnNumber, (mappedColumnData.get(oneBasedFormattedColumnNumber) || 0) + data);
        }
    }
    return mappedProfileData;
}
//# sourceMappingURL=UISourceCode.js.map