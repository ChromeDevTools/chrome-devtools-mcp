export interface CSSProperty {
    name: string;
    longhands?: string[];
    inherited?: boolean;
    svg?: boolean;
    keywords?: string[];
    devtools_keywords?: string[];
    is_property?: boolean;
    is_descriptor?: boolean;
    runtime_flag?: string;
    runtime_flag_status?: string | null;
}
export interface CSSPropertyValue {
    values: string[];
}
export declare const generatedProperties: CSSProperty[];
export declare const generatedPropertyValues: Record<string, CSSPropertyValue>;
export declare const generatedAliasesFor: Map<string, string>;
