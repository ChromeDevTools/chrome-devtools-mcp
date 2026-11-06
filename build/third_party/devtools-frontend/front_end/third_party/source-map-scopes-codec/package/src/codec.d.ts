export declare const enum Tag {
    ORIGINAL_SCOPE_START = 1,
    ORIGINAL_SCOPE_END = 2,
    ORIGINAL_SCOPE_VARIABLES = 3,
    GENERATED_RANGE_START = 4,
    GENERATED_RANGE_END = 5,
    GENERATED_RANGE_BINDINGS = 6,
    GENERATED_RANGE_SUBRANGE_BINDING = 7,
    GENERATED_RANGE_CALL_SITE = 8,
    VENDOR_EXTENSION = 21
}
export declare const enum EncodedTag {
    ORIGINAL_SCOPE_START = "B",// 0x1
    ORIGINAL_SCOPE_END = "C",// 0x2
    ORIGINAL_SCOPE_VARIABLES = "D",// 0x3
    GENERATED_RANGE_START = "E",// 0x4
    GENERATED_RANGE_END = "F",// 0x5
    GENERATED_RANGE_BINDINGS = "G",// 0x6
    GENERATED_RANGE_SUBRANGE_BINDING = "H",// 0x7
    GENERATED_RANGE_CALL_SITE = "I",// 0x8
    VENDOR_EXTENSION = "V"
}
export declare const enum OriginalScopeFlags {
    HAS_NAME = 1,
    HAS_KIND = 2,
    IS_STACK_FRAME = 4
}
export declare const enum GeneratedRangeFlags {
    HAS_LINE = 1,
    HAS_DEFINITION = 2,
    IS_STACK_FRAME = 4,
    IS_HIDDEN = 8
}
export interface OriginalScopeStartItem {
    flags: number;
    line: number;
    column: number;
    nameIdx?: number;
    kindIdx?: number;
}
export interface GeneratedRangeStartItem {
    flags: number;
    line?: number;
    column: number;
    definition?: {
        sourceIdx: number;
        scopeIdx: number;
    };
}
