import type * as Protocol from '../../generated/protocol.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class CrashReportContextModel extends SDKModel<void> {
    #private;
    constructor(target: Target);
    getEntries(): Promise<Protocol.CrashReportContext.CrashReportContextEntry[] | null>;
}
