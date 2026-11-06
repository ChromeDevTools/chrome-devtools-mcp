import { type FormatResult } from '../formatter_actions/formatter_actions.js';
import { substituteExpression } from './Substitute.js';
export interface Chunk {
    chunk: unknown[];
    isLastChunk: boolean;
}
export type ChunkCallback = (arg0: Chunk) => void;
export type TokenizerCallback = (value: string, style: string | null, start: number, end: number) => Object | undefined | void;
/**
 * A tokenizer function returned by {@link createTokenizer}.
 *
 * @param line The string content to tokenize.
 * @param callback A callback function invoked for each token parsed.
 * @param startOffset An optional offset pointing to where tokenization should start within
 * the line, avoiding the need to allocate substrings when tokenizing a block inside a larger file.
 */
export type Tokenizer = (line: string, callback: TokenizerCallback, startOffset?: number) => void;
/**
 * Creates a tokenizer for the specified MIME type.
 */
export declare function createTokenizer(mimeType: string): Tokenizer;
export declare const AbortTokenization: {};
export declare function format(mimeType: string, text: string, indentString?: string): FormatResult;
export { substituteExpression };
