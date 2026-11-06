import * as Acorn from '../../third_party/acorn/acorn.js';
import { DefinitionKind, ScopeKind, type ScopeTreeNode } from '../formatter_actions/formatter_actions.js';
export declare function parseScopes(expression: string, sourceType?: 'module' | 'script'): Scope | null;
export interface Use {
    offset: number;
    scope: Scope;
    isShorthandAssignmentProperty: boolean;
}
export interface VariableUses {
    definitionKind: DefinitionKind;
    uses: Use[];
}
export declare class Scope {
    #private;
    readonly variables: Map<string, VariableUses>;
    readonly parent: Scope | null;
    readonly start: number;
    readonly end: number;
    readonly kind: ScopeKind;
    readonly name?: string;
    readonly nameMappingLocations?: number[];
    readonly children: Scope[];
    constructor(start: number, end: number, parent: Scope | null, kind: ScopeKind, name?: string, nameMappingLocations?: number[]);
    export(): ScopeTreeNode;
    addVariable(name: string, offset: number, definitionKind: DefinitionKind, isShorthandAssignmentProperty: boolean): void;
    findBinders(name: string): VariableUses[];
    finalizeToParent(isFunctionScope: boolean): void;
}
export declare class ScopeVariableAnalysis {
    #private;
    constructor(node: Acorn.ESTree.Node, sourceText: string);
    run(): Scope;
    getFreeVariables(): Map<string, Use[]>;
    getAllNames(): Set<string>;
}
