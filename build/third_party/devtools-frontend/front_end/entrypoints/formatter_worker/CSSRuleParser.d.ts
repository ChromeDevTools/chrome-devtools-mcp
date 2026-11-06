import { type ChunkCallback } from './FormatterWorker.js';
export declare const CSSParserStates: {
    Initial: string;
    Selector: string;
    Style: string;
    PropertyName: string;
    PropertyValue: string;
    AtRule: string;
};
export declare function parseCSS(text: string, chunkCallback: ChunkCallback): void;
