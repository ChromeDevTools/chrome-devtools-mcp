// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { ConversationContext } from '../agents/AiAgent.js';
import { FileFormatter } from '../data_formatters/FileFormatter.js';
export class FileContext extends ConversationContext {
    jslogContext = 'ai-context-file';
    #file;
    #debuggerWorkspaceBinding;
    constructor(file, debuggerWorkspaceBinding) {
        super();
        this.#file = file;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
    }
    /**
     * Returns the security origin of the project containing the file, falling
     * back to the origin derived from the file URL.
     */
    getOrigin() {
        return this.#file.securityOrigin();
    }
    getItem() {
        return this.#file;
    }
    getTitle() {
        return this.#file.displayName();
    }
    async getPromptDetails() {
        return `# Selected file\n${new FileFormatter(this.#file, this.#debuggerWorkspaceBinding).formatFile()}`;
    }
    async getUserFacingDetails() {
        return [
            {
                title: 'Selected file',
                text: new FileFormatter(this.#file, this.#debuggerWorkspaceBinding).formatFile(),
            },
        ];
    }
    async refresh() {
        await this.#file.requestContentData();
    }
}
//# sourceMappingURL=FileContext.js.map