/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { YargsOptions } from '../third_party/cli.js';
import { ToolCategory } from '../tools/categories.js';
export interface McpOption extends YargsOptions {
    /**
     * Whether changes to this option in a config file can be applied to a running
     * server without restarting it.
     */
    reloadable?: boolean;
}
type McpOptionBase<TBase extends YargsOptions> = Omit<TBase, 'type' | 'default' | 'choices' | 'coerce'>;
type WithDefault<T, HasDefault extends boolean> = HasDefault extends true ? {
    default: T;
} : {
    default?: T;
};
export type McpOptionFor<T, TBase extends YargsOptions = YargsOptions, HasDefault extends boolean = true> = [NonNullable<T>] extends [boolean] ? McpOptionBase<TBase> & {
    type: 'boolean';
} & WithDefault<boolean, HasDefault> : [NonNullable<T>] extends [number] ? McpOptionBase<TBase> & {
    type: 'number';
    coerce?: (arg: number | undefined) => number | undefined;
} & WithDefault<number, HasDefault> : [NonNullable<T>] extends [string] ? string extends NonNullable<T> ? McpOptionBase<TBase> & {
    type: 'string';
    coerce?: (arg: string | undefined) => string | undefined;
} & WithDefault<string, HasDefault> : McpOptionBase<TBase> & {
    type: 'string';
    choices: ReadonlyArray<NonNullable<T>>;
} & WithDefault<NonNullable<T>, HasDefault> : [NonNullable<T>] extends [string[]] ? McpOptionBase<TBase> & {
    type: 'array';
    string: true;
    coerce?: (arg: string[] | undefined) => string[] | undefined;
} & WithDefault<string[], HasDefault> : McpOptionBase<TBase> & {
    type: 'string';
    coerce: (arg: string | undefined) => T;
};
export type McpOptionsFor<TArgs, TBase extends YargsOptions = YargsOptions> = {
    [K in keyof TArgs]-?: McpOptionFor<TArgs[K], TBase, Record<never, never> extends Pick<TArgs, K> ? false : true>;
};
export interface CategoryOption {
    type: 'boolean';
    describe: string;
    default?: boolean;
    defaultDescription?: string;
    hidden?: boolean;
    reloadable?: boolean;
}
export type CategoryFlagName<T extends ToolCategory = ToolCategory> = `category${Capitalize<T>}`;
export type CategoryFlags = {
    [K in ToolCategory as CategoryFlagName<K>]: CategoryOption;
};
export type CategoryArguments = {
    [K in ToolCategory as CategoryFlagName<K>]?: boolean;
};
export declare function categoryToFlagName(category: ToolCategory): CategoryFlagName;
export declare function getCategoryOptions(): CategoryFlags;
export declare function isCategoryOffByDefault(category: ToolCategory): boolean;
export declare function getOffByDefaultCategories(): ToolCategory[];
export {};
