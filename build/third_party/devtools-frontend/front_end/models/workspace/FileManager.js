// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
export class FileManager extends Common.ObjectWrapper.ObjectWrapper {
    #saveCallbacks = new Map();
    #eventDescriptors;
    constructor() {
        super();
        this.#eventDescriptors = [
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.SavedURL, this.savedURL, this),
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.CanceledSaveURL, this.#canceledSavedURL, this),
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.AppendedToURL, this.appendedToURL, this),
        ];
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventDescriptors);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!Root.DevToolsContext.globalInstance().has(FileManager) || forceNew) {
            Root.DevToolsContext.globalInstance().set(FileManager, new FileManager());
        }
        return Root.DevToolsContext.globalInstance().get(FileManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(FileManager);
    }
    /**
     * {@link FileManager.close | close} *must* be called, for the InspectorFrontendHostStub case, to complete the saving.
     * @param url The url of the file to save. **NOTE:** The backend truncates this filename to 64 characters.
     */
    save(url, contentData, forceSaveAs) {
        // Remove this url from the saved URLs while it is being saved.
        const result = new Promise(resolve => this.#saveCallbacks.set(url, resolve));
        const { isTextContent } = contentData;
        const content = isTextContent ? contentData.text : contentData.base64;
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.save(url, content, forceSaveAs, !isTextContent);
        return result;
    }
    /**
     * Used in web tests
     */
    savedURL(event) {
        const { url, fileSystemPath } = event.data;
        const callback = this.#saveCallbacks.get(url);
        this.#saveCallbacks.delete(url);
        if (callback) {
            callback({ fileSystemPath });
        }
    }
    #canceledSavedURL({ data: url }) {
        const callback = this.#saveCallbacks.get(url);
        this.#saveCallbacks.delete(url);
        if (callback) {
            callback(null);
        }
    }
    append(url, content) {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.append(url, content);
    }
    close(url) {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.close(url);
    }
    /**
     * Used in web tests
     */
    appendedToURL({ data: url }) {
        this.dispatchEventToListeners("AppendedToURL" /* Events.APPENDED_TO_URL */, url);
    }
}
//# sourceMappingURL=FileManager.js.map