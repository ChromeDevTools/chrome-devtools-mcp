import type { FormattedContentBuilder } from './FormattedContentBuilder.js';
export declare class JSONFormatter {
    builder: FormattedContentBuilder;
    toOffset: number;
    fromOffset: number;
    lineEndings: number[];
    lastLine: number;
    text: string;
    constructor(builder: FormattedContentBuilder);
    format(text: string, lineEndings: number[], fromOffset: number, toOffset: number): void;
    tokenCallback(token: string, _type: string | null, startPosition: number): void;
}
