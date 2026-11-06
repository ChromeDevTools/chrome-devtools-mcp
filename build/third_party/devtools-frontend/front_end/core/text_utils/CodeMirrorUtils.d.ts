type Tokenizer = (line: string, callback: (value: string, style: string | null) => void) => Promise<void>;
export declare function createCssTokenizer(): Tokenizer;
export {};
