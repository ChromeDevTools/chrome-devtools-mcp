import type { FormatMapping } from '../formatter_actions/formatter_actions.js';
export declare class FormattedContentBuilder {
    #private;
    private indentString;
    mapping: FormatMapping;
    constructor(indentString: string);
    setEnforceSpaceBetweenWords(value: boolean): boolean;
    addToken(token: string, offset: number): void;
    addSoftSpace(): void;
    addHardSpace(): void;
    addNewLine(noSquash?: boolean): void;
    increaseNestingLevel(): void;
    decreaseNestingLevel(): void;
    content(): string;
}
