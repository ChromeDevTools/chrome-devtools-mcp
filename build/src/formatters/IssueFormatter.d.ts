/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools } from '../third_party/index.js';
export interface IssueFormatterOptions {
    requestIdResolver?: (requestId: string) => number | undefined;
    elementIdResolver?: (backendNodeId: number) => string | undefined;
    id: number;
}
export interface AffectedResource {
    uid?: string;
    data?: unknown;
    request?: string | number;
}
interface IssueConcise {
    type: 'issue';
    title?: string;
    count: number;
    id: number;
}
interface IssueDetailed extends IssueConcise {
    description?: string;
    links?: Array<{
        link: string;
        linkTitle: string;
    }>;
    affectedResources: AffectedResource[];
}
export declare class IssueFormatter {
    #private;
    constructor(issue: DevTools.AggregatedIssue, options: IssueFormatterOptions);
    toString(): string;
    toStringDetailed(): string;
    toJSON(): IssueConcise;
    toJSONDetailed(): IssueDetailed;
    isValid(): boolean;
}
export {};
