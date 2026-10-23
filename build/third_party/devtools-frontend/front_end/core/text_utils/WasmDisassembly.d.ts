import { ContentData } from './ContentData.js';
import type { DeferredContent } from './ContentProvider.js';
interface FunctionBodyOffset {
    start: number;
    end: number;
}
/**
 * Metadata to map between bytecode #offsets and line numbers in the
 * disassembly for WebAssembly modules.
 */
export declare class WasmDisassembly extends ContentData {
    #private;
    readonly lines: string[];
    constructor(lines: string[], offsets: number[], functionBodyOffsets: FunctionBodyOffset[]);
    get text(): string;
    get isEmpty(): boolean;
    get lineNumbers(): number;
    bytecodeOffsetToLineNumber(bytecodeOffset: number): number;
    lineNumberToBytecodeOffset(lineNumber: number): number;
    /**
     * returns an iterable enumerating all the non-breakable line numbers in the disassembly
     */
    nonBreakableLineNumbers(): Iterable<number>;
    /**
     * @deprecated Used during migration from `DeferredContent` to `ContentData`.
     */
    asDeferedContent(): DeferredContent;
}
export {};
