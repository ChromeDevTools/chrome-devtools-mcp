# ESLint rules not in DevTools

These rules are switched on in this repo (through `eslint.config.js` or the presets it extends) but aren't in the `devtools-frontend` ESLint config. They are candidates to keep after the migration, and possibly to turn on in DevTools as well.

Custom `@local/*` rules are not listed. Neither are rules that `typescript-eslint` already turns off for TypeScript files (for example `no-const-assign`, `no-redeclare`, `constructor-super`), because the compiler catches those problems.

## Set explicitly in `eslint.config.js`

| Rule                                         | Why keep it                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `import/no-cycle`                            | Stops circular imports, which cause hard-to-debug initialization order bugs in ESM.                       |
| `@typescript-eslint/consistent-type-exports` | Pairs with `consistent-type-imports`, so re-exports of types are removed when the code is compiled.       |
| `no-restricted-imports`                      | Enforces the module boundaries, e.g. only import `devtools-frontend/mcp/mcp.js`, no MCP client in `src/`. |

## From `js/recommended`: likely bugs

| Rule                            | What it catches                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| `no-async-promise-executor`     | `new Promise(async () => ...)`, where thrown errors are lost.      |
| `no-unsafe-finally`             | `return`/`throw` in `finally` that overrides the try/catch result. |
| `no-unsafe-optional-chaining`   | `(a?.b)()` or `...a?.b` that throws when the chain is `undefined`. |
| `no-fallthrough`                | `switch` cases that run into the next one without a comment.       |
| `no-constant-binary-expression` | Comparisons whose result is always the same, e.g. `a + b ?? c`.    |
| `no-constant-condition`         | `if (true)` / `while (1)` left over from debugging.                |
| `no-dupe-else-if`               | The same condition repeated in an `if`/`else if` chain.            |
| `no-self-assign`                | `x = x`.                                                           |
| `no-ex-assign`                  | Reassigning the exception variable in `catch`.                     |
| `no-loss-of-precision`          | Number literals that cannot be represented exactly.                |
| `no-compare-neg-zero`           | `x === -0`, which is also true for `+0`.                           |
| `use-isnan`                     | `x === NaN`, which is always false.                                |
| `for-direction`                 | `for` loops whose counter moves the wrong way and never end.       |
| `no-unassigned-vars`            | Variables that are read but never assigned.                        |
| `no-unexpected-multiline`       | Line breaks that ASI turns into unintended calls or indexing.      |
| `no-sparse-arrays`              | `[1, , 2]`.                                                        |
| `no-empty-pattern`              | `const {} = obj`.                                                  |

## From `js/recommended`: regex and string correctness

| Rule                            | What it catches                                    |
| ------------------------------- | -------------------------------------------------- |
| `no-invalid-regexp`             | Invalid `RegExp(...)` strings.                     |
| `no-control-regex`              | Control characters in regexes (usually a mistake). |
| `no-misleading-character-class` | Multi-code-point characters inside `[...]`.        |
| `no-useless-backreference`      | Backreferences that can never match.               |
| `no-regex-spaces`               | Several spaces in a row inside a regex literal.    |
| `no-irregular-whitespace`       | Invisible or odd whitespace in code.               |
| `no-nonoctal-decimal-escape`    | `"\8"` / `"\9"` escapes.                           |
| `no-octal`                      | Legacy octal literals.                             |
| `no-useless-escape`             | Unnecessary escape characters.                     |

## From `js/recommended`: cleanliness

| Rule                    | Notes                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| `no-prototype-builtins` | Use `Object.hasOwn(obj, key)` instead of `obj.hasOwnProperty(key)`. |
| `no-useless-catch`      | `catch (e) { throw e; }`.                                           |
| `no-extra-boolean-cast` | `if (!!x)`.                                                         |
| `no-unused-labels`      | Labels that are never used.                                         |
| `no-empty-static-block` | `static {}`.                                                        |
| `no-delete-var`         | `delete someVariable`.                                              |
| `prefer-rest-params`    | Use `...args` instead of `arguments`.                               |
| `prefer-spread`         | Use `fn(...args)` instead of `fn.apply(null, args)`.                |

