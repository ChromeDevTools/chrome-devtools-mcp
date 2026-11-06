import { SourceRange, TextRange } from './TextRange.js';
export declare class Text {
    #private;
    constructor(value: string);
    lineEndings(): number[];
    value(): string;
    lineCount(): number;
    offsetFromPosition(lineNumber: number, columnNumber: number): number;
    positionFromOffset(offset: number): Position;
    lineAt(lineNumber: number): string;
    toSourceRange(range: TextRange): SourceRange;
    toTextRange(sourceRange: SourceRange): TextRange;
    replaceRange(range: TextRange, replacement: string): string;
    extract(range: TextRange): string;
}
export interface Position {
    lineNumber: number;
    columnNumber: number;
}
