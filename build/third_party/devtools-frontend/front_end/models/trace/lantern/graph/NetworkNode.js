// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { BaseNode } from './BaseNode.js';
const NON_NETWORK_SCHEMES = [
    'blob', // @see https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
    'data', // @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
    'intent', // @see https://developer.chrome.com/docs/multidevice/android/intents/
    'file', // @see https://en.wikipedia.org/wiki/File_URI_scheme
    'filesystem', // @see https://developer.mozilla.org/en-US/docs/Web/API/FileSystem
    'chrome-extension',
];
/**
 * Note: the `protocol` field from CDP can be 'h2', 'http', (not 'https'!) or it'll be url's scheme.
 *   https://source.chromium.org/chromium/chromium/src/+/main:content/browser/devtools/protocol/network_handler.cc;l=598-611;drc=56d4a9a9deb30be73adcee8737c73bcb2a5ab64f
 * However, a `new URL(href).protocol` has a colon suffix.
 *   https://url.spec.whatwg.org/#dom-url-protocol
 * A URL's `scheme` is specced as the `protocol` sans-colon, but isn't exposed on a URL object.
 * This method can take all 3 of these string types as a parameter.
 *
 * @param protocol Either a networkRequest's `protocol` per CDP or a `new URL(href).protocol`
 */
function isNonNetworkProtocol(protocol) {
    // Strip off any colon
    const urlScheme = protocol.includes(':') ? protocol.slice(0, protocol.indexOf(':')) : protocol;
    return NON_NETWORK_SCHEMES.includes(urlScheme);
}
class NetworkNode extends BaseNode {
    _request;
    constructor(networkRequest) {
        super(networkRequest.requestId);
        this._request = networkRequest;
    }
    get type() {
        return BaseNode.types.NETWORK;
    }
    get startTime() {
        return this._request.rendererStartTime * 1000;
    }
    get endTime() {
        return this._request.networkEndTime * 1000;
    }
    get rawRequest() {
        return this._request.rawRequest;
    }
    get request() {
        return this._request;
    }
    get initiatorType() {
        return this._request.initiator.type;
    }
    get fromDiskCache() {
        return Boolean(this._request.fromDiskCache);
    }
    get isNonNetworkProtocol() {
        // The 'protocol' field in devtools a string more like a `scheme`
        return isNonNetworkProtocol(this.request.protocol) ||
            // But `protocol` can fail to be populated if the request fails, so fallback to scheme.
            isNonNetworkProtocol(this.request.parsedURL.scheme);
    }
    /**
     * Returns whether this network request can be downloaded without a TCP connection.
     * During simulation we treat data coming in over a network connection separately from on-device data.
     */
    get isConnectionless() {
        return this.fromDiskCache || this.isNonNetworkProtocol;
    }
    hasRenderBlockingPriority() {
        const renderBlocking = this._request.renderBlocking;
        if (renderBlocking === 'non_blocking' || renderBlocking === 'dynamically_injected_non_blocking' ||
            renderBlocking === 'potentially_blocking') {
            return false;
        }
        if (renderBlocking === 'blocking') {
            return true;
        }
        // Used when `renderBlocking === 'in_body_parser_blocking'` (where only
        // early, High-priority in-body scripts should be considered blocking; see
        // RenderBlocking.ts) or when `renderBlocking` is undefined (Documents,
        // legacy trace fixtures, or CDP logs prior to M145).
        const priority = this._request.priority;
        const isScript = this._request.resourceType === 'Script';
        const isDocument = this._request.resourceType === 'Document';
        const isBlockingScript = priority === 'High' && isScript;
        const isBlockingHtmlImport = priority === 'High' && isDocument;
        return priority === 'VeryHigh' || isBlockingScript || isBlockingHtmlImport;
    }
    cloneWithoutRelationships() {
        const node = new NetworkNode(this._request);
        node.setIsMainDocument(this._isMainDocument);
        return node;
    }
}
export { NetworkNode };
//# sourceMappingURL=NetworkNode.js.map