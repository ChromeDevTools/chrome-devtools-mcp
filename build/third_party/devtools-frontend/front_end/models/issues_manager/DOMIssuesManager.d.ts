import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import type { Issue } from './Issue.js';
import type { IssuesManager } from './IssuesManager.js';
export declare const enum Events {
    DOM_ISSUE_ADDED = "DOMIssueAdded",
    DOM_ISSUE_REMOVED = "DOMIssueRemoved"
}
export interface EventTypes {
    [Events.DOM_ISSUE_ADDED]: {
        node: SDK.DOMModel.DOMNode;
        issue: Issue;
    };
    [Events.DOM_ISSUE_REMOVED]: {
        node: SDK.DOMModel.DOMNode;
        issue: Issue;
    };
}
export declare class DOMIssuesManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(issuesManager: IssuesManager, targetManager: SDK.TargetManager.TargetManager);
    subscribeByNodeId(nodeId: Protocol.DOM.NodeId, callback: () => void): void;
    unsubscribeByNodeId(nodeId: Protocol.DOM.NodeId, callback: () => void): void;
    issuesForNode(node: SDK.DOMModel.DOMNode): Issue[];
}
