// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import * as TextUtils from '../../../core/text_utils/text_utils.js';
import * as Logs from '../../logs/logs.js';
import * as Trace from '../../trace/trace.js';
import { PerformanceInsightFormatter } from '../data_formatters/PerformanceInsightFormatter.js';
import { debugLog } from '../debug.js';
import { MAX_FUNCTION_RESULT_BYTE_LENGTH, } from './Tool.js';
const lockedString = i18n.i18n.lockedString;
async function getNetworkRequestImageData(target, lcpRequest, 
// eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
networkLog = Logs.NetworkLog.NetworkLog.instance()) {
    const networkManager = target?.model(SDK.NetworkManager.NetworkManager);
    if (!target || !networkManager) {
        return undefined;
    }
    const requestId = lcpRequest.args.data.requestId;
    const sdkRequest = networkLog.requestByManagerAndId(networkManager, requestId);
    if (sdkRequest?.contentType().isImage()) {
        const contentData = await sdkRequest.requestContentData();
        if (!TextUtils.ContentData.ContentData.isError(contentData)) {
            return contentData;
        }
    }
    return undefined;
}
export class GetInsightDetailsTool {
    name = "getInsightDetails" /* ToolName.GET_INSIGHT_DETAILS */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Retrieves detailed metrics, subpart timing breakdowns, related DOM elements, and diagnostic data for a performance insight (e.g., \'LCPBreakdown\', \'LCPDiscovery\', \'RenderBlocking\', \'CLSCulprits\', \'INPBreakdown\', \'ThirdParties\'). Use this before commenting on any specific performance issue.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Arguments for getting insight details.',
        nullable: false,
        properties: {
            insightSetId: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'The id for the specific insight set. Only use the ids given in the "Available insight sets" list.',
                nullable: false,
            },
            insightName: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'The name of the insight. Only use the insight names given in the "Available insights" list.',
                nullable: false,
            },
        },
        required: ['insightSetId', 'insightName'],
    };
    displayInfoFromArgs(params) {
        return {
            title: lockedString(`Investigating insight ${params.insightName}`),
            action: `getInsightDetails('${params.insightSetId}', '${params.insightName}')`,
        };
    }
    async #generateDOMTreeWidget(insight, insightSet, target) {
        try {
            if (!Trace.Insights.Models.LCPDiscovery.isLCPDiscoveryInsight(insight) &&
                !Trace.Insights.Models.LCPBreakdown.isLCPBreakdownInsight(insight)) {
                return null;
            }
            const lcpMetric = Trace.Insights.Common.getLCP(insightSet);
            const lcpEvent = lcpMetric?.event;
            if (!lcpEvent || !Trace.Types.Events.isAnyLargestContentfulPaintCandidate(lcpEvent)) {
                return null;
            }
            const nodeId = lcpEvent.args.data?.nodeId;
            if (!nodeId) {
                return null;
            }
            const domModel = target?.model(SDK.DOMModel.DOMModel);
            if (!domModel) {
                return null;
            }
            const nodeMap = await domModel.pushNodesByBackendIdsToFrontend(new Set([nodeId]));
            const node = nodeMap?.get(nodeId);
            if (!node) {
                return null;
            }
            const lcpSyntheticRequest = insight.lcpRequest;
            const [snapshot, imageContent] = await Promise.all([
                node.takeSnapshot(),
                lcpSyntheticRequest ? getNetworkRequestImageData(target, lcpSyntheticRequest) : Promise.resolve(undefined),
            ]);
            let networkRequest;
            if (lcpSyntheticRequest) {
                networkRequest = {
                    url: lcpSyntheticRequest.args.data.url,
                    size: lcpSyntheticRequest.args.data.decodedBodyLength ?? lcpSyntheticRequest.args.data.encodedDataLength ?? 0,
                    resourceType: lcpSyntheticRequest.args.data.resourceType,
                    mimeType: lcpSyntheticRequest.args.data.mimeType ?? '',
                    imageContent,
                };
            }
            return {
                name: 'DOM_TREE',
                data: {
                    root: snapshot,
                    networkRequest,
                    title: lockedString('LCP element'),
                    accessibleRevealLabel: lockedString('Reveal LCP element'),
                },
            };
        }
        catch (err) {
            debugLog('GetInsightDetails: Failed to generate DOM tree widget', err);
            return null;
        }
    }
    async handler(params, capabilities) {
        const performanceTraceContext = capabilities.getPerformanceTraceContext();
        if (!performanceTraceContext) {
            return { error: 'Performance trace context is not available.' };
        }
        if (!params.insightSetId || !params.insightName) {
            return { error: 'Missing required arguments: insightSetId and insightName must be provided.' };
        }
        const focus = performanceTraceContext.getItem();
        const parsedTrace = focus.parsedTrace;
        const insightSet = parsedTrace.insights?.get(params.insightSetId);
        if (!insightSet) {
            const formatter = performanceTraceContext.createFormatter();
            const valid = ([...parsedTrace.insights?.values() ?? []])
                .map(insightSet => `id: ${insightSet.id}, url: ${insightSet.url}, bounds: ${formatter.serializeBounds(insightSet.bounds)}`)
                .join('; ');
            return { error: `Invalid insight set id. Valid insight set ids are: ${valid || '(none)'}` };
        }
        if (!Trace.Insights.Common.isInsightKey(params.insightName)) {
            const valid = Object.keys(insightSet.model).join(', ');
            return { error: `No insight available. Valid insight names are: ${valid || '(none)'}` };
        }
        const insightError = insightSet.modelErrors?.[params.insightName];
        if (insightError) {
            return { error: `Insight "${params.insightName}" failed during trace processing: ${insightError.message}` };
        }
        const insight = insightSet.model[params.insightName];
        if (!insight) {
            const valid = Object.keys(insightSet.model).join(', ');
            return { error: `No insight available. Valid insight names are: ${valid || '(none)'}` };
        }
        const details = new PerformanceInsightFormatter(focus, insight).formatInsight();
        if (details.length > MAX_FUNCTION_RESULT_BYTE_LENGTH) {
            return {
                error: 'The insight details output is too large to fit in the context window. Please inspect specific events using getTraceEventByKey or getDetailedCallTree.',
            };
        }
        const widgets = [];
        const isImportedTrace = performanceTraceContext.isImported();
        if (!isImportedTrace) {
            const domTreeWidget = await this.#generateDOMTreeWidget(insight, insightSet, capabilities.getTarget());
            if (domTreeWidget) {
                widgets.push(domTreeWidget);
            }
        }
        widgets.push({
            name: 'PERF_INSIGHT',
            data: {
                insight: params.insightName,
                insightData: insight,
            },
        });
        return { result: details, widgets };
    }
}
//# sourceMappingURL=GetInsightDetails.js.map