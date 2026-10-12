/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BaseCliOption {
  type?: 'boolean' | 'string' | 'number' | 'array';
  describe?: string;
  description?: string;
  defaultDescription?: string;
  hidden?: boolean;
  deprecated?: string | boolean;
  alias?: string;
  choices?: readonly string[];
  default?: unknown;
}

export interface BooleanCliOption extends BaseCliOption {
  type: 'boolean';
  default?: boolean;
}

export interface StringCliOption<
  TCoerce = string | undefined,
  TChoices extends readonly string[] = readonly string[],
> extends BaseCliOption {
  type: 'string';
  default?: string;
  choices?: TChoices;
  coerce?: (value: string | undefined) => TCoerce;
}

export interface NumberCliOption<TCoerce = number | undefined>
  extends BaseCliOption {
  type: 'number';
  default?: number;
  coerce?: (value: number | undefined) => TCoerce;
}

export interface ArrayCliOption<TCoerce = string[] | undefined>
  extends BaseCliOption {
  type: 'array';
  string?: boolean;
  default?: string[];
  coerce?: (value: string[] | undefined) => TCoerce;
}

export type CliOption =
  | BaseCliOption
  | BooleanCliOption
  | StringCliOption<unknown, readonly string[]>
  | NumberCliOption<unknown>
  | ArrayCliOption<unknown>;

type InferOptionType<O> =
  O extends {coerce: (value: never) => infer R}
    ? R
    : O extends {choices: ReadonlyArray<infer C>}
      ? 'default' extends keyof O
        ? C
        : C | undefined
      : O extends {type: 'boolean'}
        ? 'default' extends keyof O
          ? boolean
          : boolean | undefined
        : O extends {type: 'number'}
          ? 'default' extends keyof O
            ? number
            : number | undefined
          : O extends {type: 'string'}
            ? 'default' extends keyof O
              ? string
              : string | undefined
            : O extends {type: 'array'}
              ? 'default' extends keyof O
                ? string[]
                : string[] | undefined
              : unknown;

export type InferOptionTypes<T extends Record<string, CliOption>> = {
  -readonly [K in keyof T]: InferOptionType<T[K]>;
};

export type YargsOptions = CliOption;
export type InferredOptionTypes<T extends Record<string, CliOption>> =
  InferOptionTypes<T>;
