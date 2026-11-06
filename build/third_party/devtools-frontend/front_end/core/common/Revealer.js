// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../i18n/i18n.js';
const UIStrings = {
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    elementsPanel: 'Elements panel',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    stylesSidebar: 'Styles sidebar',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    changesDrawer: 'Changes drawer',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    issuesView: 'Issues view',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    networkPanel: 'Network panel',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    requestConditionsDrawer: 'Request conditions drawer',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    applicationPanel: 'Application panel',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    sourcesPanel: 'Sources panel',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    timelinePanel: 'Performance panel',
    /**
     * @description The UI destination when right-clicking an item that can be revealed.
     */
    memoryInspectorPanel: 'Memory inspector panel',
    /**
     * @description The UI destination when revealing loaded resources through the Developer resources panel.
     */
    developerResourcesPanel: 'Developer resources panel',
    /**
     * @description The UI destination when revealing loaded resources through the Animations panel.
     */
    animationsPanel: 'Animations panel',
    /**
     * @description The UI destination when revealing an item in the Lighthouse panel.
     */
    lighthousePanel: 'Lighthouse panel',
};
const str_ = i18n.i18n.registerUIStrings('core/common/Revealer.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
let revealerRegistry;
/**
 * Registration for revealers, which deals with keeping a list of all possible
 * revealers, lazily instantiating them as necessary and invoking their `reveal`
 * methods depending on the _context types_ they were registered for.
 *
 * @see Revealer
 */
export class RevealerRegistry {
    registeredRevealers = [];
    /**
     * Yields the singleton instance, creating it on-demand when necessary.
     *
     * @returns the singleton instance.
     */
    static instance() {
        if (revealerRegistry === undefined) {
            revealerRegistry = new RevealerRegistry();
        }
        return revealerRegistry;
    }
    /**
     * Clears the singleton instance (if any).
     */
    static removeInstance() {
        revealerRegistry = undefined;
    }
    /**
     * Register a new `Revealer` as described by the `registration`.
     *
     * @param registration the description.
     */
    register(registration) {
        this.registeredRevealers.push(registration);
    }
    /**
     * Reveals the `revealable`.
     *
     * @param revealable the object to reveal.
     * @param omitFocus whether to omit focusing on the presentation of `revealable` afterwards.
     */
    async reveal(revealable, omitFocus) {
        const revealers = await Promise.all(this.getApplicableRegisteredRevealers(revealable).map(registration => registration.loadRevealer()));
        if (revealers.length < 1) {
            throw new Error(`No revealers found for ${revealable}`);
        }
        if (revealers.length > 1) {
            throw new Error(`Conflicting reveals found for ${revealable}`);
        }
        return await revealers[0].reveal(revealable, omitFocus);
    }
    getApplicableRegisteredRevealers(revealable) {
        return this.registeredRevealers.filter(registration => {
            for (const contextType of registration.contextTypes()) {
                if (revealable instanceof contextType) {
                    return true;
                }
            }
            return false;
        });
    }
}
export function revealDestination(revealable) {
    const revealers = RevealerRegistry.instance().getApplicableRegisteredRevealers(revealable);
    for (const { destination } of revealers) {
        if (destination) {
            return destination();
        }
    }
    return null;
}
/**
 * Register a new `Revealer` as described by the `registration` on the singleton
 * {@link RevealerRegistry} instance.
 *
 * @param registration the description.
 */
export function registerRevealer(registration) {
    RevealerRegistry.instance().register(registration);
}
/**
 * Reveals the `revealable` via the singleton {@link RevealerRegistry} instance.
 *
 * @param revealable the object to reveal.
 * @param omitFocus whether to omit focusing on the presentation of `revealable` afterwards.
 */
export async function reveal(revealable, omitFocus = false) {
    await RevealerRegistry.instance().reveal(revealable, omitFocus);
}
export const RevealerDestination = {
    DEVELOPER_RESOURCES_PANEL: i18nLazyString(UIStrings.developerResourcesPanel),
    ELEMENTS_PANEL: i18nLazyString(UIStrings.elementsPanel),
    STYLES_SIDEBAR: i18nLazyString(UIStrings.stylesSidebar),
    CHANGES_DRAWER: i18nLazyString(UIStrings.changesDrawer),
    ISSUES_VIEW: i18nLazyString(UIStrings.issuesView),
    NETWORK_PANEL: i18nLazyString(UIStrings.networkPanel),
    REQUEST_CONDITIONS_DRAWER: i18nLazyString(UIStrings.requestConditionsDrawer),
    TIMELINE_PANEL: i18nLazyString(UIStrings.timelinePanel),
    APPLICATION_PANEL: i18nLazyString(UIStrings.applicationPanel),
    SOURCES_PANEL: i18nLazyString(UIStrings.sourcesPanel),
    MEMORY_INSPECTOR_PANEL: i18nLazyString(UIStrings.memoryInspectorPanel),
    ANIMATIONS_PANEL: i18nLazyString(UIStrings.animationsPanel),
    LIGHTHOUSE_PANEL: i18nLazyString(UIStrings.lighthousePanel),
};
//# sourceMappingURL=Revealer.js.map