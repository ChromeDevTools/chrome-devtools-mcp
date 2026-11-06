import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
/**
 * The `IssuesModel` is a thin dispatch that does not store issues, but only creates the representation
 * class (usually derived from `Issue`) and passes the instances on via a dispatched event.
 * We chose this approach here because the lifetime of the Model is tied to the target, but DevTools
 * wants to preserve issues for targets (e.g. iframes) that are already gone as well.
 */
export declare class IssuesModel extends SDKModel<EventTypes> implements ProtocolProxyApi.AuditsDispatcher {
    #private;
    constructor(target: Target);
    private ensureEnabled;
    issueAdded(issueAddedEvent: Protocol.Audits.IssueAddedEvent): void;
    dispose(): void;
    getTargetIfNotDisposed(): Target | null;
}
export declare const enum Events {
    ISSUE_ADDED = "IssueAdded"
}
export interface IssueAddedEvent {
    issuesModel: IssuesModel;
    inspectorIssue: Protocol.Audits.InspectorIssue;
}
export interface EventTypes {
    [Events.ISSUE_ADDED]: IssueAddedEvent;
}
