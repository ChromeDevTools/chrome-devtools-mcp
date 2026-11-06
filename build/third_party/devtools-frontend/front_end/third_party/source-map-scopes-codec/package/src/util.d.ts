import type { Position } from "./scopes.ts";
/**
 * @returns A negative number iff `a` precedes `b`, 0 iff `a` and `b` are equal and a positive number iff `b` precedes `a`.
 */
export declare function comparePositions(a: Position, b: Position): number;
