import type { FormattedContentBuilder } from './FormattedContentBuilder.js';
export declare class IdentityFormatter {
    private builder;
    constructor(builder: FormattedContentBuilder);
    format(text: string, _lineEndings: number[], fromOffset: number, toOffset: number): void;
}
