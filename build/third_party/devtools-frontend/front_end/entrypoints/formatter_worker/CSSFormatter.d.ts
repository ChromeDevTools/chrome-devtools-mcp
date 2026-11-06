import type { FormattedContentBuilder } from './FormattedContentBuilder.js';
export declare class CSSFormatter {
    #private;
    constructor(builder: FormattedContentBuilder);
    format(text: string, lineEndings: number[], fromOffset: number, toOffset: number): void;
}
