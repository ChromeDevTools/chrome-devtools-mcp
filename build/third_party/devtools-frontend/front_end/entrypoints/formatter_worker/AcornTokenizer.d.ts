import * as Acorn from '../../third_party/acorn/acorn.js';
export type TokenOrComment = Acorn.Token | Acorn.Comment;
/**
 * The tokenizer in Acorn does not allow you to peek into the next token.
 * We use the peekToken method to determine when to stop formatting a
 * particular block of code.
 *
 * To remedy the situation, we implement the peeking of tokens ourselves.
 * To do so, whenever we call `nextToken`, we already retrieve the token
 * after it (in `bufferedToken`), so that `_peekToken` can check if there
 * is more work to do.
 *
 * There are 2 catches:
 *
 * 1. in the constructor we need to start the initialize the buffered token,
 *    such that `peekToken` on the first call is able to retrieve it. However,
 * 2. comments and tokens can arrive intermixed from the tokenizer. This usually
 *    happens when comments are the first comments of a file. In the scenario that
 *    the first comment in a file is a line comment attached to a token, we first
 *    receive the token and after that we receive the comment. However, when tokenizing
 *    we should reverse the order and return the comment, before the token.
 *
 * All that is to say that the `bufferedToken` is only used for *true* tokens.
 * We mimic comments to be tokens to fix the reordering issue, but we store these
 * separately to keep track of them. Any call to `nextTokenInternal` will figure
 * out whether the next token should be the preceding comment or not.
 */
export declare class AcornTokenizer {
    #private;
    constructor(content: string, tokens: Array<Acorn.Comment | Acorn.Token>);
    static punctuator(token: Acorn.Token, values?: string): boolean;
    static keyword(token: Acorn.Token, keyword?: string): boolean;
    static identifier(token: TokenOrComment, identifier?: string): boolean;
    static arrowIdentifier(token: TokenOrComment, identifier?: string): boolean;
    static lineComment(token: TokenOrComment): boolean;
    static blockComment(token: TokenOrComment): boolean;
    nextToken(): TokenOrComment | null;
    peekToken(): TokenOrComment | null;
    tokenLineStart(): number;
    tokenLineEnd(): number;
}
export declare const ECMA_VERSION = "latest";
