/**
 * Schema inference vs contextual typing of `args`.
 *
 * Typecheck (TypeScript 6):
 *   npx tsc --ignoreConfig --strict --noEmit --target esnext --lib ESNext schema-inference-example.ts
 *
 * Untyped `args =>` gets `args` from the callback's contextual type, but that
 * same contextual typing freezes `Schema` at the default shape. `request.params`
 * becomes `unknown`. Explicit `(args: ParsedArguments)` opts the callback out of
 * full contextual typing, so `Schema` is inferred from the returned `schema`.
 *
 * Expected: only the explicit `(args: ParsedArguments)` example typechecks.
 * Every untyped `args =>` example errors on `request.params.url` (`unknown`).
 */

interface ParsedArguments {
  categoryExtensions?: boolean;
}

interface ZodType<Output> {
  readonly _output: Output;
}

declare const z: {
  string(): ZodType<string>;
  number(): ZodType<number>;
};

type ZodRawShape = Record<string, ZodType<unknown>>;
type SchemaOutput<S extends ZodRawShape> = {
  [K in keyof S]: S[K]['_output'];
};

interface ToolRequest<Schema extends ZodRawShape> {
  params: SchemaOutput<Schema>;
}

interface PageToolDefinition<Schema extends ZodRawShape> {
  schema: Schema;
  handler(request: ToolRequest<NoInfer<Schema>>): void;
}

type SchemaFromDef<T> = T extends {schema: infer S extends ZodRawShape}
  ? S
  : ZodRawShape;

// ---------------------------------------------------------------------------
// 1. The signature we actually use
// ---------------------------------------------------------------------------

declare function defineTool<const Schema extends ZodRawShape>(
  definition: (args: ParsedArguments) => PageToolDefinition<Schema>,
): PageToolDefinition<Schema>;

defineTool(args => ({
  schema: {url: z.string()},
  handler(request) {
    const _flag: boolean | undefined = args.categoryExtensions;
    // error: Type 'unknown' is not assignable to type 'string'
    const _url: string = request.params.url;
  },
}));

defineTool((args: ParsedArguments) => ({
  schema: {url: z.string()},
  handler(request) {
    const _flag: boolean | undefined = args.categoryExtensions;
    const _url: string = request.params.url;
  },
}));

// ---------------------------------------------------------------------------
// 2. Extra Args generic with a default
// ---------------------------------------------------------------------------

declare function defineWithArgsGeneric<
  const Schema extends ZodRawShape,
  Args extends ParsedArguments = ParsedArguments,
>(definition: (args: Args) => PageToolDefinition<Schema>): PageToolDefinition<Schema>;

defineWithArgsGeneric(args => ({
  schema: {url: z.string()},
  handler(request) {
    const _flag: boolean | undefined = args.categoryExtensions;
    // error: Type 'unknown' is not assignable to type 'string'
    const _url: string = request.params.url;
  },
}));

// ---------------------------------------------------------------------------
// 3. Self-referential R
// ---------------------------------------------------------------------------

declare function defineSelfRef<R extends PageToolDefinition<SchemaFromDef<R>>>(
  definition: (args: ParsedArguments) => R,
): R;

defineSelfRef(args => ({
  schema: {url: z.string()},
  handler(request) {
    const _flag: boolean | undefined = args.categoryExtensions;
    // error: Type 'unknown' is not assignable to type 'string'
    const _url: string = request.params.url;
  },
}));

// ---------------------------------------------------------------------------
// 4. Call signature (object type instead of function type)
// ---------------------------------------------------------------------------

declare function defineCallSignature<const Schema extends ZodRawShape>(definition: {
  (args: ParsedArguments): PageToolDefinition<Schema>;
}): PageToolDefinition<Schema>;

defineCallSignature(args => ({
  schema: {url: z.string()},
  handler(request) {
    const _flag: boolean | undefined = args.categoryExtensions;
    // error: Type 'unknown' is not assignable to type 'string'
    const _url: string = request.params.url;
  },
}));

// ---------------------------------------------------------------------------
// 5. Bivariant method hack
// ---------------------------------------------------------------------------

declare function defineBivariant<const Schema extends ZodRawShape>(definition: {
  bivarianceHack(args: ParsedArguments): PageToolDefinition<Schema>;
}['bivarianceHack']): PageToolDefinition<Schema>;

defineBivariant(args => ({
  schema: {url: z.string()},
  handler(request) {
    const _flag: boolean | undefined = args.categoryExtensions;
    // error: Type 'unknown' is not assignable to type 'string'
    const _url: string = request.params.url;
  },
}));

// ---------------------------------------------------------------------------
// 6. Polymorphic this
// ---------------------------------------------------------------------------

interface ToolThis {
  schema: ZodRawShape;
  handler(
    this: this,
    request: ToolRequest<
      this['schema'] extends ZodRawShape ? this['schema'] : never
    >,
  ): void;
}

declare function definePolyThis<R extends ToolThis>(
  definition: (args: ParsedArguments) => R,
): R;

definePolyThis(args => ({
  schema: {url: z.string()},
  handler(request) {
    const _flag: boolean | undefined = args.categoryExtensions;
    // error: Type 'unknown' is not assignable to type 'string'
    const _url: string = request.params.url;
  },
}));
