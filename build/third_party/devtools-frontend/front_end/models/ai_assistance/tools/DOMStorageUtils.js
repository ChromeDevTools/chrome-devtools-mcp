// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
/**
 * Maximum number of target origins allowed in a single batch query to bound
 * model iteration, memory usage, and CDP traffic.
 */
export const MAX_TARGET_ORIGINS = 100;
/**
 * Resolves active DOM storage partitions from all DOMStorageModel instances
 * matching origin constraints under the primary page target tree.
 *
 * In Chromium, storage is partitioned by StorageKey (origin + top-level site
 * context). A single origin can have multiple distinct storage partitions
 * (e.g. first-party page vs embedded third-party iframe). Furthermore, DevTools
 * creates a separate DOMStorageModel per frame subtarget.
 *
 * This function:
 * 1. Enables DOMStorageModel on-demand for subtargets in the primary page tree.
 * 2. Deduplicates partitions across multiple subtargets sharing the same storageKey.
 * 3. Preserves distinct partition keys for the same origin unless a specific storageKey is requested.
 *
 * @param origin The partition origin to match.
 * @param type The DOM storage type ('localStorage' or 'sessionStorage') to filter for.
 * @param targetManager The TargetManager instance to query for DOMStorageModels.
 * @param primaryPageTarget The primary page target to ensure target-tree containment.
 * @param storageKey Optional. If specified, resolves only the partition matching this unique key.
 * @returns Array of unique DOMStorage partition handles matching constraints.
 */
export function resolveDOMStorages(origin, type, targetManager, primaryPageTarget, storageKey) {
    const resolvedStorages = [];
    const seenStorageKeys = new Set();
    const isLocalStorage = type === 'localStorage';
    const targetOrigin = SDK.SecurityOrigin.SecurityOrigin.create(origin);
    if (targetOrigin.isOpaque()) {
        return [];
    }
    const domStorageModels = targetManager.models(SDK.DOMStorageModel.DOMStorageModel);
    for (const domStorageModel of domStorageModels) {
        // Scope models strictly to the primary page target tree (including subframes and OOPIFs)
        // while ignoring unrelated targets like service workers, extensions, or other tabs.
        if (domStorageModel.target().outermostTarget() !== primaryPageTarget) {
            continue;
        }
        // DOMStorageModel has autostart: false and only populates its storages map when enabled.
        // Ensure the model is enabled on-demand at the moment storage access is requested.
        domStorageModel.enable();
        for (const storage of domStorageModel.storages()) {
            if (storage.isLocalStorage !== isLocalStorage) {
                continue;
            }
            const currentStorageKey = storage.storageKey;
            // In multi-frame or subtarget pages, multiple DOMStorageModel instances can
            // report identical storage keys for the same underlying partition. Deduplicate
            // by storageKey to prevent duplicate partition handles across models (which
            // would cause double-counting storage usage and duplicate CDP requests).
            if (!currentStorageKey || seenStorageKeys.has(currentStorageKey)) {
                continue;
            }
            seenStorageKeys.add(currentStorageKey);
            // If storageKey is specified, only match that exact partition key.
            if (storageKey && storageKey !== currentStorageKey) {
                continue;
            }
            // Parse the serialized StorageKey (e.g. "https://example.com/^0https://top.com") to
            // extract the partition's origin for equivalence comparison.
            const parsedKey = SDK.StorageKeyManager.parseStorageKey(currentStorageKey);
            const parsedOrigin = SDK.SecurityOrigin.SecurityOrigin.create(parsedKey.origin);
            if (parsedOrigin.isSameOriginWith(targetOrigin)) {
                resolvedStorages.push(storage);
            }
        }
    }
    return resolvedStorages;
}
/**
 * Calculates the total size in bytes of all key-value entries across the provided
 * DOMStorage partitions.
 *
 * Transient CDP failures (e.g. target detachment during frame navigation) are caught
 * gracefully to prevent failing the entire storage calculation.
 *
 * @param storages Array of DOMStorage partition handles to inspect.
 * @returns Total storage size in bytes.
 */
export async function calculateDOMStoragesUsage(storages) {
    const itemBatches = await Promise.all(storages.map(storage => storage.getItems().catch(() => null)));
    let totalBytes = 0;
    for (const items of itemBatches) {
        if (items) {
            for (const [key, value] of items) {
                // UTF-16 encoded strings use 2 bytes per character.
                totalBytes += (key.length + value.length) * 2;
            }
        }
    }
    return totalBytes;
}
//# sourceMappingURL=DOMStorageUtils.js.map