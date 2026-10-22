import * as Protocol from '../../generated/protocol.js';
import type * as Common from '../common/common.js';
import type { DebuggerModel, FunctionDetails } from './DebuggerModel.js';
import type { RuntimeModel } from './RuntimeModel.js';
type DOMPinnedWebIDLProp = Common.JavaScriptMetaData.DOMPinnedWebIDLProp;
type DOMPinnedWebIDLType = Common.JavaScriptMetaData.DOMPinnedWebIDLType;
/** This cannot be an interface due to "instanceof RemoteObject" checks in the code. **/
export declare abstract class RemoteObject {
    static fromLocalObject(value: unknown): RemoteObject;
    static type(remoteObject: RemoteObject): string;
    static isNullOrUndefined(remoteObject?: RemoteObject): boolean;
    static arrayNameFromDescription(description: string): string;
    static arrayLength(object: RemoteObject | Protocol.Runtime.RemoteObject | Protocol.Runtime.ObjectPreview): number;
    static arrayBufferByteLength(object: RemoteObject | Protocol.Runtime.RemoteObject | Protocol.Runtime.ObjectPreview): number;
    static isEmptyArray(object: RemoteObject | Protocol.Runtime.RemoteObject | Protocol.Runtime.ObjectPreview): boolean;
    static unserializableDescription(object: unknown): string | null;
    static toCallArgument(object: string | number | bigint | boolean | RemoteObject | Protocol.Runtime.RemoteObject | null | undefined): Protocol.Runtime.CallArgument;
    static loadFromObjectPerProto(object: RemoteObject, generatePreview: boolean, nonIndexedPropertiesOnly?: boolean): Promise<GetPropertiesResult>;
    customPreview(): Protocol.Runtime.CustomPreview | null;
    abstract get objectId(): Protocol.Runtime.RemoteObjectId | undefined;
    abstract get type(): string;
    abstract get subtype(): string | undefined;
    abstract get value(): any;
    abstract get description(): string | undefined;
    abstract set description(description: string | undefined);
    abstract get hasChildren(): boolean;
    abstract arrayLength(): number;
    abstract getOwnProperties(generatePreview: boolean, nonIndexedPropertiesOnly?: boolean): Promise<GetPropertiesResult>;
    abstract getAllProperties(accessorPropertiesOnly: boolean, generatePreview: boolean, nonIndexedPropertiesOnly?: boolean): Promise<GetPropertiesResult>;
    unserializableValue(): string | undefined;
    get preview(): Protocol.Runtime.ObjectPreview | undefined;
    get className(): string | null;
    callFunction<T, U>(_functionDeclaration: (this: U, ...args: any[]) => T, _args?: Protocol.Runtime.CallArgument[], _params?: {
        throwOnSideEffect?: boolean;
    } | undefined): Promise<CallFunctionResult>;
    callFunctionJSON<T, U>(_functionDeclaration: (this: U, ...args: any[]) => T, _args: Protocol.Runtime.CallArgument[] | undefined, _params?: {
        throwOnSideEffect?: boolean;
    } | undefined): Promise<T | null>;
    arrayBufferByteLength(): number;
    deleteProperty(_name: Protocol.Runtime.CallArgument): Promise<string | undefined>;
    setPropertyValue(_name: string | Protocol.Runtime.CallArgument, _value: string): Promise<string | undefined>;
    release(): void;
    debuggerModel(): DebuggerModel;
    runtimeModel(): RuntimeModel;
    isNode(): boolean;
    /**
     * Checks whether this object can be inspected with the Linear memory inspector.
     * @returns `true` if this object can be inspected with the Linear memory inspector.
     */
    isLinearMemoryInspectable(): boolean;
    webIdl?: RemoteObjectWebIdlTypeMetadata;
}
export declare class RemoteObjectImpl extends RemoteObject {
    #private;
    constructor(runtimeModel: RuntimeModel, objectId: Protocol.Runtime.RemoteObjectId | undefined, type: string, subtype: string | undefined, value: typeof RemoteObject.prototype.value, unserializableValue?: string, description?: string, preview?: Protocol.Runtime.ObjectPreview, customPreview?: Protocol.Runtime.CustomPreview, className?: string);
    customPreview(): Protocol.Runtime.CustomPreview | null;
    get objectId(): Protocol.Runtime.RemoteObjectId | undefined;
    get type(): string;
    get subtype(): string | undefined;
    get value(): typeof RemoteObject.prototype.value;
    unserializableValue(): string | undefined;
    get description(): string | undefined;
    set description(description: string | undefined);
    get hasChildren(): boolean;
    get preview(): Protocol.Runtime.ObjectPreview | undefined;
    get className(): string | null;
    getOwnProperties(generatePreview: boolean, nonIndexedPropertiesOnly?: boolean): Promise<GetPropertiesResult>;
    getAllProperties(accessorPropertiesOnly: boolean, generatePreview: boolean, nonIndexedPropertiesOnly?: boolean): Promise<GetPropertiesResult>;
    createRemoteObject(object: Protocol.Runtime.RemoteObject): Promise<RemoteObject>;
    doGetProperties(ownProperties: boolean, accessorPropertiesOnly: boolean, nonIndexedPropertiesOnly: boolean, generatePreview: boolean): Promise<GetPropertiesResult>;
    setPropertyValue(name: string | Protocol.Runtime.CallArgument, value: string): Promise<string | undefined>;
    doSetObjectPropertyValue(result: Protocol.Runtime.RemoteObject, name: Protocol.Runtime.CallArgument): Promise<string | undefined>;
    deleteProperty(name: Protocol.Runtime.CallArgument): Promise<string | undefined>;
    callFunction<T, U>(functionDeclaration: (this: U, ...args: any[]) => T, args?: Protocol.Runtime.CallArgument[], params?: {
        throwOnSideEffect?: boolean;
    }): Promise<CallFunctionResult>;
    callFunctionJSON<T, U>(functionDeclaration: (this: U, ...args: any[]) => T, args: Protocol.Runtime.CallArgument[] | undefined, params?: {
        throwOnSideEffect?: boolean;
    }): Promise<T | null>;
    release(): void;
    arrayLength(): number;
    arrayBufferByteLength(): number;
    debuggerModel(): DebuggerModel;
    runtimeModel(): RuntimeModel;
    isNode(): boolean;
    isLinearMemoryInspectable(): boolean;
}
export declare class ScopeRemoteObject extends RemoteObjectImpl {
    #private;
    constructor(runtimeModel: RuntimeModel, objectId: Protocol.Runtime.RemoteObjectId | undefined, scopeRef: ScopeRef, type: string, subtype: string | undefined, value: typeof RemoteObjectImpl.prototype.value, unserializableValue?: string, description?: string, preview?: Protocol.Runtime.ObjectPreview);
    doGetProperties(ownProperties: boolean, accessorPropertiesOnly: boolean, _generatePreview: boolean): Promise<GetPropertiesResult>;
    doSetObjectPropertyValue(result: Protocol.Runtime.RemoteObject, argumentName: Protocol.Runtime.CallArgument): Promise<string | undefined>;
}
export declare class ScopeRef {
    readonly number: number;
    readonly callFrameId: Protocol.Debugger.CallFrameId;
    constructor(number: number, callFrameId: Protocol.Debugger.CallFrameId);
}
export declare class RemoteObjectProperty {
    name: string;
    value?: RemoteObject;
    enumerable: boolean;
    writable: boolean;
    isOwn: boolean;
    wasThrown: boolean;
    symbol: RemoteObject | undefined;
    synthetic: boolean;
    syntheticSetter: ((arg0: string) => Promise<RemoteObject | null>) | undefined;
    private: boolean;
    getter: RemoteObject | undefined;
    setter: RemoteObject | undefined;
    webIdl?: RemoteObjectWebIdlPropertyMetadata;
    constructor(name: string, value: RemoteObject | null, enumerable?: boolean, writable?: boolean, isOwn?: boolean, wasThrown?: boolean, symbol?: RemoteObject | null, synthetic?: boolean, syntheticSetter?: ((arg0: string) => Promise<RemoteObject | null>), isPrivate?: boolean);
    setSyntheticValue(expression: string): Promise<boolean>;
    isAccessorProperty(): boolean;
    match({ includeNullOrUndefinedValues, regex }: {
        includeNullOrUndefinedValues: boolean;
        regex: RegExp | null;
    }): boolean;
    cloneWithNewName(newName: string): RemoteObjectProperty;
}
export declare class LocalJSONObject extends RemoteObject {
    #private;
    constructor(value: typeof RemoteObject.prototype.value);
    get objectId(): Protocol.Runtime.RemoteObjectId | undefined;
    get value(): typeof RemoteObject.prototype.value;
    unserializableValue(): string | undefined;
    get description(): string;
    private formatValue;
    private concatenate;
    get type(): string;
    get subtype(): string | undefined;
    get hasChildren(): boolean;
    getOwnProperties(_generatePreview: boolean, nonIndexedPropertiesOnly?: boolean): Promise<GetPropertiesResult>;
    getAllProperties(accessorPropertiesOnly: boolean, generatePreview: boolean, nonIndexedPropertiesOnly?: boolean): Promise<GetPropertiesResult>;
    private children;
    arrayLength(): number;
    callFunction<T, U>(functionDeclaration: (this: U, ...args: any[]) => T, args?: Protocol.Runtime.CallArgument[]): Promise<CallFunctionResult>;
    callFunctionJSON<T, U>(functionDeclaration: (this: U, ...args: any[]) => T, args: Protocol.Runtime.CallArgument[] | undefined): Promise<T | null>;
}
export declare class RemoteArrayBuffer {
    #private;
    constructor(object: RemoteObject);
    byteLength(): number;
    bytes(start?: number, end?: number): Promise<number[] | null>;
    object(): RemoteObject;
}
export declare class RemoteArray {
    #private;
    constructor(object: RemoteObject);
    static objectAsArray(object: RemoteObject | null): RemoteArray;
    static createFromRemoteObjects(objects: RemoteObject[]): Promise<RemoteArray>;
    at(index: number): Promise<RemoteObject>;
    length(): number;
    map<T>(func: (arg0: RemoteObject) => Promise<T>): Promise<T[]>;
    object(): RemoteObject;
}
export declare class RemoteFunction {
    #private;
    constructor(object: RemoteObject);
    static objectAsFunction(object: RemoteObject): RemoteFunction;
    targetFunction(): Promise<RemoteObject>;
    targetFunctionDetails(): Promise<FunctionDetails | null>;
}
export declare class RemoteError {
    #private;
    private constructor();
    static objectAsError(object: RemoteObject): RemoteError;
    get errorStack(): string;
    exceptionDetails(): Promise<Protocol.Runtime.ExceptionDetails | undefined>;
    cause(): Promise<RemoteObject | undefined>;
}
export interface CallFunctionResult {
    object: RemoteObject | null;
    wasThrown?: boolean;
}
export interface GetPropertiesResult {
    properties: RemoteObjectProperty[] | null;
    internalProperties: RemoteObjectProperty[] | null;
}
export interface RemoteObjectWebIdlTypeMetadata {
    info: DOMPinnedWebIDLType;
    state: Map<string, string>;
}
export interface RemoteObjectWebIdlPropertyMetadata {
    info: DOMPinnedWebIDLProp;
    applicable?: boolean;
}
/**
 * Pair of a linear memory inspectable {@link RemoteObject} and an optional
 * expression, which identifies the variable holding the object in the
 * current scope or the name of the field holding the object.
 *
 * This data structure is used to reveal an object in the Linear Memory
 * Inspector panel.
 */
export declare class LinearMemoryInspectable {
    /** The linear memory inspectable {@link RemoteObject}. */
    readonly object: RemoteObject;
    /** The name of the variable or the field holding the `object`. */
    readonly expression: string | undefined;
    /**
     * Wrap `object` and `expression` into a reveable structure.
     *
     * @param object A linear memory inspectable {@link RemoteObject}.
     * @param expression An optional name of the field or variable holding the `object`.
     */
    constructor(object: RemoteObject, expression?: string);
}
export {};
