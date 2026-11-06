export declare function encodeSigned(n: number): string;
export declare function encodeUnsigned(n: number): string;
export declare class TokenIterator {
    #private;
    constructor(string: string, strict?: boolean);
    nextChar(): string;
    /** Returns the unicode value of the next character and advances the iterator  */
    nextCharCode(): number;
    peek(): string;
    hasNext(): boolean;
    nextSignedVLQ(): number;
    nextUnsignedVLQ(): number;
    currentChar(): string;
}
