// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Workspace from '../../workspace/workspace.js';
import { isOriginAllowedByLock, resolveOriginFromLock, } from './Tool.js';
const UIStringsNotTranslate = {
    listingSources: 'Listing workspace sources',
};
const lockedString = i18n.i18n.lockedString;
/**
 * A tool that lists all network source files in the workspace.
 * Each file is returned with its displayName and a unique session-based numeric ID.
 */
export class ListSourcesTool {
    name = "listSources" /* ToolName.LIST_SOURCES */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Lists deployed and authored source files in the workspace (including source-mapped files) with their display name and unique numeric ID.';
    static lastSourceId = 0;
    static uiSourceCodeId = new WeakMap();
    static idToUiSourceCode = new Map();
    static reset() {
        ListSourcesTool.lastSourceId = 0;
        ListSourcesTool.uiSourceCodeId = new WeakMap();
        ListSourcesTool.idToUiSourceCode = new Map();
    }
    static getUISourceCodes(originLock, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    workspace = Workspace.Workspace.WorkspaceImpl.instance()) {
        if (originLock.status !== 'ESTABLISHED_ORIGIN' || originLock.origin.isOpaque()) {
            return [];
        }
        const uiSourceCodes = new Map();
        for (const project of workspace.projectsForType(Workspace.Workspace.projectTypes.Network)) {
            const projectOrigin = project.securityOrigin?.();
            if (projectOrigin && !isOriginAllowedByLock(originLock, projectOrigin)) {
                continue;
            }
            for (const uiSourceCode of project.uiSourceCodes()) {
                if (uiSourceCode.isIgnoreListed()) {
                    continue;
                }
                if (!projectOrigin && !isOriginAllowedByLock(originLock, uiSourceCode.securityOrigin())) {
                    continue;
                }
                const url = uiSourceCode.url();
                if (!uiSourceCodes.get(url) || uiSourceCode.contentType().isFromSourceMap()) {
                    uiSourceCodes.set(url, uiSourceCode);
                    if (!ListSourcesTool.uiSourceCodeId.has(uiSourceCode)) {
                        const id = ++ListSourcesTool.lastSourceId;
                        ListSourcesTool.uiSourceCodeId.set(uiSourceCode, id);
                        ListSourcesTool.idToUiSourceCode.set(id, uiSourceCode);
                    }
                }
            }
        }
        return Array.from(uiSourceCodes.values());
    }
    static getSourceById(id, originLock) {
        if (!Number.isInteger(id) || id <= 0) {
            return undefined;
        }
        const file = ListSourcesTool.idToUiSourceCode.get(id);
        if (!file || !isOriginAllowedByLock(originLock, file.securityOrigin())) {
            return undefined;
        }
        return file;
    }
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: true,
        required: [],
        properties: {},
    };
    displayInfoFromArgs() {
        return {
            title: lockedString(UIStringsNotTranslate.listingSources),
            action: 'listSources()',
        };
    }
    async handler(_params, context) {
        const originLock = context.getOriginLock();
        const originResult = resolveOriginFromLock(originLock);
        if ('error' in originResult) {
            return originResult;
        }
        const files = ListSourcesTool.getUISourceCodes(originLock);
        return {
            result: {
                files: files.map(file => ({
                    id: ListSourcesTool.uiSourceCodeId.get(file) ?? 0,
                    name: file.fullDisplayName(),
                })),
            },
        };
    }
}
//# sourceMappingURL=ListSources.js.map