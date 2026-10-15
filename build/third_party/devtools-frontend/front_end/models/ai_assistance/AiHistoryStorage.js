// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Root from '../../core/root/root.js';
const DEFAULT_MAX_STORAGE_SIZE = 50 * 1024 * 1024;
export const MAX_RECENT_PROMPTS_COUNT = 20;
export const MAX_CONVERSATIONS_COUNT = 50;
export const RECENT_PROMPTS_SIZE_LIMIT = 100 * 1024;
export class AiHistoryStorage extends Common.ObjectWrapper.ObjectWrapper {
    #historySetting;
    #imageHistorySettings;
    #recentPromptsSetting;
    #mutex = new Common.Mutex.Mutex();
    #maxStorageSize;
    constructor(
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    settings = Common.Settings.Settings.instance(), maxStorageSize = DEFAULT_MAX_STORAGE_SIZE) {
        super();
        this.#historySetting = settings.createSetting('ai-assistance-history-entries', []);
        this.#imageHistorySettings = settings.createSetting('ai-assistance-history-images', []);
        this.#recentPromptsSetting = settings.createSetting('ai-assistance-recent-prompts', []);
        this.#maxStorageSize = maxStorageSize;
    }
    clearForTest() {
        this.#historySetting.set([]);
        this.#imageHistorySettings.set([]);
        this.#recentPromptsSetting.set([]);
    }
    async addRecentPrompt(prompt) {
        if (!prompt.trim()) {
            return;
        }
        const release = await this.#mutex.acquire();
        try {
            const recentPrompts = await this.#recentPromptsSetting.forceGet();
            const updatedPrompts = [prompt, ...recentPrompts.filter(p => p !== prompt)];
            const promptsToBeStored = [];
            let currentStorageSize = 0;
            for (const p of updatedPrompts) {
                if (promptsToBeStored.length >= MAX_RECENT_PROMPTS_COUNT) {
                    break;
                }
                if (currentStorageSize + p.length > RECENT_PROMPTS_SIZE_LIMIT) {
                    break;
                }
                currentStorageSize += p.length;
                promptsToBeStored.push(p);
            }
            this.#recentPromptsSetting.set(promptsToBeStored);
        }
        finally {
            release();
        }
    }
    getRecentPrompts() {
        return structuredClone(this.#recentPromptsSetting.get());
    }
    #getImageIdsFromHistory(history) {
        return history.flatMap(item => {
            if (item.type === "user-query" /* ResponseType.USER_QUERY */ && item.imageId) {
                return [item.imageId];
            }
            return [];
        });
    }
    async upsertHistoryEntry(agentEntry) {
        const release = await this.#mutex.acquire();
        try {
            const history = structuredClone(await this.#historySetting.forceGet());
            const historyEntryIndex = history.findIndex(entry => entry.id === agentEntry.id);
            if (historyEntryIndex !== -1) {
                history[historyEntryIndex] = agentEntry;
            }
            else {
                history.push(agentEntry);
            }
            // Using a while loop to ensure that if the history size exceeds the maximum limit
            // (e.g. if the limit was reduced or settings contain legacy entries), we prune
            // all extra entries at once. We also collect and batch image deletion to avoid
            // multiple settings writes.
            const imageIdsForDeletion = [];
            while (history.length > MAX_CONVERSATIONS_COUNT) {
                const evicted = history.shift();
                if (evicted) {
                    imageIdsForDeletion.push(...this.#getImageIdsFromHistory(evicted.history));
                }
            }
            if (imageIdsForDeletion.length > 0) {
                const images = structuredClone(await this.#imageHistorySettings.forceGet());
                this.#imageHistorySettings.set(images.filter(entry => !imageIdsForDeletion.includes(entry.id)));
            }
            this.#historySetting.set(history);
        }
        finally {
            release();
        }
    }
    async upsertImage(image) {
        const release = await this.#mutex.acquire();
        try {
            const imageHistory = structuredClone(await this.#imageHistorySettings.forceGet());
            const imageHistoryEntryIndex = imageHistory.findIndex(entry => entry.id === image.id);
            if (imageHistoryEntryIndex !== -1) {
                imageHistory[imageHistoryEntryIndex] = image;
            }
            else {
                imageHistory.push(image);
            }
            const imagesToBeStored = [];
            let currentStorageSize = 0;
            for (const [, serializedImage] of Array
                .from(imageHistory.entries())
                .reverse()) {
                if (currentStorageSize >= this.#maxStorageSize) {
                    break;
                }
                currentStorageSize += serializedImage.data.length;
                imagesToBeStored.push(serializedImage);
            }
            this.#imageHistorySettings.set(imagesToBeStored.reverse());
        }
        finally {
            release();
        }
    }
    async deleteHistoryEntry(id) {
        const release = await this.#mutex.acquire();
        try {
            const history = structuredClone(await this.#historySetting.forceGet());
            const conversation = history.find(entry => entry.id === id);
            if (!conversation) {
                return;
            }
            const imageIdsForDeletion = this.#getImageIdsFromHistory(conversation.history);
            this.#historySetting.set(history.filter(entry => entry.id !== id));
            if (imageIdsForDeletion.length > 0) {
                const images = structuredClone(await this.#imageHistorySettings.forceGet());
                this.#imageHistorySettings.set(images.filter(entry => !imageIdsForDeletion.includes(entry.id)));
            }
        }
        finally {
            release();
        }
    }
    async deleteAll() {
        const release = await this.#mutex.acquire();
        try {
            this.#historySetting.set([]);
            this.#imageHistorySettings.set([]);
            this.#recentPromptsSetting.set([]);
        }
        finally {
            release();
            this.dispatchEventToListeners("AiHistoryDeleted" /* Events.HISTORY_DELETED */);
        }
    }
    getHistory() {
        return structuredClone(this.#historySetting.get());
    }
    getImageHistory() {
        return structuredClone(this.#imageHistorySettings.get());
    }
    static instance(opts = { forceNew: false, maxStorageSize: DEFAULT_MAX_STORAGE_SIZE }) {
        const { forceNew, maxStorageSize, settings } = opts;
        if (!Root.DevToolsContext.globalInstance().has(AiHistoryStorage) || forceNew) {
            Root.DevToolsContext.globalInstance().set(AiHistoryStorage, new AiHistoryStorage(
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            settings ?? Common.Settings.Settings.instance(), maxStorageSize));
        }
        return Root.DevToolsContext.globalInstance().get(AiHistoryStorage);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(AiHistoryStorage);
    }
}
//# sourceMappingURL=AiHistoryStorage.js.map