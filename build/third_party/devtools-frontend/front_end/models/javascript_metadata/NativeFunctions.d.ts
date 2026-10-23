export interface NativeFunctionValue {
    name: string;
    signatures: string[][];
    receivers?: string[];
}
export declare const NativeFunctions: readonly NativeFunctionValue[];
