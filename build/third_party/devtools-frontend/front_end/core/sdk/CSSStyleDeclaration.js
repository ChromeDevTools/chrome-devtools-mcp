// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../text_utils/text_utils.js';
import { cssMetadata } from './CSSMetadata.js';
import { CSSProperty } from './CSSProperty.js';
export class CSSStyleDeclaration {
    #cssModel;
    parentRule;
    #allProperties = [];
    styleSheetId;
    range = null;
    cssText;
    #shorthandValues = new Map();
    #shorthandIsImportant = new Set();
    #activePropertyMap = new Map();
    #leadingProperties = null;
    type;
    // For CSSStyles coming from animations,
    // This holds the name of the animation.
    #animationName;
    constructor(cssModel, parentRule, payload, type, animationName) {
        this.#cssModel = cssModel;
        this.parentRule = parentRule;
        this.#reinitialize(payload);
        this.type = type;
        this.#animationName = animationName;
    }
    rebase(edit) {
        if (this.styleSheetId !== edit.styleSheetId || !this.range) {
            return;
        }
        if (edit.oldRange.equal(this.range)) {
            this.#reinitialize(edit.payload);
        }
        else {
            this.range = this.range.rebaseAfterTextEdit(edit.oldRange, edit.newRange);
            for (let i = 0; i < this.#allProperties.length; ++i) {
                this.#allProperties[i].rebase(edit);
            }
        }
    }
    animationName() {
        return this.#animationName;
    }
    #reinitialize(payload) {
        this.styleSheetId = payload.styleSheetId;
        this.range = payload.range ? TextUtils.TextRange.TextRange.fromObject(payload.range) : null;
        const shorthandEntries = payload.shorthandEntries;
        this.#shorthandValues = new Map();
        this.#shorthandIsImportant = new Set();
        for (let i = 0; i < shorthandEntries.length; ++i) {
            this.#shorthandValues.set(shorthandEntries[i].name, shorthandEntries[i].value);
            if (shorthandEntries[i].important) {
                this.#shorthandIsImportant.add(shorthandEntries[i].name);
            }
        }
        this.#allProperties = [];
        if (payload.cssText && this.range) {
            const longhands = [];
            for (const cssProperty of payload.cssProperties) {
                const range = cssProperty.range;
                if (!range) {
                    continue;
                }
                const parsedProperty = CSSProperty.parsePayload(this, this.#allProperties.length, cssProperty);
                this.#allProperties.push(parsedProperty);
                for (const longhand of parsedProperty.getLonghandProperties()) {
                    longhands.push(longhand);
                }
            }
            for (const longhand of longhands) {
                longhand.index = this.#allProperties.length;
                this.#allProperties.push(longhand);
            }
        }
        else {
            for (const cssProperty of payload.cssProperties) {
                this.#allProperties.push(CSSProperty.parsePayload(this, this.#allProperties.length, cssProperty));
            }
        }
        this.#generateSyntheticPropertiesIfNeeded();
        this.#computeInactiveProperties();
        // TODO(changhaohan): verify if this #activePropertyMap is still necessary, or if it is
        // providing different information against the activeness in #allProperties.
        this.#activePropertyMap = new Map();
        for (const property of this.#allProperties) {
            if (!property.activeInStyle()) {
                continue;
            }
            this.#activePropertyMap.set(property.name, property);
        }
        this.cssText = payload.cssText;
        this.#leadingProperties = null;
    }
    #generateSyntheticPropertiesIfNeeded() {
        if (this.range) {
            return;
        }
        if (!this.#shorthandValues.size) {
            return;
        }
        const propertiesSet = new Set();
        for (const property of this.#allProperties) {
            propertiesSet.add(property.name);
        }
        const generatedProperties = [];
        // For style-based properties, generate #shorthands with values when possible.
        for (const property of this.#allProperties) {
            // For style-based properties, try generating #shorthands.
            const shorthands = cssMetadata().getShorthands(property.name) || [];
            for (const shorthand of shorthands) {
                if (propertiesSet.has(shorthand)) {
                    continue;
                } // There already is a shorthand this #longhand falls under.
                const shorthandValue = this.#shorthandValues.get(shorthand);
                if (!shorthandValue) {
                    continue;
                } // Never generate synthetic #shorthands when no value is available.
                // Generate synthetic shorthand we have a value for.
                const shorthandImportance = Boolean(this.#shorthandIsImportant.has(shorthand));
                const shorthandProperty = new CSSProperty(this, this.allProperties().length, shorthand, shorthandValue, shorthandImportance, false, true, false);
                generatedProperties.push(shorthandProperty);
                propertiesSet.add(shorthand);
            }
        }
        this.#allProperties = this.#allProperties.concat(generatedProperties);
    }
    #computeLeadingProperties() {
        function propertyHasRange(property) {
            return Boolean(property.range);
        }
        if (this.range) {
            return this.#allProperties.filter(propertyHasRange);
        }
        const leadingProperties = [];
        for (const property of this.#allProperties) {
            const shorthands = cssMetadata().getShorthands(property.name) || [];
            let belongToAnyShorthand = false;
            for (const shorthand of shorthands) {
                if (this.#shorthandValues.get(shorthand)) {
                    belongToAnyShorthand = true;
                    break;
                }
            }
            if (!belongToAnyShorthand) {
                leadingProperties.push(property);
            }
        }
        return leadingProperties;
    }
    leadingProperties() {
        if (!this.#leadingProperties) {
            this.#leadingProperties = this.#computeLeadingProperties();
        }
        return this.#leadingProperties;
    }
    target() {
        return this.#cssModel.target();
    }
    cssModel() {
        return this.#cssModel;
    }
    #computeInactiveProperties() {
        const activeProperties = new Map();
        // The order of the properties are:
        // 1. regular property, including shorthands
        // 2. longhand components from shorthands, in the order of their shorthands.
        const processedLonghands = new Set();
        for (const property of this.#allProperties) {
            const metadata = cssMetadata();
            const canonicalName = metadata.canonicalPropertyName(property.name);
            if (property.disabled || !property.parsedOk) {
                if (!property.disabled && metadata.isCustomProperty(property.name)) {
                    // Variable declarations that aren't parsedOk still "overload" other previous active declarations.
                    activeProperties.get(canonicalName)?.setActive(false);
                    activeProperties.delete(canonicalName);
                }
                property.setActive(false);
                continue;
            }
            if (processedLonghands.has(property)) {
                continue;
            }
            for (const longhand of property.getLonghandProperties()) {
                const activeLonghand = activeProperties.get(longhand.name);
                if (!activeLonghand) {
                    activeProperties.set(longhand.name, longhand);
                }
                else if (!activeLonghand.important || longhand.important) {
                    activeLonghand.setActive(false);
                    activeProperties.set(longhand.name, longhand);
                }
                else {
                    longhand.setActive(false);
                }
                processedLonghands.add(longhand);
            }
            const activeProperty = activeProperties.get(canonicalName);
            if (!activeProperty) {
                activeProperties.set(canonicalName, property);
            }
            else if (!activeProperty.important || property.important) {
                activeProperty.setActive(false);
                activeProperties.set(canonicalName, property);
            }
            else {
                property.setActive(false);
            }
        }
    }
    allProperties() {
        return this.#allProperties;
    }
    hasActiveProperty(name) {
        return this.#activePropertyMap.has(name);
    }
    getPropertyValue(name) {
        const property = this.#activePropertyMap.get(name);
        return property ? property.value : '';
    }
    isPropertyImplicit(name) {
        const property = this.#activePropertyMap.get(name);
        return property ? property.implicit : false;
    }
    propertyAt(index) {
        return (index < this.allProperties().length) ? this.allProperties()[index] : null;
    }
    pastLastSourcePropertyIndex() {
        for (let i = this.allProperties().length - 1; i >= 0; --i) {
            if (this.allProperties()[i].range) {
                return i + 1;
            }
        }
        return 0;
    }
    #insertionRange(index) {
        const property = this.propertyAt(index);
        if (property?.range) {
            return property.range.collapseToStart();
        }
        if (!this.range) {
            throw new Error('CSSStyleDeclaration.range is null');
        }
        return this.range.collapseToEnd();
    }
    newBlankProperty(index) {
        index = (typeof index === 'undefined') ? this.pastLastSourcePropertyIndex() : index;
        const property = new CSSProperty(this, index, '', '', false, false, true, false, '', this.#insertionRange(index));
        return property;
    }
    setText(text, majorChange) {
        if (!this.range || !this.styleSheetId) {
            return Promise.resolve(false);
        }
        return this.#cssModel.setStyleText(this.styleSheetId, this.range, text, majorChange);
    }
    insertPropertyAt(index, name, value, userCallback) {
        void this.newBlankProperty(index).setText(name + ': ' + value + ';', false, true).then(userCallback);
    }
    appendProperty(name, value, userCallback) {
        this.insertPropertyAt(this.allProperties().length, name, value, userCallback);
    }
}
export var Type;
(function (Type) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Type["Regular"] = "Regular";
    Type["Inline"] = "Inline";
    Type["Attributes"] = "Attributes";
    Type["Pseudo"] = "Pseudo";
    Type["Transition"] = "Transition";
    Type["Animation"] = "Animation";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Type || (Type = {}));
//# sourceMappingURL=CSSStyleDeclaration.js.map