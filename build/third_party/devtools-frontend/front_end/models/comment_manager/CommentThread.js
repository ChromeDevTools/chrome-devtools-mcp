// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
export class CommentThread extends Common.ObjectWrapper.ObjectWrapper {
    static #nextIndex = 1;
    static resetIndex() {
        CommentThread.#nextIndex = 1;
    }
    id = crypto.randomUUID();
    anchor;
    /** True for comments generated from the change tracker. */
    isGeneratedComment;
    #savedIndex;
    comments;
    status = 'DRAFT';
    transmitted = false;
    constructor(options) {
        super();
        this.anchor = options.anchor;
        this.comments = options.comments ?? [];
        this.isGeneratedComment = Boolean(options.isGeneratedComment);
    }
    get index() {
        return this.#savedIndex ?? CommentThread.#nextIndex;
    }
    /**
     * Returns whether it was changed.
     */
    #saveText(text, author = 'DEVELOPER') {
        if (text && text.trim().length > 0) {
            this.comments.push({
                author,
                text: text.trim(),
                timestamp: Date.now(),
            });
            return true;
        }
        return false;
    }
    save(text, author = 'DEVELOPER') {
        let changed = this.#saveText(text, author);
        if (this.status === 'DRAFT') {
            if (this.#savedIndex === undefined) {
                this.#savedIndex = CommentThread.#nextIndex++;
            }
            this.status = 'ACTIVE';
            changed = true;
        }
        if (changed) {
            this.dispatchEventToListeners("Changed" /* Events.CHANGED */);
        }
    }
    editComment(text) {
        const trimmed = text.trim();
        if (this.status !== 'ACTIVE' || !trimmed) {
            return;
        }
        const comment = this.comments.find(c => c.author === 'DEVELOPER');
        if (!comment || comment.text === trimmed) {
            return;
        }
        comment.text = trimmed;
        this.dispatchEventToListeners("Changed" /* Events.CHANGED */);
    }
    sendToAgent(text, author = 'DEVELOPER') {
        let changed = this.#saveText(text, author);
        if (this.status === 'DRAFT' || this.status === 'ACTIVE') {
            if (this.#savedIndex === undefined) {
                this.#savedIndex = CommentThread.#nextIndex++;
            }
            this.status = 'SENT_TO_AGENT';
            changed = true;
        }
        if (changed) {
            this.dispatchEventToListeners("Changed" /* Events.CHANGED */);
        }
    }
    resolve(replyText) {
        if (replyText && replyText.trim().length > 0) {
            this.comments.push({
                author: 'AGENT',
                text: replyText.trim(),
                timestamp: Date.now(),
            });
        }
        if (this.#savedIndex === undefined) {
            this.#savedIndex = CommentThread.#nextIndex++;
        }
        this.status = 'RESOLVED';
        this.dispatchEventToListeners("Changed" /* Events.CHANGED */);
    }
}
//# sourceMappingURL=CommentThread.js.map