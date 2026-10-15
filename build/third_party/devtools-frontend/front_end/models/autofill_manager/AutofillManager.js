// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
export class AutofillManager extends Common.ObjectWrapper.ObjectWrapper {
    #targetManager;
    #address = '';
    #filledFields = [];
    #matches = [];
    #autofillModel = null;
    #frameManager;
    constructor(targetManager, frameManager) {
        super();
        this.#targetManager = targetManager;
        this.#frameManager = frameManager;
        targetManager.addModelListener(SDK.AutofillModel.AutofillModel, "AddressFormFilled" /* SDK.AutofillModel.Events.ADDRESS_FORM_FILLED */, this.#addressFormFilled, this, { scoped: true });
    }
    async #addressFormFilled({ data }) {
        this.#autofillModel = data.autofillModel;
        this.#processAddressFormFilledData(data.event);
        if (this.#address) {
            this.dispatchEventToListeners("AddressFormFilled" /* Events.ADDRESS_FORM_FILLED */, {
                address: this.#address,
                filledFields: this.#filledFields,
                matches: this.#matches,
            });
        }
    }
    getLastFilledAddressForm() {
        if (!this.#address || !this.#autofillModel) {
            return null;
        }
        return {
            address: this.#address,
            filledFields: this.#filledFields,
            matches: this.#matches,
        };
    }
    highlightFilledField(filledField) {
        const backendNodeId = filledField.fieldId;
        const target = this.#frameManager.getFrame(filledField.frameId)?.resourceTreeModel().target();
        if (target) {
            const deferredNode = new SDK.DOMModel.DeferredDOMNode(target, backendNodeId);
            const domModel = target.model(SDK.DOMModel.DOMModel);
            if (deferredNode && domModel) {
                domModel.overlayModel().highlightInOverlay({ deferredNode }, 'all');
            }
        }
    }
    clearHighlightedFilledFields() {
        SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight(this.#targetManager);
    }
    #processAddressFormFilledData({ addressUi, filledFields }) {
        // Transform addressUi into a single (multi-line) string.
        const concatAddressFields = (addressFields) => addressFields.fields.filter(field => field.value.length).map(field => field.value).join(' ');
        this.#address = addressUi.addressFields.map(addressFields => concatAddressFields(addressFields))
            .filter(str => str.length)
            .join('\n');
        this.#filledFields = filledFields;
        this.#matches = [];
        // Populate a list of matches by searching in the address string for
        // occurences of filled field values.
        for (let i = 0; i < this.#filledFields.length; i++) {
            if (this.#filledFields[i].value === '') {
                continue;
            }
            // 1) Replace multiple whitespaces with a single space.
            // 2) Escape special characters.
            // 3) For ',' or '.' before whitespace, insert the '?' quantifier.
            const needle = Platform.StringUtilities.escapeForRegExp(this.#filledFields[i].value.replaceAll(/\s/g, ' '))
                .replaceAll(/([.,]+)\s/g, '$1? ');
            const matches = this.#address.replaceAll(/\s/g, ' ').matchAll(new RegExp(needle, 'g'));
            for (const match of matches) {
                if (typeof match.index !== 'undefined') {
                    this.#matches.push({ startIndex: match.index, endIndex: match.index + match[0].length, filledFieldIndex: i });
                }
            }
        }
    }
}
//# sourceMappingURL=AutofillManager.js.map