// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
export function resourceForURL(url) {
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    return SDK.ResourceTreeModel.ResourceTreeModel.resourceForURL(SDK.TargetManager.TargetManager.instance(), url);
}
export function displayNameForURL(url) {
    if (!url) {
        return '';
    }
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    const uiSourceCode = Workspace.Workspace.WorkspaceImpl.instance().uiSourceCodeForURL(url);
    if (uiSourceCode) {
        return uiSourceCode.displayName();
    }
    const resource = resourceForURL(url);
    if (resource) {
        return resource.displayName;
    }
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    const inspectedURL = SDK.TargetManager.TargetManager.instance().inspectedURL();
    if (!inspectedURL) {
        return Platform.StringUtilities.trimURL(url, '');
    }
    const parsedURL = Common.ParsedURL.ParsedURL.fromString(inspectedURL);
    if (!parsedURL) {
        return url;
    }
    const lastPathComponent = parsedURL.lastPathComponent;
    const index = inspectedURL.indexOf(lastPathComponent);
    if (index !== -1 && index + lastPathComponent.length === inspectedURL.length) {
        const baseURL = inspectedURL.substring(0, index);
        if (url.startsWith(baseURL) && url.length > index) {
            return url.substring(index);
        }
    }
    const displayName = Platform.StringUtilities.trimURL(url, parsedURL.host);
    return displayName === '/' ? parsedURL.host + '/' : displayName;
}
export function metadataForURL(target, frameId, url) {
    const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
    if (!resourceTreeModel) {
        return null;
    }
    const frame = resourceTreeModel.frameForId(frameId);
    if (!frame) {
        return null;
    }
    return resourceMetadata(frame.resourceForURL(url));
}
export function resourceMetadata(resource) {
    if (!resource || (typeof resource.contentSize() !== 'number' && !resource.lastModified())) {
        return null;
    }
    return new Workspace.UISourceCode.UISourceCodeMetadata(resource.lastModified(), resource.contentSize());
}
//# sourceMappingURL=ResourceUtils.js.map