## From `tseslint.configs.recommended`

| Rule                                                     | Notes                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `@typescript-eslint/no-unused-expressions`               | Expression statements with no effect, e.g. `a && b;` or a stray `foo;`.     |
| `@typescript-eslint/no-non-null-asserted-optional-chain` | `a?.b!`, which undoes the safety of the optional chain.                     |
| `@typescript-eslint/no-extra-non-null-assertion`         | `a!!`.                                                                      |
| `@typescript-eslint/no-confusing-non-null-assertion`     | `a! == b`, which looks like `a !== b`.                                      |
| `@typescript-eslint/no-duplicate-enum-values`            | Two enum members with the same value.                                       |
| `@typescript-eslint/no-unsafe-declaration-merging`       | A class and an interface with the same name merged by accident.             |
| `@typescript-eslint/no-misused-new`                      | `new()` / `constructor` declared in an interface or type.                   |
| `@typescript-eslint/no-wrapper-object-types`             | `String`/`Number`/`Boolean` used as types instead of the primitives.        |
| `@typescript-eslint/no-unnecessary-type-constraint`      | `<T extends unknown>`.                                                      |
| `@typescript-eslint/no-empty-function`                   | Empty function bodies (add a comment explaining why if one is intentional). |
| `@typescript-eslint/no-this-alias`                       | `const self = this`.                                                        |
| `@typescript-eslint/no-require-imports`                  | `require()` in ESM code.                                                    |
| `@typescript-eslint/no-namespace`                        | TypeScript `namespace` declarations; prefer ES modules.                     |
| `@typescript-eslint/prefer-namespace-keyword`            | `module Foo {}` should be `namespace Foo {}`.                               |
| `@typescript-eslint/triple-slash-reference`              | `/// <reference ...>`; prefer `import`.                                     |
| `@typescript-eslint/prefer-as-const`                     | `'a' as 'a'` should be `as const`.                                          |

## From `tseslint.configs.stylistic`

| Rule                                              | Notes                                                           |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `@typescript-eslint/prefer-for-of`                | Matches the repo guideline of using `for..of` over index loops. |
| `@typescript-eslint/consistent-type-assertions`   | Makes `as` the only assertion style (no `<T>x`).                |
| `@typescript-eslint/no-inferrable-types`          | `const x: number = 1`.                                          |
| `@typescript-eslint/prefer-function-type`         | `interface F { (): void }` should be `type F = () => void`.     |
| `@typescript-eslint/adjacent-overload-signatures` | Keeps overload signatures next to each other.                   |
| `@typescript-eslint/class-literal-property-style` | Prefer `readonly x = 1` over `get x() { return 1; }`.           |
| `@typescript-eslint/ban-tslint-comment`           | Leftover `// tslint:` comments.                                 |

## Settings that differ from DevTools

Both configs have these rules, but this repo configures them differently:

- `@typescript-eslint/no-unused-vars` adds `varsIgnorePattern: '^_'`.
- `@typescript-eslint/naming-convention` allows a leading `_` on variables, to go with the setting above. It is also turned off for `src/telemetry/**`, where names follow the snake_case Clearcut schema.
- `no-console` is turned off for `src/bin/**` and `src/daemon/**`.

## DevTools rules not turned on here

- `@stylistic/member-delimiter-style`: it conflicts with Prettier, which always puts semicolons in type literals. Revisit after the migration to clang-format.
- `import/order`: it crashes with `eslint-plugin-import@2.32.0` on ESLint 10.
- `lit/*`: skipped because this repo doesn't render any Lit templates.
- `mocha/no-async-describe` and `mocha/no-global-tests` are named `mocha/no-async-suite` and `mocha/no-top-level-tests` in `eslint-plugin-mocha@12`.
