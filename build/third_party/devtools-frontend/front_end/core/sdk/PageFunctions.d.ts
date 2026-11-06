import type * as Protocol from '../../generated/protocol.js';
/**
 * Functions in this file are serialized via `.toString()` and evaluated in the
 * inspected page context over CDP (e.g. `Runtime.callFunctionOn`). Because they
 * execute in the inspected browser environment, they use standard DOM types.
 */
export declare function scrollListenerInPage(this: HTMLElement | Document, id: number, reportScrollPositionBindingName: string, scrollListenerNameInPage: string): void;
export declare function removeScrollListenerInPage(this: HTMLElement | Document, scrollListenerNameInPage: string): void;
export declare function scrollTopInPage(this: Element | Document): number;
export declare function scrollLeftInPage(this: Element | Document): number;
export declare function setScrollTopInPage(this: Element | Document, offsetInPage: number): void;
export declare function setScrollLeftInPage(this: Element | Document, offsetInPage: number): void;
export declare function verticalScrollRangeInPage(this: Element | Document): number;
export declare function horizontalScrollRangeInPage(this: Element | Document): number;
export declare function toggleClassAndInjectStyleRule(this: Element, pseudoElementName: string | null, hidden: boolean): void;
export declare function scrollIntoViewInPage(this: Element): void;
export declare function focusInPage(this: HTMLElement): void;
export declare function toStringForClipboard(this: Object, data: {
    subtype: string | undefined;
    indent: string;
}): string | undefined;
export declare function saveVariable(this: Window, value: Protocol.Runtime.CallArgument): string;
