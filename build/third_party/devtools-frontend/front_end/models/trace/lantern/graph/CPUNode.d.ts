import type * as Lantern from '../types/types.js';
import { BaseNode } from './BaseNode.js';
declare class CPUNode<T = Lantern.AnyNetworkObject> extends BaseNode<T> {
    #private;
    _event: Lantern.TraceEvent;
    _childEvents: Lantern.TraceEvent[];
    correctedEndTs: number | undefined;
    constructor(parentEvent: Lantern.TraceEvent, childEvents?: Lantern.TraceEvent[], correctedEndTs?: number, scriptUrlById?: ReadonlyMap<number, string>);
    get type(): 'cpu';
    get startTime(): number;
    get endTime(): number;
    get duration(): number;
    get event(): Lantern.TraceEvent;
    get childEvents(): Lantern.TraceEvent[];
    getScriptUrlById(scriptId: number): string | undefined;
    /**
     * Returns true if this node contains a Layout task.
     */
    didPerformLayout(): boolean;
    /**
     * Returns the script URLs that had their EvaluateScript or v8.evaluateModule events occur in this task.
     */
    getEvaluateScriptURLs(): Set<string>;
    cloneWithoutRelationships(): CPUNode;
}
export { CPUNode };
