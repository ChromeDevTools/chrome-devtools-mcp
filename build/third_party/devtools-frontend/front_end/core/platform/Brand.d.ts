/**
 * Helper type to introduce new branded types.
 *
 * `Base` is the underlying data type and `Tag` must be unique symbol/string.
 *
 * Usage:
 * ```ts
 *   type LineNumber = Brand<number, "LineNumber">;
 *   type RawUrl = Brand<string, "RawUrl">;
 * ```
 *
 * We purposefully use the string index of `_tag` rather then creating a Symbol
 * wrapper that would hide if in IDEs and fail build. This means that at build
 * time if one uses `<branded-var>._tag`, it will build without error and have
 * potentially having a runtime error. This allows us to have multiple places
 * where we define the brands and they will overlap. Also a use case for reusing
 * the type in other downstream projects is simplified.
 */
export type Brand<Base, Tag> = Base & {
    _tag: Tag;
};
