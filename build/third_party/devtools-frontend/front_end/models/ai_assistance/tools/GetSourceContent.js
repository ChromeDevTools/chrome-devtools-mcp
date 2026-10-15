// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as TextUtils from '../../../core/text_utils/text_utils.js';
import { FileFormatter } from '../data_formatters/FileFormatter.js';
import { ListSourcesTool } from './ListSources.js';
import { resolveOriginFromLock, } from './Tool.js';
const UIStringsNotTranslate = {
    readingSource: 'Reading source content',
};
const lockedString = i18n.i18n.lockedString;
/**
 * A tool that retrieves the contents of a source file by its unique ID.
 * Filters access by origin lock to prevent cross-origin leakage.
 */
export class GetSourceContentTool {
    name = "getSourceContent" /* ToolName.GET_SOURCE_CONTENT */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Retrieves the formatted content and metadata of a source file by its numeric ID obtained from listSources.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        properties: {
            id: {
                type: 3 /* Host.AidaClient.ParametersTypes.INTEGER */,
                description: 'The unique numeric ID of the source file to retrieve.',
                nullable: false,
            },
        },
        required: ['id'],
    };
    displayInfoFromArgs(args) {
        return {
            title: lockedString(UIStringsNotTranslate.readingSource),
            action: `getSourceContent(${args.id})`,
        };
    }
    async handler(args, context) {
        const originLock = context.getOriginLock();
        const originResult = resolveOriginFromLock(originLock);
        if ('error' in originResult) {
            return originResult;
        }
        const file = ListSourcesTool.getSourceById(args.id, originLock);
        if (!file) {
            return {
                error: 'Unable to find file.',
            };
        }
        const contentData = await file.requestContentData();
        if (TextUtils.ContentData.ContentData.isError(contentData)) {
            return {
                error: `Failed to load file content: ${contentData.error}`,
            };
        }
        const formatter = new FileFormatter(file);
        return {
            result: {
                content: formatter.formatFile(),
            },
        };
    }
}
//# sourceMappingURL=GetSourceContent.js.map