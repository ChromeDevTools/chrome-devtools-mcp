import type { FormattedContentBuilder } from './FormattedContentBuilder.js';
export declare class HTMLFormatter {
    #private;
    constructor(builder: FormattedContentBuilder);
    format(text: string, lineEndings: number[]): void;
}
export declare class HTMLModel {
    #private;
    constructor(text: string);
    peekToken(offset?: number): Token | null;
    nextToken(): Token | null;
    document(): FormatterElement;
}
declare class Token {
    value: string;
    type: Set<string>;
    startOffset: number;
    endOffset: number;
    constructor(value: string, type: Set<string>, startOffset: number, endOffset: number);
}
declare class Tag {
    name: string;
    startOffset: number;
    endOffset: number;
    attributes: Map<string, string>;
    isOpenTag: boolean;
    selfClosingTag: boolean;
    constructor(name: string, startOffset: number, endOffset: number, attributes: Map<string, string>, isOpenTag: boolean, selfClosingTag: boolean);
}
declare class FormatterElement {
    name: string;
    children: FormatterElement[];
    parent: FormatterElement | null;
    openTag: Tag | null;
    closeTag: Tag | null;
    hasComments: boolean;
    hasContent: boolean;
    constructor(name: string);
}
export {};
