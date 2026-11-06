export interface AttributeConfig {
    default?: string;
    enum?: string[];
    isGlobal?: boolean;
    name: string;
    preventedOnRoles?: string[];
    supportedOnRoles?: string[];
    type: string;
}
export interface RoleConfig {
    abstract?: boolean;
    childrenPresentational?: boolean;
    deprecated?: boolean;
    implicitValues?: Record<string, string | boolean>;
    internalRoles?: string[];
    mustContain?: string[];
    name: string;
    nameFrom?: string[];
    nameRequired?: boolean;
    requiredAttributes?: string[];
    scope?: string | string[];
    superclasses?: string[];
}
export interface AriaMetadata {
    attrsNullNamespace?: boolean;
    export?: string;
    namespace?: string;
    namespacePrefix?: string;
    namespaceURI?: string;
}
export interface AriaConfig {
    attributes: AttributeConfig[];
    metadata?: AriaMetadata;
    roles: RoleConfig[];
}
export declare const config: AriaConfig;
