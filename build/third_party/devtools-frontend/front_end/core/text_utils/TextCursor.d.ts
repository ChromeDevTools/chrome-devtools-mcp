export declare class TextCursor {
    #private;
    constructor(lineEndings: number[]);
    advance(offset: number): void;
    offset(): number;
    resetTo(offset: number): void;
    lineNumber(): number;
    columnNumber(): number;
}
