/**
 * This is useful to keep TypeScript happy in a test - if you have a value
 * that's potentially `null` you can use this function to assert that it isn't,
 * and satisfy TypeScript that the value is present.
 */
export declare function assertNotNullOrUndefined<T>(val: T, message?: string): asserts val is NonNullable<T>;
export declare function assertNever(_type: never, message: string): never;
export type FieldsThatExtend<Type, Selector> = {
    [Key in keyof Type]: Type[Key] extends Selector ? Key : never;
}[keyof Type];
export type PickFieldsThatExtend<Type, Selector> = Pick<Type, FieldsThatExtend<Type, Selector>>;
/**
 * Turns a Union type (a | b) into an Intersection type (a & b).
 * This is a helper type to implement the "NoUnion" guard.
 *
 * Adapted from https://stackoverflow.com/a/50375286.
 *
 * The tautological `T extends any` is necessary to trigger distributivity for
 * plain unions, e.g. in IntersectionFromUnion<'a'|'b'> TypeScript expands it
 * to  ('a' extends any ? (arg: 'a') => void : never)
 *  |  ('b' extends any ? (arg: 'b') => void : never)
 *
 * The second extends clause then asks TypeScript to find a type of the form
 * `(arg: infer U) => void` that upper-bounds the union, i.e., intuitively,
 * a type that converts to each of the union members. This forces U to be the
 * intersection of 'a' and 'b' in the example.
 *
 * Please note that some intersection types are simply impossible, e.g.
 * `string & number`. There is no type that fulfills both at the same time. A
 * union of this kind is reduced to `never`.
 */
type IntersectionFromUnion<T> = (T extends any ? (arg: T) => void : never) extends ((arg: infer U) => void) ? U : never;
/**
 * When writing generic code it may be desired to disallow Union types from
 * being passed. This type can be used in those cases.
 *
 *   function foo<T>(argument: NoUnion<T>) {...}
 *
 * Would result in a compile error for foo<a|b>(...); invocations as `argument`
 * would be typed as `never`.
 *
 * Adapted from https://stackoverflow.com/a/50641073.
 *
 * Conditional types become distributive when receiving a union type. To
 * prevent this from happening, we use `[T] extends [IntersectionFromUnion<T>]`
 * instead of `T extends IntersectionFromUnion<T>`.
 * See: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
 */
export type NoUnion<T> = [T] extends [IntersectionFromUnion<T>] ? T : never;
export type RecursivePartial<T> = {
    [P in keyof T]?: RecursivePartial<T[P]>;
};
/**
 * Note this does not recursively
 * make Array items readonly at the moment
 */
export type RecursiveReadonly<T> = {
    [P in keyof T]: Readonly<RecursiveReadonly<T[P]>>;
};
export {};
