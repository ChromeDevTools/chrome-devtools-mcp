export type { Binding, DecodedScopeInfo, GeneratedRange, OriginalPosition, OriginalScope, Position, ScopeInfo, SourceMapJson, SubRangeBinding, } from "./scopes.ts";
export { encode } from "./encode/encode.js";
export { decode, DecodeMode } from "./decode/decode.js";
export { ScopeInfoBuilder } from "./builder/builder.js";
export { SafeScopeInfoBuilder } from "./builder/safe_builder.js";
