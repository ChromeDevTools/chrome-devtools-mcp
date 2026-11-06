import type { ScopeInfo } from "../scopes.ts";
export declare class Encoder {
    #private;
    constructor(info: ScopeInfo, names: string[]);
    encode(): {
        scopes: (string | null)[];
        ranges: string[];
    };
}
