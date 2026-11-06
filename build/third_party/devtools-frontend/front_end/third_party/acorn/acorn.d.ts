import * as acorn from './package/dist/acorn.mjs';
import type * as ESTree from './estree-legacy.js';
export { ESTree };
export { type Comment, defaultOptions, getLineInfo, Node, SourceLocation, Token, tokTypes } from './package/dist/acorn.mjs';
export declare const Parser: typeof acorn.Parser;
export declare const tokenizer: typeof acorn.Parser.tokenizer;
export declare const parse: typeof acorn.Parser.parse;
