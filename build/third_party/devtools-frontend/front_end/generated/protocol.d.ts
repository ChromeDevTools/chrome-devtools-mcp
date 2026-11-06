/**
 * This file is auto-generated, do not edit manually. *
 * Re-generate with: scripts/tools/dt.py generate-protocol-resources.
 */
export type integer = number;
export type binary = string;
export type EnumerableEnum<T> = {
    [K in keyof T]: T[K];
};
export interface ProtocolResponseWithError {
    /** Returns an error message if the request failed. */
    getError(): string | undefined;
}
type OpaqueType<Tag extends string> = {
    protocolOpaqueTypeTag: Tag;
};
type OpaqueIdentifier<RepresentationType, Tag extends string> = RepresentationType & OpaqueType<Tag>;
export declare namespace Accessibility {
    /**
     * Unique accessibility node identifier.
     */
    type AXNodeId = OpaqueIdentifier<string, 'Protocol.Accessibility.AXNodeId'>;
    /**
     * Enum of possible property types.
     */
    const enum AXValueType {
        Boolean = "boolean",
        Tristate = "tristate",
        BooleanOrUndefined = "booleanOrUndefined",
        Idref = "idref",
        IdrefList = "idrefList",
        Integer = "integer",
        Node = "node",
        NodeList = "nodeList",
        Number = "number",
        String = "string",
        ComputedString = "computedString",
        Token = "token",
        TokenList = "tokenList",
        DomRelation = "domRelation",
        Role = "role",
        InternalRole = "internalRole",
        ValueUndefined = "valueUndefined"
    }
    /**
     * Enum of possible property sources.
     */
    const enum AXValueSourceType {
        Attribute = "attribute",
        Implicit = "implicit",
        Style = "style",
        Contents = "contents",
        Placeholder = "placeholder",
        RelatedElement = "relatedElement"
    }
    /**
     * Enum of possible native property sources (as a subtype of a particular AXValueSourceType).
     */
    const enum AXValueNativeSourceType {
        Description = "description",
        Figcaption = "figcaption",
        Label = "label",
        Labelfor = "labelfor",
        Labelwrapped = "labelwrapped",
        Legend = "legend",
        Rubyannotation = "rubyannotation",
        Tablecaption = "tablecaption",
        Title = "title",
        Other = "other"
    }
    /**
     * A single source for a computed AX property.
     */
    interface AXValueSource {
        /**
         * What type of source this is.
         */
        type: AXValueSourceType;
        /**
         * The value of this property source.
         */
        value?: AXValue;
        /**
         * The name of the relevant attribute, if any.
         */
        attribute?: string;
        /**
         * The value of the relevant attribute, if any.
         */
        attributeValue?: AXValue;
        /**
         * Whether this source is superseded by a higher priority source.
         */
        superseded?: boolean;
        /**
         * The native markup source for this value, e.g. a `<label>` element.
         */
        nativeSource?: AXValueNativeSourceType;
        /**
         * The value, such as a node or node list, of the native source.
         */
        nativeSourceValue?: AXValue;
        /**
         * Whether the value for this property is invalid.
         */
        invalid?: boolean;
        /**
         * Reason for the value being invalid, if it is.
         */
        invalidReason?: string;
    }
    interface AXRelatedNode {
        /**
         * The BackendNodeId of the related DOM node.
         */
        backendDOMNodeId: DOM.BackendNodeId;
        /**
         * The IDRef value provided, if any.
         */
        idref?: string;
        /**
         * The text alternative of this node in the current context.
         */
        text?: string;
    }
    interface AXProperty {
        /**
         * The name of this property.
         */
        name: AXPropertyName;
        /**
         * The value of this property.
         */
        value: AXValue;
    }
    /**
     * A single computed AX property.
     */
    interface AXValue {
        /**
         * The type of this value.
         */
        type: AXValueType;
        /**
         * The computed value of this property.
         */
        value?: any;
        /**
         * One or more related nodes, if applicable.
         */
        relatedNodes?: AXRelatedNode[];
        /**
         * The sources which contributed to the computation of this property.
         */
        sources?: AXValueSource[];
    }
    /**
     * Values of AXProperty name:
     * - from 'busy' to 'roledescription': states which apply to every AX node
     * - from 'live' to 'root': attributes which apply to nodes in live regions
     * - from 'autocomplete' to 'valuetext': attributes which apply to widgets
     * - from 'checked' to 'selected': states which apply to widgets
     * - from 'activedescendant' to 'owns': relationships between elements other than parent/child/sibling
     * - from 'activeFullscreenElement' to 'uninteresting': reasons why this noode is hidden
     */
    const enum AXPropertyName {
        Actions = "actions",
        Busy = "busy",
        Disabled = "disabled",
        Editable = "editable",
        Focusable = "focusable",
        Focused = "focused",
        Hidden = "hidden",
        HiddenRoot = "hiddenRoot",
        Invalid = "invalid",
        Keyshortcuts = "keyshortcuts",
        Settable = "settable",
        Roledescription = "roledescription",
        Live = "live",
        Atomic = "atomic",
        Relevant = "relevant",
        Root = "root",
        Autocomplete = "autocomplete",
        HasPopup = "hasPopup",
        Level = "level",
        Multiselectable = "multiselectable",
        Orientation = "orientation",
        Multiline = "multiline",
        Readonly = "readonly",
        Required = "required",
        Valuemin = "valuemin",
        Valuemax = "valuemax",
        Valuetext = "valuetext",
        Checked = "checked",
        Expanded = "expanded",
        Modal = "modal",
        Pressed = "pressed",
        Selected = "selected",
        Activedescendant = "activedescendant",
        Controls = "controls",
        Describedby = "describedby",
        Details = "details",
        Errormessage = "errormessage",
        Flowto = "flowto",
        Labelledby = "labelledby",
        Owns = "owns",
        Url = "url",
        ActiveFullscreenElement = "activeFullscreenElement",
        ActiveModalDialog = "activeModalDialog",
        ActiveAriaModalDialog = "activeAriaModalDialog",
        AriaHiddenElement = "ariaHiddenElement",
        AriaHiddenSubtree = "ariaHiddenSubtree",
        EmptyAlt = "emptyAlt",
        EmptyText = "emptyText",
        InertElement = "inertElement",
        InertSubtree = "inertSubtree",
        LabelContainer = "labelContainer",
        LabelFor = "labelFor",
        NotRendered = "notRendered",
        NotVisible = "notVisible",
        PresentationalRole = "presentationalRole",
        ProbablyPresentational = "probablyPresentational",
        InactiveCarouselTabContent = "inactiveCarouselTabContent",
        Uninteresting = "uninteresting"
    }
    /**
     * A node in the accessibility tree.
     */
    interface AXNode {
        /**
         * Unique identifier for this node.
         */
        nodeId: AXNodeId;
        /**
         * Whether this node is ignored for accessibility
         */
        ignored: boolean;
        /**
         * Collection of reasons why this node is hidden.
         */
        ignoredReasons?: AXProperty[];
        /**
         * This `Node`'s role, whether explicit or implicit.
         */
        role?: AXValue;
        /**
         * This `Node`'s Chrome raw role.
         */
        chromeRole?: AXValue;
        /**
         * The accessible name for this `Node`.
         */
        name?: AXValue;
        /**
         * The accessible description for this `Node`.
         */
        description?: AXValue;
        /**
         * The value for this `Node`.
         */
        value?: AXValue;
        /**
         * All other properties
         */
        properties?: AXProperty[];
        /**
         * ID for this node's parent.
         */
        parentId?: AXNodeId;
        /**
         * IDs for each of this node's child nodes.
         */
        childIds?: AXNodeId[];
        /**
         * The backend ID for the associated DOM node, if any.
         */
        backendDOMNodeId?: DOM.BackendNodeId;
        /**
         * The frame ID for the frame associated with this nodes document.
         */
        frameId?: Page.FrameId;
    }
    interface GetPartialAXTreeRequest {
        /**
         * Identifier of the node to get the partial accessibility tree for.
         */
        nodeId?: DOM.NodeId;
        /**
         * Identifier of the backend node to get the partial accessibility tree for.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * JavaScript object id of the node wrapper to get the partial accessibility tree for.
         */
        objectId?: Runtime.RemoteObjectId;
        /**
         * Whether to fetch this node's ancestors, siblings and children. Defaults to true.
         */
        fetchRelatives?: boolean;
    }
    interface GetPartialAXTreeResponse extends ProtocolResponseWithError {
        /**
         * The `Accessibility.AXNode` for this DOM node, if it exists, plus its ancestors, siblings and
         * children, if requested.
         */
        nodes: AXNode[];
    }
    interface GetFullAXTreeRequest {
        /**
         * The maximum depth at which descendants of the root node should be retrieved.
         * If omitted, the full tree is returned.
         */
        depth?: integer;
        /**
         * The frame for whose document the AX tree should be retrieved.
         * If omitted, the root frame is used.
         */
        frameId?: Page.FrameId;
    }
    interface GetFullAXTreeResponse extends ProtocolResponseWithError {
        nodes: AXNode[];
    }
    interface GetRootAXNodeRequest {
        /**
         * The frame in whose document the node resides.
         * If omitted, the root frame is used.
         */
        frameId?: Page.FrameId;
    }
    interface GetRootAXNodeResponse extends ProtocolResponseWithError {
        node: AXNode;
    }
    interface GetAXNodeAndAncestorsRequest {
        /**
         * Identifier of the node to get.
         */
        nodeId?: DOM.NodeId;
        /**
         * Identifier of the backend node to get.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * JavaScript object id of the node wrapper to get.
         */
        objectId?: Runtime.RemoteObjectId;
    }
    interface GetAXNodeAndAncestorsResponse extends ProtocolResponseWithError {
        nodes: AXNode[];
    }
    interface GetChildAXNodesRequest {
        id: AXNodeId;
        /**
         * The frame in whose document the node resides.
         * If omitted, the root frame is used.
         */
        frameId?: Page.FrameId;
    }
    interface GetChildAXNodesResponse extends ProtocolResponseWithError {
        nodes: AXNode[];
    }
    interface QueryAXTreeRequest {
        /**
         * Identifier of the node for the root to query.
         */
        nodeId?: DOM.NodeId;
        /**
         * Identifier of the backend node for the root to query.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * JavaScript object id of the node wrapper for the root to query.
         */
        objectId?: Runtime.RemoteObjectId;
        /**
         * Find nodes with this computed name.
         */
        accessibleName?: string;
        /**
         * Find nodes with this computed role.
         */
        role?: string;
    }
    interface QueryAXTreeResponse extends ProtocolResponseWithError {
        /**
         * A list of `Accessibility.AXNode` matching the specified attributes,
         * including nodes that are ignored for accessibility.
         */
        nodes: AXNode[];
    }
    /**
     * The loadComplete event mirrors the load complete event sent by the browser to assistive
     * technology when the web page has finished loading.
     */
    interface LoadCompleteEvent {
        /**
         * New document root node.
         */
        root: AXNode;
    }
    /**
     * The nodesUpdated event is sent every time a previously requested node has changed the in tree.
     */
    interface NodesUpdatedEvent {
        /**
         * Updated node data.
         */
        nodes: AXNode[];
    }
}
/**
 * A domain for ad-related metrics and data.
 */
export declare namespace Ads {
    /**
     * Ad frame data.
     */
    interface AdFrameData {
        /**
         * The DevTools frame token.
         */
        frameId: Page.FrameId;
        /**
         * The initial origin of the frame. To minimize the payload size, this is
         * only sent once per frame.
         */
        initialOrigin?: string;
        /**
         * The network bytes of the frame.
         */
        networkBytes: number;
        /**
         * The CPU time of the frame, in milliseconds.
         */
        cpuTime: number;
    }
    /**
     * Ad metrics for a page.
     */
    interface AdMetrics {
        /**
         * The viewport ad density by area, represented as a percentage (an integer
         * between 0 and 100).
         */
        viewportAdDensityByArea: integer;
        /**
         * The time-weighted average of the viewport ad density by area, measured
         * across the duration of the page.
         */
        averageViewportAdDensityByArea: number;
        /**
         * The number of ads currently visible within the viewport.
         */
        viewportAdCount: integer;
        /**
         * The time-weighted average of the viewport ad count, measured across the
         * duration of the page.
         */
        averageViewportAdCount: number;
        /**
         * The total ad CPU usage, in milliseconds.
         */
        totalAdCpuTime: number;
        /**
         * The total ad network bytes.
         */
        totalAdNetworkBytes: number;
        /**
         * The list of ad frames that have been updated since the last event.
         */
        updateAdFrames: AdFrameData[];
        /**
         * The list of ad frame IDs that have been removed since the last event.
         */
        removeAdFrames: Page.FrameId[];
    }
    /**
     * An ad script.
     * Note: when the script is a transitive ad script, we only fill in the
     * immediate ancestor script in the provenance's adScriptAncestry field (as its
     * first entry), rather than filling in the full ancestry. This saves work for
     * the backend, and the frontend can reconstruct the full ancestry if
     * necessary.
     */
    interface AdScript {
        /**
         * The script ID.
         */
        scriptId: Runtime.ScriptId;
        /**
         * The ad provenance.
         */
        provenance: Network.AdProvenance;
    }
    interface GetAdMetricsResponse extends ProtocolResponseWithError {
        metrics: AdMetrics;
    }
    interface GetAdScriptsResponse extends ProtocolResponseWithError {
        newScripts: AdScript[];
    }
}
export declare namespace Animation {
    const enum AnimationType {
        CSSTransition = "CSSTransition",
        CSSAnimation = "CSSAnimation",
        WebAnimation = "WebAnimation"
    }
    /**
     * Animation instance.
     */
    interface Animation {
        /**
         * `Animation`'s id.
         */
        id: string;
        /**
         * `Animation`'s name.
         */
        name: string;
        /**
         * `Animation`'s internal paused state.
         */
        pausedState: boolean;
        /**
         * `Animation`'s play state.
         */
        playState: string;
        /**
         * `Animation`'s playback rate.
         */
        playbackRate: number;
        /**
         * `Animation`'s start time.
         * Milliseconds for time based animations and
         * percentage [0 - 100] for scroll driven animations
         * (i.e. when viewOrScrollTimeline exists).
         */
        startTime: number;
        /**
         * `Animation`'s current time.
         */
        currentTime: number;
        /**
         * Animation type of `Animation`.
         */
        type: AnimationType;
        /**
         * `Animation`'s source animation node.
         */
        source?: AnimationEffect;
        /**
         * A unique ID for `Animation` representing the sources that triggered this CSS
         * animation/transition.
         */
        cssId?: string;
        /**
         * View or scroll timeline
         */
        viewOrScrollTimeline?: ViewOrScrollTimeline;
    }
    /**
     * Timeline instance
     */
    interface ViewOrScrollTimeline {
        /**
         * Scroll container node
         */
        sourceNodeId?: DOM.BackendNodeId;
        /**
         * Represents the starting scroll position of the timeline
         * as a length offset in pixels from scroll origin.
         */
        startOffset?: number;
        /**
         * Represents the ending scroll position of the timeline
         * as a length offset in pixels from scroll origin.
         */
        endOffset?: number;
        /**
         * The element whose principal box's visibility in the
         * scrollport defined the progress of the timeline.
         * Does not exist for animations with ScrollTimeline
         */
        subjectNodeId?: DOM.BackendNodeId;
        /**
         * Orientation of the scroll
         */
        axis: DOM.ScrollOrientation;
    }
    /**
     * AnimationEffect instance
     */
    interface AnimationEffect {
        /**
         * `AnimationEffect`'s delay.
         */
        delay: number;
        /**
         * `AnimationEffect`'s end delay.
         */
        endDelay: number;
        /**
         * `AnimationEffect`'s iteration start.
         */
        iterationStart: number;
        /**
         * `AnimationEffect`'s iterations. Omitted if the value is infinite.
         */
        iterations?: number;
        /**
         * `AnimationEffect`'s iteration duration.
         * Milliseconds for time based animations and
         * percentage [0 - 100] for scroll driven animations
         * (i.e. when viewOrScrollTimeline exists).
         */
        duration: number;
        /**
         * `AnimationEffect`'s playback direction.
         */
        direction: string;
        /**
         * `AnimationEffect`'s fill mode.
         */
        fill: string;
        /**
         * `AnimationEffect`'s target node.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * `AnimationEffect`'s keyframes.
         */
        keyframesRule?: KeyframesRule;
        /**
         * `AnimationEffect`'s timing function.
         */
        easing: string;
    }
    /**
     * Keyframes Rule
     */
    interface KeyframesRule {
        /**
         * CSS keyframed animation's name.
         */
        name?: string;
        /**
         * List of animation keyframes.
         */
        keyframes: KeyframeStyle[];
    }
    /**
     * Keyframe Style
     */
    interface KeyframeStyle {
        /**
         * Keyframe's time offset.
         */
        offset: string;
        /**
         * `AnimationEffect`'s timing function.
         */
        easing: string;
    }
    interface GetCurrentTimeRequest {
        /**
         * Id of animation.
         */
        id: string;
    }
    interface GetCurrentTimeResponse extends ProtocolResponseWithError {
        /**
         * Current time of the page.
         */
        currentTime: number;
    }
    interface GetPlaybackRateResponse extends ProtocolResponseWithError {
        /**
         * Playback rate for animations on page.
         */
        playbackRate: number;
    }
    interface ReleaseAnimationsRequest {
        /**
         * List of animation ids to seek.
         */
        animations: string[];
    }
    interface ResolveAnimationRequest {
        /**
         * Animation id.
         */
        animationId: string;
    }
    interface ResolveAnimationResponse extends ProtocolResponseWithError {
        /**
         * Corresponding remote object.
         */
        remoteObject: Runtime.RemoteObject;
    }
    interface SeekAnimationsRequest {
        /**
         * List of animation ids to seek.
         */
        animations: string[];
        /**
         * Set each animation to the same time.
         */
        currentTime?: number;
        /**
         * Set each animation to a different time. If set, should have the same
         * length as animations. Exactly one of currentTime or currentTimes should
         * be set.
         */
        currentTimes?: number[];
    }
    interface SetPausedRequest {
        /**
         * Animations to set the pause state of.
         */
        animations: string[];
        /**
         * Paused state to set to.
         */
        paused: boolean;
    }
    interface SetPlaybackRateRequest {
        /**
         * Playback rate for animations on page
         */
        playbackRate: number;
    }
    interface SetTimingRequest {
        /**
         * Animation id.
         */
        animationId: string;
        /**
         * Duration of the animation.
         */
        duration: number;
        /**
         * Delay of the animation.
         */
        delay: number;
    }
    /**
     * Event for when an animation has been cancelled.
     */
    interface AnimationCanceledEvent {
        /**
         * Id of the animation that was cancelled.
         */
        id: string;
    }
    /**
     * Event for each animation that has been created.
     */
    interface AnimationCreatedEvent {
        /**
         * Id of the animation that was created.
         */
        id: string;
    }
    /**
     * Event for animation that has been started.
     */
    interface AnimationStartedEvent {
        /**
         * Animation that was started.
         */
        animation: Animation;
    }
    /**
     * Event for animation that has been updated.
     */
    interface AnimationUpdatedEvent {
        /**
         * Animation that was updated.
         */
        animation: Animation;
    }
}
/**
 * Audits domain allows investigation of page violations and possible improvements.
 */
export declare namespace Audits {
    /**
     * Information about a cookie that is affected by an inspector issue.
     */
    interface AffectedCookie {
        /**
         * The following three properties uniquely identify a cookie
         */
        name: string;
        path: string;
        domain: string;
    }
    /**
     * Information about a request that is affected by an inspector issue.
     */
    interface AffectedRequest {
        /**
         * The unique request id.
         */
        requestId?: Network.RequestId;
        url: string;
    }
    /**
     * Information about the frame affected by an inspector issue.
     */
    interface AffectedFrame {
        frameId: Page.FrameId;
    }
    const enum CookieExclusionReason {
        ExcludeSameSiteUnspecifiedTreatedAsLax = "ExcludeSameSiteUnspecifiedTreatedAsLax",
        ExcludeSameSiteNoneInsecure = "ExcludeSameSiteNoneInsecure",
        ExcludeSameSiteLax = "ExcludeSameSiteLax",
        ExcludeSameSiteStrict = "ExcludeSameSiteStrict",
        ExcludeDomainNonASCII = "ExcludeDomainNonASCII",
        ExcludeThirdPartyPhaseout = "ExcludeThirdPartyPhaseout",
        ExcludePortMismatch = "ExcludePortMismatch",
        ExcludeSchemeMismatch = "ExcludeSchemeMismatch"
    }
    const enum CookieWarningReason {
        WarnSameSiteUnspecifiedCrossSiteContext = "WarnSameSiteUnspecifiedCrossSiteContext",
        WarnSameSiteNoneInsecure = "WarnSameSiteNoneInsecure",
        WarnSameSiteUnspecifiedLaxAllowUnsafe = "WarnSameSiteUnspecifiedLaxAllowUnsafe",
        WarnSameSiteStrictLaxDowngradeStrict = "WarnSameSiteStrictLaxDowngradeStrict",
        WarnSameSiteStrictCrossDowngradeStrict = "WarnSameSiteStrictCrossDowngradeStrict",
        WarnSameSiteStrictCrossDowngradeLax = "WarnSameSiteStrictCrossDowngradeLax",
        WarnSameSiteLaxCrossDowngradeStrict = "WarnSameSiteLaxCrossDowngradeStrict",
        WarnSameSiteLaxCrossDowngradeLax = "WarnSameSiteLaxCrossDowngradeLax",
        WarnAttributeValueExceedsMaxSize = "WarnAttributeValueExceedsMaxSize",
        WarnDomainNonASCII = "WarnDomainNonASCII",
        WarnThirdPartyPhaseout = "WarnThirdPartyPhaseout",
        WarnCrossSiteRedirectDowngradeChangesInclusion = "WarnCrossSiteRedirectDowngradeChangesInclusion",
        WarnDeprecationTrialMetadata = "WarnDeprecationTrialMetadata",
        WarnThirdPartyCookieHeuristic = "WarnThirdPartyCookieHeuristic"
    }
    const enum CookieOperation {
        SetCookie = "SetCookie",
        ReadCookie = "ReadCookie"
    }
    /**
     * Represents the category of insight that a cookie issue falls under.
     */
    const enum InsightType {
        GitHubResource = "GitHubResource",
        GracePeriod = "GracePeriod",
        Heuristics = "Heuristics"
    }
    /**
     * Information about the suggested solution to a cookie issue.
     */
    interface CookieIssueInsight {
        type: InsightType;
        /**
         * Link to table entry in third-party cookie migration readiness list.
         */
        tableEntryUrl?: string;
    }
    /**
     * This information is currently necessary, as the front-end has a difficult
     * time finding a specific cookie. With this, we can convey specific error
     * information without the cookie.
     */
    interface CookieIssueDetails {
        /**
         * If AffectedCookie is not set then rawCookieLine contains the raw
         * Set-Cookie header string. This hints at a problem where the
         * cookie line is syntactically or semantically malformed in a way
         * that no valid cookie could be created.
         */
        cookie?: AffectedCookie;
        rawCookieLine?: string;
        cookieWarningReasons: CookieWarningReason[];
        cookieExclusionReasons: CookieExclusionReason[];
        /**
         * Optionally identifies the site-for-cookies and the cookie url, which
         * may be used by the front-end as additional context.
         */
        operation: CookieOperation;
        siteForCookies?: string;
        cookieUrl?: string;
        request?: AffectedRequest;
        /**
         * The recommended solution to the issue.
         */
        insight?: CookieIssueInsight;
    }
    const enum PerformanceIssueType {
        DocumentCookie = "DocumentCookie"
    }
    /**
     * Details for a performance issue.
     */
    interface PerformanceIssueDetails {
        performanceIssueType: PerformanceIssueType;
        sourceCodeLocation?: SourceCodeLocation;
    }
    const enum MixedContentResolutionStatus {
        MixedContentBlocked = "MixedContentBlocked",
        MixedContentAutomaticallyUpgraded = "MixedContentAutomaticallyUpgraded",
        MixedContentWarning = "MixedContentWarning"
    }
    const enum MixedContentResourceType {
        Audio = "Audio",
        Beacon = "Beacon",
        CSPReport = "CSPReport",
        Download = "Download",
        EventSource = "EventSource",
        Favicon = "Favicon",
        Font = "Font",
        Form = "Form",
        Frame = "Frame",
        Image = "Image",
        Import = "Import",
        JSON = "JSON",
        Manifest = "Manifest",
        Ping = "Ping",
        PluginData = "PluginData",
        PluginResource = "PluginResource",
        Prefetch = "Prefetch",
        Resource = "Resource",
        Script = "Script",
        ServiceWorker = "ServiceWorker",
        SharedWorker = "SharedWorker",
        SpeculationRules = "SpeculationRules",
        Stylesheet = "Stylesheet",
        Track = "Track",
        Video = "Video",
        Worker = "Worker",
        XMLHttpRequest = "XMLHttpRequest",
        XSLT = "XSLT"
    }
    interface MixedContentIssueDetails {
        /**
         * The type of resource causing the mixed content issue (css, js, iframe,
         * form,...). Marked as optional because it is mapped to from
         * blink::mojom::RequestContextType, which will be replaced
         * by network::mojom::RequestDestination
         */
        resourceType?: MixedContentResourceType;
        /**
         * The way the mixed content issue is being resolved.
         */
        resolutionStatus: MixedContentResolutionStatus;
        /**
         * The unsafe http url causing the mixed content issue.
         */
        insecureURL: string;
        /**
         * The url responsible for the call to an unsafe url.
         */
        mainResourceURL: string;
        /**
         * The mixed content request.
         * Does not always exist (e.g. for unsafe form submission urls).
         */
        request?: AffectedRequest;
        /**
         * Optional because not every mixed content issue is necessarily linked to a frame.
         */
        frame?: AffectedFrame;
    }
    /**
     * Enum indicating the reason a response has been blocked. These reasons are
     * refinements of the net error BLOCKED_BY_RESPONSE.
     */
    const enum BlockedByResponseReason {
        CoepFrameResourceNeedsCoepHeader = "CoepFrameResourceNeedsCoepHeader",
        CoopSandboxedIFrameCannotNavigateToCoopPage = "CoopSandboxedIFrameCannotNavigateToCoopPage",
        CorpNotSameOrigin = "CorpNotSameOrigin",
        CorpNotSameOriginAfterDefaultedToSameOriginByCoep = "CorpNotSameOriginAfterDefaultedToSameOriginByCoep",
        CorpNotSameOriginAfterDefaultedToSameOriginByDip = "CorpNotSameOriginAfterDefaultedToSameOriginByDip",
        CorpNotSameOriginAfterDefaultedToSameOriginByCoepAndDip = "CorpNotSameOriginAfterDefaultedToSameOriginByCoepAndDip",
        CorpNotSameSite = "CorpNotSameSite",
        SRIMessageSignatureMismatch = "SRIMessageSignatureMismatch"
    }
    /**
     * Details for a request that has been blocked with the BLOCKED_BY_RESPONSE
     * code. Currently only used for COEP/COOP, but may be extended to include
     * some CSP errors in the future.
     */
    interface BlockedByResponseIssueDetails {
        request: AffectedRequest;
        parentFrame?: AffectedFrame;
        blockedFrame?: AffectedFrame;
        reason: BlockedByResponseReason;
    }
    const enum HeavyAdResolutionStatus {
        HeavyAdBlocked = "HeavyAdBlocked",
        HeavyAdWarning = "HeavyAdWarning"
    }
    const enum HeavyAdReason {
        NetworkTotalLimit = "NetworkTotalLimit",
        CpuTotalLimit = "CpuTotalLimit",
        CpuPeakLimit = "CpuPeakLimit"
    }
    interface HeavyAdIssueDetails {
        /**
         * The resolution status, either blocking the content or warning.
         */
        resolution: HeavyAdResolutionStatus;
        /**
         * The reason the ad was blocked, total network or cpu or peak cpu.
         */
        reason: HeavyAdReason;
        /**
         * The frame that was blocked.
         */
        frame: AffectedFrame;
    }
    const enum ContentSecurityPolicyViolationType {
        KInlineViolation = "kInlineViolation",
        KEvalViolation = "kEvalViolation",
        KURLViolation = "kURLViolation",
        KSRIViolation = "kSRIViolation",
        KTrustedTypesSinkViolation = "kTrustedTypesSinkViolation",
        KTrustedTypesPolicyViolation = "kTrustedTypesPolicyViolation",
        KWasmEvalViolation = "kWasmEvalViolation"
    }
    interface SourceCodeLocation {
        scriptId?: Runtime.ScriptId;
        url: string;
        lineNumber: integer;
        columnNumber: integer;
    }
    interface ContentSecurityPolicyIssueDetails {
        /**
         * The url not included in allowed sources.
         */
        blockedURL?: string;
        /**
         * Specific directive that is violated, causing the CSP issue.
         */
        violatedDirective: string;
        isReportOnly: boolean;
        contentSecurityPolicyViolationType: ContentSecurityPolicyViolationType;
        frameAncestor?: AffectedFrame;
        sourceCodeLocation?: SourceCodeLocation;
        violatingNodeId?: DOM.BackendNodeId;
    }
    const enum SharedArrayBufferIssueType {
        TransferIssue = "TransferIssue",
        CreationIssue = "CreationIssue"
    }
    /**
     * Details for a issue arising from an SAB being instantiated in, or
     * transferred to a context that is not cross-origin isolated.
     */
    interface SharedArrayBufferIssueDetails {
        sourceCodeLocation: SourceCodeLocation;
        isWarning: boolean;
        type: SharedArrayBufferIssueType;
    }
    /**
     * Details for a CORS related issue, e.g. a warning or error related to
     * CORS RFC1918 enforcement.
     */
    interface CorsIssueDetails {
        corsErrorStatus: Network.CorsErrorStatus;
        isWarning: boolean;
        request: AffectedRequest;
        location?: SourceCodeLocation;
        initiatorOrigin?: string;
        resourceIPAddressSpace?: Network.IPAddressSpace;
        clientSecurityState?: Network.ClientSecurityState;
    }
    const enum SharedDictionaryError {
        UseErrorCrossOriginNoCorsRequest = "UseErrorCrossOriginNoCorsRequest",
        UseErrorDictionaryLoadFailure = "UseErrorDictionaryLoadFailure",
        UseErrorMatchingDictionaryNotUsed = "UseErrorMatchingDictionaryNotUsed",
        UseErrorUnexpectedContentDictionaryHeader = "UseErrorUnexpectedContentDictionaryHeader",
        WriteErrorCossOriginNoCorsRequest = "WriteErrorCossOriginNoCorsRequest",
        WriteErrorDisallowedBySettings = "WriteErrorDisallowedBySettings",
        WriteErrorExpiredResponse = "WriteErrorExpiredResponse",
        WriteErrorFeatureDisabled = "WriteErrorFeatureDisabled",
        WriteErrorInsufficientResources = "WriteErrorInsufficientResources",
        WriteErrorInvalidMatchField = "WriteErrorInvalidMatchField",
        WriteErrorInvalidStructuredHeader = "WriteErrorInvalidStructuredHeader",
        WriteErrorInvalidTTLField = "WriteErrorInvalidTTLField",
        WriteErrorNavigationRequest = "WriteErrorNavigationRequest",
        WriteErrorNoMatchField = "WriteErrorNoMatchField",
        WriteErrorNonIntegerTTLField = "WriteErrorNonIntegerTTLField",
        WriteErrorNonListMatchDestField = "WriteErrorNonListMatchDestField",
        WriteErrorNonSecureContext = "WriteErrorNonSecureContext",
        WriteErrorNonStringIdField = "WriteErrorNonStringIdField",
        WriteErrorNonStringInMatchDestList = "WriteErrorNonStringInMatchDestList",
        WriteErrorInvalidMatchDestList = "WriteErrorInvalidMatchDestList",
        WriteErrorNonStringMatchField = "WriteErrorNonStringMatchField",
        WriteErrorNonTokenTypeField = "WriteErrorNonTokenTypeField",
        WriteErrorRequestAborted = "WriteErrorRequestAborted",
        WriteErrorShuttingDown = "WriteErrorShuttingDown",
        WriteErrorTooLongIdField = "WriteErrorTooLongIdField",
        WriteErrorUnsupportedType = "WriteErrorUnsupportedType"
    }
    const enum SRIMessageSignatureError {
        MissingSignatureHeader = "MissingSignatureHeader",
        MissingSignatureInputHeader = "MissingSignatureInputHeader",
        InvalidSignatureHeader = "InvalidSignatureHeader",
        InvalidSignatureInputHeader = "InvalidSignatureInputHeader",
        SignatureHeaderValueIsNotByteSequence = "SignatureHeaderValueIsNotByteSequence",
        SignatureHeaderValueIsParameterized = "SignatureHeaderValueIsParameterized",
        SignatureHeaderValueIsIncorrectLength = "SignatureHeaderValueIsIncorrectLength",
        SignatureInputHeaderMissingLabel = "SignatureInputHeaderMissingLabel",
        SignatureInputHeaderValueNotInnerList = "SignatureInputHeaderValueNotInnerList",
        SignatureInputHeaderValueMissingComponents = "SignatureInputHeaderValueMissingComponents",
        SignatureInputHeaderInvalidComponentType = "SignatureInputHeaderInvalidComponentType",
        SignatureInputHeaderInvalidComponentName = "SignatureInputHeaderInvalidComponentName",
        SignatureInputHeaderInvalidHeaderComponentParameter = "SignatureInputHeaderInvalidHeaderComponentParameter",
        SignatureInputHeaderInvalidDerivedComponentParameter = "SignatureInputHeaderInvalidDerivedComponentParameter",
        SignatureInputHeaderKeyIdLength = "SignatureInputHeaderKeyIdLength",
        SignatureInputHeaderInvalidParameter = "SignatureInputHeaderInvalidParameter",
        SignatureInputHeaderMissingRequiredParameters = "SignatureInputHeaderMissingRequiredParameters",
        ValidationFailedSignatureExpired = "ValidationFailedSignatureExpired",
        ValidationFailedInvalidLength = "ValidationFailedInvalidLength",
        ValidationFailedSignatureMismatch = "ValidationFailedSignatureMismatch",
        ValidationFailedIntegrityMismatch = "ValidationFailedIntegrityMismatch",
        SignatureBaseUnknownDerivedComponent = "SignatureBaseUnknownDerivedComponent",
        SignatureBaseMissingHeader = "SignatureBaseMissingHeader",
        SignatureBaseInvalidUnencodedDigest = "SignatureBaseInvalidUnencodedDigest",
        SignatureBaseUnsupportedComponent = "SignatureBaseUnsupportedComponent"
    }
    const enum UnencodedDigestError {
        MalformedDictionary = "MalformedDictionary",
        UnknownAlgorithm = "UnknownAlgorithm",
        IncorrectDigestType = "IncorrectDigestType",
        IncorrectDigestLength = "IncorrectDigestLength"
    }
    const enum ConnectionAllowlistError {
        InvalidHeader = "InvalidHeader",
        MoreThanOneList = "MoreThanOneList",
        ItemNotInnerList = "ItemNotInnerList",
        InvalidAllowlistItemType = "InvalidAllowlistItemType",
        ReportingEndpointNotToken = "ReportingEndpointNotToken",
        InvalidUrlPattern = "InvalidUrlPattern",
        IFrameAttributeLoosensEmbeddingRequirement = "IFrameAttributeLoosensEmbeddingRequirement",
        InvalidAllowConnectionAllowlistFrom = "InvalidAllowConnectionAllowlistFrom",
        EmbeddingRequirementNotSatisfied = "EmbeddingRequirementNotSatisfied"
    }
    /**
     * Details for issues about documents in Quirks Mode
     * or Limited Quirks Mode that affects page layouting.
     */
    interface QuirksModeIssueDetails {
        /**
         * If false, it means the document's mode is "quirks"
         * instead of "limited-quirks".
         */
        isLimitedQuirksMode: boolean;
        documentNodeId: DOM.BackendNodeId;
        url: string;
        frameId: Page.FrameId;
        loaderId: Network.LoaderId;
    }
    /**
     * @deprecated
     */
    interface NavigatorUserAgentIssueDetails {
        url: string;
        location?: SourceCodeLocation;
    }
    interface SharedDictionaryIssueDetails {
        sharedDictionaryError: SharedDictionaryError;
        request: AffectedRequest;
    }
    interface SRIMessageSignatureIssueDetails {
        error: SRIMessageSignatureError;
        signatureBase: string;
        integrityAssertions: string[];
        request: AffectedRequest;
    }
    interface UnencodedDigestIssueDetails {
        error: UnencodedDigestError;
        request: AffectedRequest;
    }
    interface ConnectionAllowlistIssueDetails {
        error: ConnectionAllowlistError;
        request: AffectedRequest;
    }
    const enum GenericIssueErrorType {
        FormLabelForNameError = "FormLabelForNameError",
        FormDuplicateIdForInputError = "FormDuplicateIdForInputError",
        FormInputWithNoLabelError = "FormInputWithNoLabelError",
        FormAutocompleteAttributeEmptyError = "FormAutocompleteAttributeEmptyError",
        FormEmptyIdAndNameAttributesForInputError = "FormEmptyIdAndNameAttributesForInputError",
        FormAriaLabelledByToNonExistingIdError = "FormAriaLabelledByToNonExistingIdError",
        FormInputAssignedAutocompleteValueToIdOrNameAttributeError = "FormInputAssignedAutocompleteValueToIdOrNameAttributeError",
        FormLabelHasNeitherForNorNestedInputError = "FormLabelHasNeitherForNorNestedInputError",
        FormLabelForMatchesNonExistingIdError = "FormLabelForMatchesNonExistingIdError",
        FormInputHasWrongButWellIntendedAutocompleteValueError = "FormInputHasWrongButWellIntendedAutocompleteValueError",
        ResponseWasBlockedByORB = "ResponseWasBlockedByORB",
        NavigationEntryMarkedSkippable = "NavigationEntryMarkedSkippable",
        BackUINavigationWouldSkipAd = "BackUINavigationWouldSkipAd",
        AutofillAndManualTextPolicyControlledFeaturesInfo = "AutofillAndManualTextPolicyControlledFeaturesInfo",
        AutofillPolicyControlledFeatureInfo = "AutofillPolicyControlledFeatureInfo",
        ManualTextPolicyControlledFeatureInfo = "ManualTextPolicyControlledFeatureInfo",
        FormModelContextParameterMissingTitleAndDescription = "FormModelContextParameterMissingTitleAndDescription",
        FormModelContextMissingToolName = "FormModelContextMissingToolName",
        FormModelContextMissingToolDescription = "FormModelContextMissingToolDescription",
        FormModelContextRequiredParameterMissingName = "FormModelContextRequiredParameterMissingName",
        FormModelContextParameterMissingName = "FormModelContextParameterMissingName",
        GeolocationPromptWithoutUserGesture = "GeolocationPromptWithoutUserGesture"
    }
    /**
     * Depending on the concrete errorType, different properties are set.
     */
    interface GenericIssueDetails {
        /**
         * Issues with the same errorType are aggregated in the frontend.
         */
        errorType: GenericIssueErrorType;
        frameId?: Page.FrameId;
        violatingNodeId?: DOM.BackendNodeId;
        violatingNodeAttribute?: string;
        request?: AffectedRequest;
    }
    /**
     * This issue tracks information needed to print a deprecation message.
     * https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/frame/third_party/blink/renderer/core/frame/deprecation/README.md
     */
    interface DeprecationIssueDetails {
        affectedFrame?: AffectedFrame;
        sourceCodeLocation: SourceCodeLocation;
        /**
         * One of the deprecation names from third_party/blink/renderer/core/frame/deprecation/deprecation.json5
         */
        type: string;
    }
    /**
     * This issue warns about sites in the redirect chain of a finished navigation
     * that may be flagged as trackers and have their state cleared if they don't
     * receive a user interaction. Note that in this context 'site' means eTLD+1.
     * For example, if the URL `https://example.test:80/bounce` was in the
     * redirect chain, the site reported would be `example.test`.
     */
    interface BounceTrackingIssueDetails {
        trackingSites: string[];
    }
    /**
     * This issue warns about third-party sites that are accessing cookies on the
     * current page, and have been permitted due to having a global metadata grant.
     * Note that in this context 'site' means eTLD+1. For example, if the URL
     * `https://example.test:80/web_page` was accessing cookies, the site reported
     * would be `example.test`.
     */
    interface CookieDeprecationMetadataIssueDetails {
        allowedSites: string[];
        optOutPercentage: number;
        isOptOutTopLevel: boolean;
        operation: CookieOperation;
    }
    const enum ClientHintIssueReason {
        MetaTagAllowListInvalidOrigin = "MetaTagAllowListInvalidOrigin",
        MetaTagModifiedHTML = "MetaTagModifiedHTML"
    }
    interface FederatedAuthRequestIssueDetails {
        federatedAuthRequestIssueReason: FederatedAuthRequestIssueReason;
    }
    /**
     * Represents the failure reason when a federated authentication reason fails.
     * Should be updated alongside RequestIdTokenStatus in
     * third_party/blink/public/mojom/devtools/inspector_issue.mojom to include
     * all cases except for success.
     */
    const enum FederatedAuthRequestIssueReason {
        ShouldEmbargo = "ShouldEmbargo",
        TooManyRequests = "TooManyRequests",
        WellKnownHttpNotFound = "WellKnownHttpNotFound",
        WellKnownNoResponse = "WellKnownNoResponse",
        WellKnownBlockedByConnectionAllowlist = "WellKnownBlockedByConnectionAllowlist",
        WellKnownInvalidResponse = "WellKnownInvalidResponse",
        WellKnownListEmpty = "WellKnownListEmpty",
        WellKnownInvalidContentType = "WellKnownInvalidContentType",
        ConfigNotInWellKnown = "ConfigNotInWellKnown",
        WellKnownTooBig = "WellKnownTooBig",
        ConfigHttpNotFound = "ConfigHttpNotFound",
        ConfigNoResponse = "ConfigNoResponse",
        ConfigBlockedByConnectionAllowlist = "ConfigBlockedByConnectionAllowlist",
        ConfigInvalidResponse = "ConfigInvalidResponse",
        ConfigInvalidContentType = "ConfigInvalidContentType",
        IdpNotPotentiallyTrustworthy = "IdpNotPotentiallyTrustworthy",
        DisabledInSettings = "DisabledInSettings",
        DisabledInFlags = "DisabledInFlags",
        ErrorFetchingSignin = "ErrorFetchingSignin",
        InvalidSigninResponse = "InvalidSigninResponse",
        AccountsHttpNotFound = "AccountsHttpNotFound",
        AccountsNoResponse = "AccountsNoResponse",
        AccountsBlockedByConnectionAllowlist = "AccountsBlockedByConnectionAllowlist",
        AccountsInvalidResponse = "AccountsInvalidResponse",
        AccountsListEmpty = "AccountsListEmpty",
        AccountsInvalidContentType = "AccountsInvalidContentType",
        IdTokenHttpNotFound = "IdTokenHttpNotFound",
        IdTokenNoResponse = "IdTokenNoResponse",
        IdTokenBlockedByConnectionAllowlist = "IdTokenBlockedByConnectionAllowlist",
        IdTokenInvalidResponse = "IdTokenInvalidResponse",
        IdTokenIdpErrorResponse = "IdTokenIdpErrorResponse",
        IdTokenCrossSiteIdpErrorResponse = "IdTokenCrossSiteIdpErrorResponse",
        IdTokenInvalidRequest = "IdTokenInvalidRequest",
        IdTokenInvalidContentType = "IdTokenInvalidContentType",
        ErrorIdToken = "ErrorIdToken",
        Canceled = "Canceled",
        RpPageNotVisible = "RpPageNotVisible",
        SilentMediationFailure = "SilentMediationFailure",
        NotSignedInWithIdp = "NotSignedInWithIdp",
        MissingTransientUserActivation = "MissingTransientUserActivation",
        ReplacedByActiveMode = "ReplacedByActiveMode",
        RelyingPartyOriginIsOpaque = "RelyingPartyOriginIsOpaque",
        TypeNotMatching = "TypeNotMatching",
        UiDismissedNoEmbargo = "UiDismissedNoEmbargo",
        CorsError = "CorsError",
        SuppressedBySegmentationPlatform = "SuppressedBySegmentationPlatform",
        PopupBlockedByConnectionAllowlist = "PopupBlockedByConnectionAllowlist"
    }
    interface FederatedAuthUserInfoRequestIssueDetails {
        federatedAuthUserInfoRequestIssueReason: FederatedAuthUserInfoRequestIssueReason;
    }
    /**
     * Represents the failure reason when a getUserInfo() call fails.
     * Should be updated alongside FederatedAuthUserInfoRequestResult in
     * third_party/blink/public/mojom/devtools/inspector_issue.mojom.
     */
    const enum FederatedAuthUserInfoRequestIssueReason {
        NotSameOrigin = "NotSameOrigin",
        NotIframe = "NotIframe",
        NotPotentiallyTrustworthy = "NotPotentiallyTrustworthy",
        NoAPIPermission = "NoApiPermission",
        NotSignedInWithIdp = "NotSignedInWithIdp",
        NoAccountSharingPermission = "NoAccountSharingPermission",
        InvalidConfigOrWellKnown = "InvalidConfigOrWellKnown",
        InvalidAccountsResponse = "InvalidAccountsResponse",
        NoReturningUserFromFetchedAccounts = "NoReturningUserFromFetchedAccounts"
    }
    interface EmailVerificationRequestIssueDetails {
        emailVerificationRequestIssueReason: EmailVerificationRequestIssueReason;
    }
    /**
     * Represents the failure reason when an email verification request fails.
     * Should be updated alongside EmailVerificationRequestResult in
     * third_party/blink/public/mojom/devtools/inspector_issue.mojom.
     */
    const enum EmailVerificationRequestIssueReason {
        InvalidEmail = "InvalidEmail",
        DnsFetchFailed = "DnsFetchFailed",
        DnsInvalidRecord = "DnsInvalidRecord",
        WellKnownHttpNotFound = "WellKnownHttpNotFound",
        WellKnownNoResponse = "WellKnownNoResponse",
        WellKnownInvalidResponse = "WellKnownInvalidResponse",
        WellKnownListEmpty = "WellKnownListEmpty",
        WellKnownInvalidContentType = "WellKnownInvalidContentType",
        WellKnownMissingIssuanceEndpoint = "WellKnownMissingIssuanceEndpoint",
        WellKnownIssuanceEndpointCrossOrigin = "WellKnownIssuanceEndpointCrossOrigin",
        WellKnownUnsupportedSigningAlgorithm = "WellKnownUnsupportedSigningAlgorithm",
        TokenHttpNotFound = "TokenHttpNotFound",
        TokenNoResponse = "TokenNoResponse",
        TokenInvalidResponse = "TokenInvalidResponse",
        TokenInvalidContentType = "TokenInvalidContentType",
        TokenMalformedSdJwt = "TokenMalformedSdJwt",
        TokenInvalidSdJwt = "TokenInvalidSdJwt",
        KeyBindingSigningFailed = "KeyBindingSigningFailed",
        RpOriginIsOpaque = "RpOriginIsOpaque",
        WellKnownMissingAccountsEndpoint = "WellKnownMissingAccountsEndpoint",
        UserLoggedOut = "UserLoggedOut",
        WellKnownAccountsEndpointCrossOrigin = "WellKnownAccountsEndpointCrossOrigin",
        AccountsHttpNotFound = "AccountsHttpNotFound",
        AccountsNoResponse = "AccountsNoResponse",
        AccountsInvalidResponse = "AccountsInvalidResponse",
        AccountsInvalidContentType = "AccountsInvalidContentType",
        AccountsEmptyList = "AccountsEmptyList",
        EmailVerificationWellKnownHttpNotFound = "EmailVerificationWellKnownHttpNotFound",
        EmailVerificationWellKnownNoResponse = "EmailVerificationWellKnownNoResponse",
        EmailVerificationWellKnownInvalidResponse = "EmailVerificationWellKnownInvalidResponse",
        EmailVerificationWellKnownInvalidContentType = "EmailVerificationWellKnownInvalidContentType",
        JwksHttpNotFound = "JwksHttpNotFound",
        JwksInvalidResponse = "JwksInvalidResponse",
        TokenVerificationSdJwtUnsupportedHeaderAlg = "TokenVerificationSdJwtUnsupportedHeaderAlg",
        TokenVerificationSdJwtInvalidTyp = "TokenVerificationSdJwtInvalidTyp",
        TokenVerificationSdJwtMissingIss = "TokenVerificationSdJwtMissingIss",
        TokenVerificationSdJwtMissingIat = "TokenVerificationSdJwtMissingIat",
        TokenVerificationSdJwtMissingCnf = "TokenVerificationSdJwtMissingCnf",
        TokenVerificationSdJwtMissingEmail = "TokenVerificationSdJwtMissingEmail",
        TokenVerificationSdJwtInvalidIssuedAt = "TokenVerificationSdJwtInvalidIssuedAt",
        TokenVerificationSdJwtInvalidIssuer = "TokenVerificationSdJwtInvalidIssuer",
        TokenVerificationSdJwtJwksMissingKeys = "TokenVerificationSdJwtJwksMissingKeys",
        TokenVerificationSdJwtSignatureFailed = "TokenVerificationSdJwtSignatureFailed",
        TokenVerificationSdJwtInvalidEmailVerified = "TokenVerificationSdJwtInvalidEmailVerified",
        TokenVerificationSdJwtInvalidEmail = "TokenVerificationSdJwtInvalidEmail",
        TokenVerificationSdJwtInvalidHolderKey = "TokenVerificationSdJwtInvalidHolderKey",
        TokenVerificationKbInvalidTyp = "TokenVerificationKbInvalidTyp",
        TokenVerificationKbMissingAud = "TokenVerificationKbMissingAud",
        TokenVerificationKbMissingNonce = "TokenVerificationKbMissingNonce",
        TokenVerificationKbMissingIat = "TokenVerificationKbMissingIat",
        TokenVerificationKbMissingSdHash = "TokenVerificationKbMissingSdHash",
        TokenVerificationKbInvalidIssuedAt = "TokenVerificationKbInvalidIssuedAt",
        TokenVerificationKbInvalidAudience = "TokenVerificationKbInvalidAudience",
        TokenVerificationKbInvalidNonce = "TokenVerificationKbInvalidNonce",
        TokenVerificationKbInvalidSdHash = "TokenVerificationKbInvalidSdHash",
        TokenVerificationKbMissingCnf = "TokenVerificationKbMissingCnf",
        TokenVerificationKbSignatureFailed = "TokenVerificationKbSignatureFailed",
        CrossOriginIframeNotSupported = "CrossOriginIframeNotSupported"
    }
    /**
     * This issue tracks client hints related issues. It's used to deprecate old
     * features, encourage the use of new ones, and provide general guidance.
     */
    interface ClientHintIssueDetails {
        sourceCodeLocation: SourceCodeLocation;
        clientHintIssueReason: ClientHintIssueReason;
    }
    interface FailedRequestInfo {
        /**
         * The URL that failed to load.
         */
        url: string;
        /**
         * The failure message for the failed request.
         */
        failureMessage: string;
        requestId?: Network.RequestId;
    }
    const enum PartitioningBlobURLInfo {
        BlockedCrossPartitionFetching = "BlockedCrossPartitionFetching",
        EnforceNoopenerForNavigation = "EnforceNoopenerForNavigation"
    }
    interface PartitioningBlobURLIssueDetails {
        /**
         * The BlobURL that failed to load.
         */
        url: string;
        /**
         * Additional information about the Partitioning Blob URL issue.
         */
        partitioningBlobURLInfo: PartitioningBlobURLInfo;
    }
    const enum ElementAccessibilityIssueReason {
        DisallowedSelectChild = "DisallowedSelectChild",
        DisallowedOptGroupChild = "DisallowedOptGroupChild",
        NonPhrasingContentOptionChild = "NonPhrasingContentOptionChild",
        InteractiveContentOptionChild = "InteractiveContentOptionChild",
        InteractiveContentLegendChild = "InteractiveContentLegendChild",
        InteractiveContentSummaryDescendant = "InteractiveContentSummaryDescendant"
    }
    /**
     * This issue warns about errors in the select or summary element content model.
     */
    interface ElementAccessibilityIssueDetails {
        nodeId: DOM.BackendNodeId;
        elementAccessibilityIssueReason: ElementAccessibilityIssueReason;
        hasDisallowedAttributes: boolean;
    }
    const enum StyleSheetLoadingIssueReason {
        LateImportRule = "LateImportRule",
        RequestFailed = "RequestFailed"
    }
    /**
     * This issue warns when a referenced stylesheet couldn't be loaded.
     */
    interface StylesheetLoadingIssueDetails {
        /**
         * Source code position that referenced the failing stylesheet.
         */
        sourceCodeLocation: SourceCodeLocation;
        /**
         * Reason why the stylesheet couldn't be loaded.
         */
        styleSheetLoadingIssueReason: StyleSheetLoadingIssueReason;
        /**
         * Contains additional info when the failure was due to a request.
         */
        failedRequestInfo?: FailedRequestInfo;
    }
    const enum PropertyRuleIssueReason {
        InvalidSyntax = "InvalidSyntax",
        InvalidInitialValue = "InvalidInitialValue",
        InvalidInherits = "InvalidInherits",
        InvalidName = "InvalidName"
    }
    /**
     * This issue warns about errors in property rules that lead to property
     * registrations being ignored.
     */
    interface PropertyRuleIssueDetails {
        /**
         * Source code position of the property rule.
         */
        sourceCodeLocation: SourceCodeLocation;
        /**
         * Reason why the property rule was discarded.
         */
        propertyRuleIssueReason: PropertyRuleIssueReason;
        /**
         * The value of the property rule property that failed to parse
         */
        propertyValue?: string;
    }
    const enum UserReidentificationIssueType {
        BlockedFrameNavigation = "BlockedFrameNavigation",
        BlockedSubresource = "BlockedSubresource",
        NoisedCanvasReadback = "NoisedCanvasReadback"
    }
    /**
     * This issue warns about uses of APIs that may be considered misuse to
     * re-identify users.
     */
    interface UserReidentificationIssueDetails {
        type: UserReidentificationIssueType;
        /**
         * Applies to BlockedFrameNavigation and BlockedSubresource issue types.
         */
        request?: AffectedRequest;
        /**
         * Applies to NoisedCanvasReadback issue type.
         */
        sourceCodeLocation?: SourceCodeLocation;
    }
    const enum PermissionElementIssueType {
        InvalidType = "InvalidType",
        FencedFrameDisallowed = "FencedFrameDisallowed",
        CspFrameAncestorsMissing = "CspFrameAncestorsMissing",
        PermissionsPolicyBlocked = "PermissionsPolicyBlocked",
        PaddingRightUnsupported = "PaddingRightUnsupported",
        PaddingBottomUnsupported = "PaddingBottomUnsupported",
        InsetBoxShadowUnsupported = "InsetBoxShadowUnsupported",
        RequestInProgress = "RequestInProgress",
        UntrustedEvent = "UntrustedEvent",
        RegistrationFailed = "RegistrationFailed",
        TypeNotSupported = "TypeNotSupported",
        InvalidTypeActivation = "InvalidTypeActivation",
        SecurityChecksFailed = "SecurityChecksFailed",
        ActivationDisabled = "ActivationDisabled",
        GeolocationDeprecated = "GeolocationDeprecated",
        InvalidDisplayStyle = "InvalidDisplayStyle",
        NonOpaqueColor = "NonOpaqueColor",
        LowContrast = "LowContrast",
        FontSizeTooSmall = "FontSizeTooSmall",
        FontSizeTooLarge = "FontSizeTooLarge",
        InvalidSizeValue = "InvalidSizeValue",
        NonSecureContext = "NonSecureContext",
        MissingTransientUserActivation = "MissingTransientUserActivation"
    }
    /**
     * This issue warns about improper usage of the <permission> element.
     */
    interface PermissionElementIssueDetails {
        issueType: PermissionElementIssueType;
        /**
         * The value of the type attribute.
         */
        type?: string;
        /**
         * The node ID of the <permission> element.
         */
        nodeId?: DOM.BackendNodeId;
        /**
         * True if the issue is a warning, false if it is an error.
         */
        isWarning?: boolean;
        /**
         * Fields for message construction:
         * Used for messages that reference a specific permission name
         */
        permissionName?: string;
        /**
         * Used for messages about occlusion
         */
        occluderNodeInfo?: string;
        /**
         * Used for messages about occluder's parent
         */
        occluderParentNodeInfo?: string;
        /**
         * Used for messages about activation disabled reason
         */
        disableReason?: string;
    }
    const enum WebInstallIssueReason {
        ManifestParsingOrNetworkError = "ManifestParsingOrNetworkError",
        StartUrlInvalid = "StartUrlInvalid",
        ManifestMissingNameOrShortName = "ManifestMissingNameOrShortName",
        ManifestMissingId = "ManifestMissingId",
        NoManifest = "NoManifest"
    }
    /**
     * This issue reports a failure involving a web app manifest used by a Web
     * Install operation.
     */
    interface WebInstallIssueDetails {
        manifestUrl?: string;
        reason: WebInstallIssueReason;
    }
    /**
     * The issue warns about blocked calls to privacy sensitive APIs via the
     * Selective Permissions Intervention.
     */
    interface SelectivePermissionsInterventionIssueDetails {
        /**
         * Which API was intervened on.
         */
        apiName: string;
        /**
         * Why the ad script using the API is considered an ad.
         */
        adAncestry: Network.AdAncestry;
        /**
         * The stack trace at the time of the intervention.
         */
        stackTrace?: Runtime.StackTrace;
    }
    /**
     * Details for issues about lazy-loaded images without explicit dimensions.
     */
    interface LazyLoadImageIssueDetails {
        /**
         * DOM node of the problematic HTMLImageElement.
         */
        nodeId: DOM.BackendNodeId;
        /**
         * URL or src attribute of the image.
         */
        url: string;
        /**
         * Frame containing the image.
         */
        frameId: Page.FrameId;
    }
    /**
     * A unique identifier for the type of issue. Each type may use one of the
     * optional fields in InspectorIssueDetails to convey more specific
     * information about the kind of issue.
     */
    const enum InspectorIssueCode {
        CookieIssue = "CookieIssue",
        MixedContentIssue = "MixedContentIssue",
        BlockedByResponseIssue = "BlockedByResponseIssue",
        HeavyAdIssue = "HeavyAdIssue",
        ContentSecurityPolicyIssue = "ContentSecurityPolicyIssue",
        SharedArrayBufferIssue = "SharedArrayBufferIssue",
        CorsIssue = "CorsIssue",
        QuirksModeIssue = "QuirksModeIssue",
        PartitioningBlobURLIssue = "PartitioningBlobURLIssue",
        NavigatorUserAgentIssue = "NavigatorUserAgentIssue",
        GenericIssue = "GenericIssue",
        DeprecationIssue = "DeprecationIssue",
        ClientHintIssue = "ClientHintIssue",
        FederatedAuthRequestIssue = "FederatedAuthRequestIssue",
        BounceTrackingIssue = "BounceTrackingIssue",
        CookieDeprecationMetadataIssue = "CookieDeprecationMetadataIssue",
        StylesheetLoadingIssue = "StylesheetLoadingIssue",
        FederatedAuthUserInfoRequestIssue = "FederatedAuthUserInfoRequestIssue",
        PropertyRuleIssue = "PropertyRuleIssue",
        SharedDictionaryIssue = "SharedDictionaryIssue",
        ElementAccessibilityIssue = "ElementAccessibilityIssue",
        SRIMessageSignatureIssue = "SRIMessageSignatureIssue",
        UnencodedDigestIssue = "UnencodedDigestIssue",
        ConnectionAllowlistIssue = "ConnectionAllowlistIssue",
        UserReidentificationIssue = "UserReidentificationIssue",
        PermissionElementIssue = "PermissionElementIssue",
        PerformanceIssue = "PerformanceIssue",
        SelectivePermissionsInterventionIssue = "SelectivePermissionsInterventionIssue",
        EmailVerificationRequestIssue = "EmailVerificationRequestIssue",
        LazyLoadImageIssue = "LazyLoadImageIssue",
        WebInstallIssue = "WebInstallIssue"
    }
    /**
     * This struct holds a list of optional fields with additional information
     * specific to the kind of issue. When adding a new issue code, please also
     * add a new optional field to this type.
     */
    interface InspectorIssueDetails {
        cookieIssueDetails?: CookieIssueDetails;
        mixedContentIssueDetails?: MixedContentIssueDetails;
        blockedByResponseIssueDetails?: BlockedByResponseIssueDetails;
        heavyAdIssueDetails?: HeavyAdIssueDetails;
        contentSecurityPolicyIssueDetails?: ContentSecurityPolicyIssueDetails;
        sharedArrayBufferIssueDetails?: SharedArrayBufferIssueDetails;
        corsIssueDetails?: CorsIssueDetails;
        quirksModeIssueDetails?: QuirksModeIssueDetails;
        partitioningBlobURLIssueDetails?: PartitioningBlobURLIssueDetails;
        /**
         * @deprecated
         */
        navigatorUserAgentIssueDetails?: NavigatorUserAgentIssueDetails;
        genericIssueDetails?: GenericIssueDetails;
        deprecationIssueDetails?: DeprecationIssueDetails;
        clientHintIssueDetails?: ClientHintIssueDetails;
        federatedAuthRequestIssueDetails?: FederatedAuthRequestIssueDetails;
        bounceTrackingIssueDetails?: BounceTrackingIssueDetails;
        cookieDeprecationMetadataIssueDetails?: CookieDeprecationMetadataIssueDetails;
        stylesheetLoadingIssueDetails?: StylesheetLoadingIssueDetails;
        propertyRuleIssueDetails?: PropertyRuleIssueDetails;
        federatedAuthUserInfoRequestIssueDetails?: FederatedAuthUserInfoRequestIssueDetails;
        sharedDictionaryIssueDetails?: SharedDictionaryIssueDetails;
        elementAccessibilityIssueDetails?: ElementAccessibilityIssueDetails;
        sriMessageSignatureIssueDetails?: SRIMessageSignatureIssueDetails;
        unencodedDigestIssueDetails?: UnencodedDigestIssueDetails;
        connectionAllowlistIssueDetails?: ConnectionAllowlistIssueDetails;
        userReidentificationIssueDetails?: UserReidentificationIssueDetails;
        permissionElementIssueDetails?: PermissionElementIssueDetails;
        performanceIssueDetails?: PerformanceIssueDetails;
        selectivePermissionsInterventionIssueDetails?: SelectivePermissionsInterventionIssueDetails;
        emailVerificationRequestIssueDetails?: EmailVerificationRequestIssueDetails;
        lazyLoadImageIssueDetails?: LazyLoadImageIssueDetails;
        webInstallIssueDetails?: WebInstallIssueDetails;
    }
    /**
     * A unique id for a DevTools inspector issue. Allows other entities (e.g.
     * exceptions, CDP message, console messages, etc.) to reference an issue.
     */
    type IssueId = OpaqueIdentifier<string, 'Protocol.Audits.IssueId'>;
    /**
     * An inspector issue reported from the back-end.
     */
    interface InspectorIssue {
        code: InspectorIssueCode;
        details: InspectorIssueDetails;
        /**
         * A unique id for this issue. May be omitted if no other entity (e.g.
         * exception, CDP message, etc.) is referencing this issue.
         */
        issueId?: IssueId;
    }
    const enum GetEncodedResponseRequestEncoding {
        Webp = "webp",
        Jpeg = "jpeg",
        Png = "png"
    }
    interface GetEncodedResponseRequest {
        /**
         * Identifier of the network request to get content for.
         */
        requestId: Network.RequestId;
        /**
         * The encoding to use.
         */
        encoding: GetEncodedResponseRequestEncoding;
        /**
         * The quality of the encoding (0-1). (defaults to 1)
         */
        quality?: number;
        /**
         * Whether to only return the size information (defaults to false).
         */
        sizeOnly?: boolean;
    }
    interface GetEncodedResponseResponse extends ProtocolResponseWithError {
        /**
         * The encoded body as a base64 string. Omitted if sizeOnly is true.
         */
        body?: binary;
        /**
         * Size before re-encoding.
         */
        originalSize: integer;
        /**
         * Size after re-encoding.
         */
        encodedSize: integer;
    }
    interface CheckFormsIssuesResponse extends ProtocolResponseWithError {
        formIssues: GenericIssueDetails[];
    }
    interface IssueAddedEvent {
        issue: InspectorIssue;
    }
}
/**
 * Defines commands and events for Autofill.
 */
export declare namespace Autofill {
    interface CreditCard {
        /**
         * 16-digit credit card number.
         */
        number: string;
        /**
         * Name of the credit card owner.
         */
        name: string;
        /**
         * 2-digit expiry month.
         */
        expiryMonth: string;
        /**
         * 4-digit expiry year.
         */
        expiryYear: string;
        /**
         * 3-digit card verification code.
         */
        cvc: string;
    }
    interface AddressField {
        /**
         * address field name, for example GIVEN_NAME.
         * The full list of supported field names:
         * https://source.chromium.org/chromium/chromium/src/+/main:components/autofill/core/browser/field_types.cc;l=38
         */
        name: string;
        /**
         * address field value, for example Jon Doe.
         */
        value: string;
    }
    /**
     * A list of address fields.
     */
    interface AddressFields {
        fields: AddressField[];
    }
    interface Address {
        /**
         * fields and values defining an address.
         */
        fields: AddressField[];
    }
    /**
     * Defines how an address can be displayed like in chrome://settings/addresses.
     * Address UI is a two dimensional array, each inner array is an "address information line", and when rendered in a UI surface should be displayed as such.
     * The following address UI for instance:
     * [[{name: "GIVE_NAME", value: "Jon"}, {name: "FAMILY_NAME", value: "Doe"}], [{name: "CITY", value: "Munich"}, {name: "ZIP", value: "81456"}]]
     * should allow the receiver to render:
     * Jon Doe
     * Munich 81456
     */
    interface AddressUI {
        /**
         * A two dimension array containing the representation of values from an address profile.
         */
        addressFields: AddressFields[];
    }
    /**
     * Specified whether a filled field was done so by using the html autocomplete attribute or autofill heuristics.
     */
    const enum FillingStrategy {
        AutocompleteAttribute = "autocompleteAttribute",
        AutofillInferred = "autofillInferred"
    }
    interface FilledField {
        /**
         * The type of the field, e.g text, password etc.
         */
        htmlType: string;
        /**
         * the html id
         */
        id: string;
        /**
         * the html name
         */
        name: string;
        /**
         * the field value
         */
        value: string;
        /**
         * The actual field type, e.g FAMILY_NAME
         */
        autofillType: string;
        /**
         * The filling strategy
         */
        fillingStrategy: FillingStrategy;
        /**
         * The frame the field belongs to
         */
        frameId: Page.FrameId;
        /**
         * The form field's DOM node
         */
        fieldId: DOM.BackendNodeId;
    }
    interface TriggerRequest {
        /**
         * Identifies a field that serves as an anchor for autofill.
         */
        fieldId: DOM.BackendNodeId;
        /**
         * Identifies the frame that field belongs to.
         */
        frameId?: Page.FrameId;
        /**
         * Credit card information to fill out the form. Credit card data is not saved.  Mutually exclusive with `address`.
         */
        card?: CreditCard;
        /**
         * Address to fill out the form. Address data is not saved. Mutually exclusive with `card`.
         */
        address?: Address;
    }
    interface SetAddressesRequest {
        addresses: Address[];
    }
    /**
     * Emitted when an address form is filled.
     */
    interface AddressFormFilledEvent {
        /**
         * Information about the fields that were filled
         */
        filledFields: FilledField[];
        /**
         * An UI representation of the address used to fill the form.
         * Consists of a 2D array where each child represents an address/profile line.
         */
        addressUi: AddressUI;
    }
}
/**
 * Defines events for background web platform features.
 */
export declare namespace BackgroundService {
    /**
     * The Background Service that will be associated with the commands/events.
     * Every Background Service operates independently, but they share the same
     * API.
     */
    const enum ServiceName {
        BackgroundFetch = "backgroundFetch",
        BackgroundSync = "backgroundSync",
        PushMessaging = "pushMessaging",
        Notifications = "notifications",
        PaymentHandler = "paymentHandler",
        PeriodicBackgroundSync = "periodicBackgroundSync"
    }
    /**
     * A key-value pair for additional event information to pass along.
     */
    interface EventMetadata {
        key: string;
        value: string;
    }
    interface BackgroundServiceEvent {
        /**
         * Timestamp of the event (in seconds).
         */
        timestamp: Network.TimeSinceEpoch;
        /**
         * The origin this event belongs to.
         */
        origin: string;
        /**
         * The Service Worker ID that initiated the event.
         */
        serviceWorkerRegistrationId: ServiceWorker.RegistrationID;
        /**
         * The Background Service this event belongs to.
         */
        service: ServiceName;
        /**
         * A description of the event.
         */
        eventName: string;
        /**
         * An identifier that groups related events together.
         */
        instanceId: string;
        /**
         * A list of event-specific information.
         */
        eventMetadata: EventMetadata[];
        /**
         * Storage key this event belongs to.
         */
        storageKey: string;
    }
    interface StartObservingRequest {
        service: ServiceName;
    }
    interface StopObservingRequest {
        service: ServiceName;
    }
    interface SetRecordingRequest {
        shouldRecord: boolean;
        service: ServiceName;
    }
    interface ClearEventsRequest {
        service: ServiceName;
    }
    /**
     * Called when the recording state for the service has been updated.
     */
    interface RecordingStateChangedEvent {
        isRecording: boolean;
        service: ServiceName;
    }
    /**
     * Called with all existing backgroundServiceEvents when enabled, and all new
     * events afterwards if enabled and recording.
     */
    interface BackgroundServiceEventReceivedEvent {
        backgroundServiceEvent: BackgroundServiceEvent;
    }
}
/**
 * This domain allows configuring virtual Bluetooth devices to test
 * the web-bluetooth API.
 */
export declare namespace BluetoothEmulation {
    /**
     * Indicates the various states of Central.
     */
    const enum CentralState {
        Absent = "absent",
        PoweredOff = "powered-off",
        PoweredOn = "powered-on"
    }
    /**
     * Indicates the various types of GATT event.
     */
    const enum GATTOperationType {
        Connection = "connection",
        Discovery = "discovery"
    }
    /**
     * Indicates the various types of characteristic write.
     */
    const enum CharacteristicWriteType {
        WriteDefaultDeprecated = "write-default-deprecated",
        WriteWithResponse = "write-with-response",
        WriteWithoutResponse = "write-without-response"
    }
    /**
     * Indicates the various types of characteristic operation.
     */
    const enum CharacteristicOperationType {
        Read = "read",
        Write = "write",
        SubscribeToNotifications = "subscribe-to-notifications",
        UnsubscribeFromNotifications = "unsubscribe-from-notifications"
    }
    /**
     * Indicates the various types of descriptor operation.
     */
    const enum DescriptorOperationType {
        Read = "read",
        Write = "write"
    }
    /**
     * Stores the manufacturer data
     */
    interface ManufacturerData {
        /**
         * Company identifier
         * https://bitbucket.org/bluetooth-SIG/public/src/main/assigned_numbers/company_identifiers/company_identifiers.yaml
         * https://usb.org/developers
         */
        key: integer;
        /**
         * Manufacturer-specific data
         */
        data: binary;
    }
    /**
     * Stores the byte data of the advertisement packet sent by a Bluetooth device.
     */
    interface ScanRecord {
        name?: string;
        uuids?: string[];
        /**
         * Stores the external appearance description of the device.
         */
        appearance?: integer;
        /**
         * Stores the transmission power of a broadcasting device.
         */
        txPower?: integer;
        /**
         * Key is the company identifier and the value is an array of bytes of
         * manufacturer specific data.
         */
        manufacturerData?: ManufacturerData[];
    }
    /**
     * Stores the advertisement packet information that is sent by a Bluetooth device.
     */
    interface ScanEntry {
        deviceAddress: string;
        rssi: integer;
        scanRecord: ScanRecord;
    }
    /**
     * Describes the properties of a characteristic. This follows Bluetooth Core
     * Specification BT 4.2 Vol 3 Part G 3.3.1. Characteristic Properties.
     */
    interface CharacteristicProperties {
        broadcast?: boolean;
        read?: boolean;
        writeWithoutResponse?: boolean;
        write?: boolean;
        notify?: boolean;
        indicate?: boolean;
        authenticatedSignedWrites?: boolean;
        extendedProperties?: boolean;
    }
    interface EnableRequest {
        /**
         * State of the simulated central.
         */
        state: CentralState;
        /**
         * If the simulated central supports low-energy.
         */
        leSupported: boolean;
    }
    interface SetSimulatedCentralStateRequest {
        /**
         * State of the simulated central.
         */
        state: CentralState;
    }
    interface SimulatePreconnectedPeripheralRequest {
        address: string;
        name: string;
        manufacturerData: ManufacturerData[];
        knownServiceUuids: string[];
    }
    interface SimulateAdvertisementRequest {
        entry: ScanEntry;
    }
    interface SimulateGATTOperationResponseRequest {
        address: string;
        type: GATTOperationType;
        code: integer;
    }
    interface SimulateCharacteristicOperationResponseRequest {
        characteristicId: string;
        type: CharacteristicOperationType;
        code: integer;
        data?: binary;
    }
    interface SimulateDescriptorOperationResponseRequest {
        descriptorId: string;
        type: DescriptorOperationType;
        code: integer;
        data?: binary;
    }
    interface AddServiceRequest {
        address: string;
        serviceUuid: string;
    }
    interface AddServiceResponse extends ProtocolResponseWithError {
        /**
         * An identifier that uniquely represents this service.
         */
        serviceId: string;
    }
    interface RemoveServiceRequest {
        serviceId: string;
    }
    interface AddCharacteristicRequest {
        serviceId: string;
        characteristicUuid: string;
        properties: CharacteristicProperties;
    }
    interface AddCharacteristicResponse extends ProtocolResponseWithError {
        /**
         * An identifier that uniquely represents this characteristic.
         */
        characteristicId: string;
    }
    interface RemoveCharacteristicRequest {
        characteristicId: string;
    }
    interface AddDescriptorRequest {
        characteristicId: string;
        descriptorUuid: string;
    }
    interface AddDescriptorResponse extends ProtocolResponseWithError {
        /**
         * An identifier that uniquely represents this descriptor.
         */
        descriptorId: string;
    }
    interface RemoveDescriptorRequest {
        descriptorId: string;
    }
    interface SimulateGATTDisconnectionRequest {
        address: string;
    }
    /**
     * Event for when a GATT operation of |type| to the peripheral with |address|
     * happened.
     */
    interface GattOperationReceivedEvent {
        address: string;
        type: GATTOperationType;
    }
    /**
     * Event for when a characteristic operation of |type| to the characteristic
     * respresented by |characteristicId| happened. |data| and |writeType| is
     * expected to exist when |type| is write.
     */
    interface CharacteristicOperationReceivedEvent {
        characteristicId: string;
        type: CharacteristicOperationType;
        data?: binary;
        writeType?: CharacteristicWriteType;
    }
    /**
     * Event for when a descriptor operation of |type| to the descriptor
     * respresented by |descriptorId| happened. |data| is expected to exist when
     * |type| is write.
     */
    interface DescriptorOperationReceivedEvent {
        descriptorId: string;
        type: DescriptorOperationType;
        data?: binary;
    }
}
/**
 * The Browser domain defines methods and events for browser managing.
 */
export declare namespace Browser {
    type BrowserContextID = OpaqueIdentifier<string, 'Protocol.Browser.BrowserContextID'>;
    type WindowID = OpaqueIdentifier<integer, 'Protocol.Browser.WindowID'>;
    /**
     * The state of the browser window.
     */
    const enum WindowState {
        Normal = "normal",
        Minimized = "minimized",
        Maximized = "maximized",
        Fullscreen = "fullscreen"
    }
    /**
     * Browser window bounds information
     */
    interface Bounds {
        /**
         * The offset from the left edge of the screen to the window in pixels.
         */
        left?: integer;
        /**
         * The offset from the top edge of the screen to the window in pixels.
         */
        top?: integer;
        /**
         * The window width in pixels.
         */
        width?: integer;
        /**
         * The window height in pixels.
         */
        height?: integer;
        /**
         * The window state. Default to normal.
         */
        windowState?: WindowState;
    }
    const enum PermissionType {
        Ar = "ar",
        AudioCapture = "audioCapture",
        AutomaticFullscreen = "automaticFullscreen",
        BackgroundFetch = "backgroundFetch",
        BackgroundSync = "backgroundSync",
        CameraPanTiltZoom = "cameraPanTiltZoom",
        CapturedSurfaceControl = "capturedSurfaceControl",
        ClipboardReadWrite = "clipboardReadWrite",
        ClipboardSanitizedWrite = "clipboardSanitizedWrite",
        DisplayCapture = "displayCapture",
        DurableStorage = "durableStorage",
        Geolocation = "geolocation",
        HandTracking = "handTracking",
        IdleDetection = "idleDetection",
        KeyboardLock = "keyboardLock",
        LocalFonts = "localFonts",
        LocalNetwork = "localNetwork",
        LocalNetworkAccess = "localNetworkAccess",
        LoopbackNetwork = "loopbackNetwork",
        Midi = "midi",
        MidiSysex = "midiSysex",
        Nfc = "nfc",
        Notifications = "notifications",
        PaymentHandler = "paymentHandler",
        PeriodicBackgroundSync = "periodicBackgroundSync",
        PointerLock = "pointerLock",
        ProtectedMediaIdentifier = "protectedMediaIdentifier",
        Sensors = "sensors",
        SmartCard = "smartCard",
        SpeakerSelection = "speakerSelection",
        StorageAccess = "storageAccess",
        TopLevelStorageAccess = "topLevelStorageAccess",
        VideoCapture = "videoCapture",
        Vr = "vr",
        WakeLockScreen = "wakeLockScreen",
        WakeLockSystem = "wakeLockSystem",
        WebAppInstallation = "webAppInstallation",
        WebPrinting = "webPrinting",
        WindowManagement = "windowManagement"
    }
    const enum PermissionSetting {
        Granted = "granted",
        Denied = "denied",
        Prompt = "prompt"
    }
    /**
     * Definition of PermissionDescriptor defined in the Permissions API:
     * https://w3c.github.io/permissions/#dom-permissiondescriptor.
     */
    interface PermissionDescriptor {
        /**
         * Name of permission.
         * See https://cs.chromium.org/chromium/src/third_party/blink/renderer/modules/permissions/permission_descriptor.idl for valid permission names.
         */
        name: string;
        /**
         * For "midi" permission, may also specify sysex control.
         */
        sysex?: boolean;
        /**
         * For "push" permission, may specify userVisibleOnly.
         * Note that userVisibleOnly = true is the only currently supported type.
         */
        userVisibleOnly?: boolean;
        /**
         * For "clipboard" permission, may specify allowWithoutSanitization.
         */
        allowWithoutSanitization?: boolean;
        /**
         * For "fullscreen" permission, must specify allowWithoutGesture:true.
         */
        allowWithoutGesture?: boolean;
        /**
         * For "camera" permission, may specify panTiltZoom.
         */
        panTiltZoom?: boolean;
    }
    /**
     * Browser command ids used by executeBrowserCommand.
     */
    const enum BrowserCommandId {
        OpenTabSearch = "openTabSearch",
        CloseTabSearch = "closeTabSearch",
        OpenGlic = "openGlic"
    }
    /**
     * Chrome histogram bucket.
     */
    interface Bucket {
        /**
         * Minimum value (inclusive).
         */
        low: integer;
        /**
         * Maximum value (exclusive).
         */
        high: integer;
        /**
         * Number of samples.
         */
        count: integer;
    }
    /**
     * Chrome histogram.
     */
    interface Histogram {
        /**
         * Name.
         */
        name: string;
        /**
         * Sum of sample values.
         */
        sum: integer;
        /**
         * Total number of samples.
         */
        count: integer;
        /**
         * Buckets.
         */
        buckets: Bucket[];
    }
    interface SetPermissionRequest {
        /**
         * Descriptor of permission to override.
         */
        permission: PermissionDescriptor;
        /**
         * Setting of the permission.
         */
        setting: PermissionSetting;
        /**
         * Embedding origin the permission applies to, all origins if not specified.
         */
        origin?: string;
        /**
         * Embedded origin the permission applies to. It is ignored unless the embedding origin is
         * present and valid. If the embedding origin is provided but the embedded origin isn't, the
         * embedding origin is used as the embedded origin.
         */
        embeddedOrigin?: string;
        /**
         * Context to override. When omitted, default browser context is used.
         */
        browserContextId?: BrowserContextID;
    }
    interface GrantPermissionsRequest {
        permissions: PermissionType[];
        /**
         * Origin the permission applies to, all origins if not specified.
         */
        origin?: string;
        /**
         * BrowserContext to override permissions. When omitted, default browser context is used.
         */
        browserContextId?: BrowserContextID;
    }
    interface ResetPermissionsRequest {
        /**
         * BrowserContext to reset permissions. When omitted, default browser context is used.
         */
        browserContextId?: BrowserContextID;
    }
    const enum SetDownloadBehaviorRequestBehavior {
        Deny = "deny",
        Allow = "allow",
        AllowAndName = "allowAndName",
        Default = "default"
    }
    interface SetDownloadBehaviorRequest {
        /**
         * Whether to allow all or deny all download requests, or use default Chrome behavior if
         * available (otherwise deny). |allowAndName| allows download and names files according to
         * their download guids.
         */
        behavior: SetDownloadBehaviorRequestBehavior;
        /**
         * BrowserContext to set download behavior. When omitted, default browser context is used.
         */
        browserContextId?: BrowserContextID;
        /**
         * The default path to save downloaded files to. This is required if behavior is set to 'allow'
         * or 'allowAndName'.
         */
        downloadPath?: string;
        /**
         * Whether to emit download events (defaults to false).
         */
        eventsEnabled?: boolean;
    }
    interface CancelDownloadRequest {
        /**
         * Global unique identifier of the download.
         */
        guid: string;
        /**
         * BrowserContext to perform the action in. When omitted, default browser context is used.
         */
        browserContextId?: BrowserContextID;
    }
    interface GetVersionResponse extends ProtocolResponseWithError {
        /**
         * Protocol version.
         */
        protocolVersion: string;
        /**
         * Product name.
         */
        product: string;
        /**
         * Product revision.
         */
        revision: string;
        /**
         * User-Agent.
         */
        userAgent: string;
        /**
         * V8 version.
         */
        jsVersion: string;
    }
    interface GetBrowserCommandLineResponse extends ProtocolResponseWithError {
        /**
         * Commandline parameters
         */
        arguments: string[];
    }
    interface AddMockCameraRequest {
        /**
         * Required non-empty identifier for the mock camera within the current
         * DevTools session. Different sessions can use the same identifier
         * without replacing each other's cameras. This is not the
         * MediaDeviceInfo.deviceId exposed to the page.
         */
        deviceId: string;
    }
    interface GetHistogramsRequest {
        /**
         * Requested substring in name. Only histograms which have query as a
         * substring in their name are extracted. An empty or absent query returns
         * all histograms.
         */
        query?: string;
        /**
         * If true, retrieve delta since last delta call.
         */
        delta?: boolean;
    }
    interface GetHistogramsResponse extends ProtocolResponseWithError {
        /**
         * Histograms.
         */
        histograms: Histogram[];
    }
    interface GetHistogramRequest {
        /**
         * Requested histogram name.
         */
        name: string;
        /**
         * If true, retrieve delta since last delta call.
         */
        delta?: boolean;
    }
    interface GetHistogramResponse extends ProtocolResponseWithError {
        /**
         * Histogram.
         */
        histogram: Histogram;
    }
    interface GetWindowBoundsRequest {
        /**
         * Browser window id.
         */
        windowId: WindowID;
    }
    interface GetWindowBoundsResponse extends ProtocolResponseWithError {
        /**
         * Bounds information of the window. When window state is 'minimized', the restored window
         * position and size are returned.
         */
        bounds: Bounds;
    }
    interface GetWindowForTargetRequest {
        /**
         * Devtools agent host id. If called as a part of the session, associated targetId is used.
         */
        targetId?: Target.TargetID;
    }
    interface GetWindowForTargetResponse extends ProtocolResponseWithError {
        /**
         * Browser window id.
         */
        windowId: WindowID;
        /**
         * Bounds information of the window. When window state is 'minimized', the restored window
         * position and size are returned.
         */
        bounds: Bounds;
    }
    interface SetWindowBoundsRequest {
        /**
         * Browser window id.
         */
        windowId: WindowID;
        /**
         * New window bounds. The 'minimized', 'maximized' and 'fullscreen' states cannot be combined
         * with 'left', 'top', 'width' or 'height'. Leaves unspecified fields unchanged.
         */
        bounds: Bounds;
    }
    interface SetContentsSizeRequest {
        /**
         * Browser window id.
         */
        windowId: WindowID;
        /**
         * The window contents width in DIP. Assumes current width if omitted.
         * Must be specified if 'height' is omitted.
         */
        width?: integer;
        /**
         * The window contents height in DIP. Assumes current height if omitted.
         * Must be specified if 'width' is omitted.
         */
        height?: integer;
    }
    interface SetDockTileRequest {
        badgeLabel?: string;
        /**
         * Png encoded image.
         */
        image?: binary;
    }
    interface ExecuteBrowserCommandRequest {
        commandId: BrowserCommandId;
    }
    interface AddPrivacySandboxEnrollmentOverrideRequest {
        url: string;
    }
    interface GetGlobalPrivacyControlResponse extends ProtocolResponseWithError {
        gpc: boolean;
    }
    interface SetGlobalPrivacyControlRequest {
        gpc: boolean;
    }
    interface SetGlobalPrivacyControlResponse extends ProtocolResponseWithError {
        gpc: boolean;
    }
    /**
     * Fired when page is about to start a download.
     */
    interface DownloadWillBeginEvent {
        /**
         * Id of the frame that caused the download to begin.
         */
        frameId: Page.FrameId;
        /**
         * Global unique identifier of the download.
         */
        guid: string;
        /**
         * URL of the resource being downloaded.
         */
        url: string;
        /**
         * Suggested file name of the resource (the actual name of the file saved on disk may differ).
         */
        suggestedFilename: string;
    }
    const enum DownloadProgressEventState {
        InProgress = "inProgress",
        Completed = "completed",
        Canceled = "canceled"
    }
    /**
     * Fired when download makes progress. Last call has |done| == true.
     */
    interface DownloadProgressEvent {
        /**
         * Global unique identifier of the download.
         */
        guid: string;
        /**
         * Total expected bytes to download.
         */
        totalBytes: number;
        /**
         * Total bytes received.
         */
        receivedBytes: number;
        /**
         * Download status.
         */
        state: DownloadProgressEventState;
        /**
         * If download is "completed", provides the path of the downloaded file.
         * Depending on the platform, it is not guaranteed to be set, nor the file
         * is guaranteed to exist.
         */
        filePath?: string;
    }
}
/**
 * This domain exposes CSS read/write operations. All CSS objects (stylesheets, rules, and styles)
 * have an associated `id` used in subsequent operations on the related object. Each object type has
 * a specific `id` structure, and those are not interchangeable between objects of different kinds.
 * CSS objects can be loaded using the `get*ForNode()` calls (which accept a DOM node id). A client
 * can also keep track of stylesheets via the `styleSheetAdded`/`styleSheetRemoved` events and
 * subsequently load the required stylesheet contents using the `getStyleSheet[Text]()` methods.
 */
export declare namespace CSS {
    /**
     * Stylesheet type: "injected" for stylesheets injected via extension, "user-agent" for user-agent
     * stylesheets, "inspector" for stylesheets created by the inspector (i.e. those holding the "via
     * inspector" rules), "regular" for regular stylesheets.
     */
    const enum StyleSheetOrigin {
        Injected = "injected",
        UserAgent = "user-agent",
        Inspector = "inspector",
        Regular = "regular"
    }
    /**
     * CSS rule collection for a single pseudo style.
     */
    interface PseudoElementMatches {
        /**
         * Pseudo element type.
         */
        pseudoType: DOM.PseudoType;
        /**
         * Pseudo element custom ident.
         */
        pseudoIdentifier?: string;
        /**
         * Matches of CSS rules applicable to the pseudo style.
         */
        matches: RuleMatch[];
    }
    /**
     * CSS style coming from animations with the name of the animation.
     */
    interface CSSAnimationStyle {
        /**
         * The name of the animation.
         */
        name?: string;
        /**
         * The style coming from the animation.
         */
        style: CSSStyle;
    }
    /**
     * Inherited CSS rule collection from ancestor node.
     */
    interface InheritedStyleEntry {
        /**
         * The ancestor node's inline style, if any, in the style inheritance chain.
         */
        inlineStyle?: CSSStyle;
        /**
         * Matches of CSS rules matching the ancestor node in the style inheritance chain.
         */
        matchedCSSRules: RuleMatch[];
    }
    /**
     * Inherited CSS style collection for animated styles from ancestor node.
     */
    interface InheritedAnimatedStyleEntry {
        /**
         * Styles coming from the animations of the ancestor, if any, in the style inheritance chain.
         */
        animationStyles?: CSSAnimationStyle[];
        /**
         * The style coming from the transitions of the ancestor, if any, in the style inheritance chain.
         */
        transitionsStyle?: CSSStyle;
    }
    /**
     * Inherited pseudo element matches from pseudos of an ancestor node.
     */
    interface InheritedPseudoElementMatches {
        /**
         * Matches of pseudo styles from the pseudos of an ancestor node.
         */
        pseudoElements: PseudoElementMatches[];
    }
    /**
     * Match data for a CSS rule.
     */
    interface RuleMatch {
        /**
         * CSS rule in the match.
         */
        rule: CSSRule;
        /**
         * Matching selector indices in the rule's selectorList selectors (0-based).
         */
        matchingSelectors: integer[];
    }
    /**
     * Data for a simple selector (these are delimited by commas in a selector list).
     */
    interface Value {
        /**
         * Value text.
         */
        text: string;
        /**
         * Value range in the underlying resource (if available).
         */
        range?: SourceRange;
        /**
         * Specificity of the selector.
         */
        specificity?: Specificity;
    }
    /**
     * Contribution of an individual simple selector to specificity.
     */
    interface SpecificityComponent {
        /**
         * The simple selector text that contributes to specificity.
         */
        text: string;
        /**
         * The a component contribution.
         */
        a: integer;
        /**
         * The b component contribution.
         */
        b: integer;
        /**
         * The c component contribution.
         */
        c: integer;
    }
    /**
     * Specificity:
     * https://drafts.csswg.org/selectors/#specificity-rules
     */
    interface Specificity {
        /**
         * The a component, which represents the number of ID selectors.
         */
        a: integer;
        /**
         * The b component, which represents the number of class selectors, attributes selectors, and
         * pseudo-classes.
         */
        b: integer;
        /**
         * The c component, which represents the number of type selectors and pseudo-elements.
         */
        c: integer;
        /**
         * Per-simple-selector contributions used to explain this specificity.
         */
        components?: SpecificityComponent[];
    }
    /**
     * Selector list data.
     */
    interface SelectorList {
        /**
         * Selectors in the list.
         */
        selectors: Value[];
        /**
         * Rule selector text.
         */
        text: string;
    }
    /**
     * CSS stylesheet metainformation.
     */
    interface CSSStyleSheetHeader {
        /**
         * The stylesheet identifier.
         */
        styleSheetId: DOM.StyleSheetId;
        /**
         * Owner frame identifier.
         */
        frameId: Page.FrameId;
        /**
         * Stylesheet resource URL. Empty if this is a constructed stylesheet created using
         * new CSSStyleSheet() (but non-empty if this is a constructed stylesheet imported
         * as a CSS module script).
         */
        sourceURL: string;
        /**
         * URL of source map associated with the stylesheet (if any).
         */
        sourceMapURL?: string;
        /**
         * Stylesheet origin.
         */
        origin: StyleSheetOrigin;
        /**
         * Stylesheet title.
         */
        title: string;
        /**
         * The backend id for the owner node of the stylesheet.
         */
        ownerNode?: DOM.BackendNodeId;
        /**
         * Denotes whether the stylesheet is disabled.
         */
        disabled: boolean;
        /**
         * Whether the sourceURL field value comes from the sourceURL comment.
         */
        hasSourceURL?: boolean;
        /**
         * Whether this stylesheet is created for STYLE tag by parser. This flag is not set for
         * document.written STYLE tags.
         */
        isInline: boolean;
        /**
         * Whether this stylesheet is mutable. Inline stylesheets become mutable
         * after they have been modified via CSSOM API.
         * `<link>` element's stylesheets become mutable only if DevTools modifies them.
         * Constructed stylesheets (new CSSStyleSheet()) are mutable immediately after creation.
         */
        isMutable: boolean;
        /**
         * True if this stylesheet is created through new CSSStyleSheet() or imported as a
         * CSS module script.
         */
        isConstructed: boolean;
        /**
         * Line offset of the stylesheet within the resource (zero based).
         */
        startLine: number;
        /**
         * Column offset of the stylesheet within the resource (zero based).
         */
        startColumn: number;
        /**
         * Size of the content (in characters).
         */
        length: number;
        /**
         * Line offset of the end of the stylesheet within the resource (zero based).
         */
        endLine: number;
        /**
         * Column offset of the end of the stylesheet within the resource (zero based).
         */
        endColumn: number;
        /**
         * If the style sheet was loaded from a network resource, this indicates when the resource failed to load
         */
        loadingFailed?: boolean;
    }
    /**
     * CSS rule representation.
     */
    interface CSSRule {
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Rule selector data.
         */
        selectorList: SelectorList;
        /**
         * Array of selectors from ancestor style rules, sorted by distance from the current rule.
         */
        nestingSelectors?: string[];
        /**
         * Parent stylesheet's origin.
         */
        origin: StyleSheetOrigin;
        /**
         * Associated style declaration.
         */
        style: CSSStyle;
        /**
         * The BackendNodeId of the DOM node that constitutes the origin tree scope of this rule.
         */
        originTreeScopeNodeId?: DOM.BackendNodeId;
        /**
         * Media list array (for rules involving media queries). The array enumerates media queries
         * starting with the innermost one, going outwards.
         */
        media?: CSSMedia[];
        /**
         * Container query list array (for rules involving container queries).
         * The array enumerates container queries starting with the innermost one, going outwards.
         */
        containerQueries?: CSSContainerQuery[];
        /**
         * @supports CSS at-rule array.
         * The array enumerates @supports at-rules starting with the innermost one, going outwards.
         */
        supports?: CSSSupports[];
        /**
         * Cascade layer array. Contains the layer hierarchy that this rule belongs to starting
         * with the innermost layer and going outwards.
         */
        layers?: CSSLayer[];
        /**
         * @scope CSS at-rule array.
         * The array enumerates @scope at-rules starting with the innermost one, going outwards.
         */
        scopes?: CSSScope[];
        /**
         * The array keeps the types of ancestor CSSRules from the innermost going outwards.
         */
        ruleTypes?: CSSRuleType[];
        /**
         * @starting-style CSS at-rule array.
         * The array enumerates @starting-style at-rules starting with the innermost one, going outwards.
         */
        startingStyles?: CSSStartingStyle[];
        /**
         * @navigation CSS at-rule array.
         * The array enumerates @navigation at-rules starting with the innermost one, going outwards.
         */
        navigations?: CSSNavigation[];
    }
    /**
     * Enum indicating the type of a CSS rule, used to represent the order of a style rule's ancestors.
     * This list only contains rule types that are collected during the ancestor rule collection.
     */
    const enum CSSRuleType {
        MediaRule = "MediaRule",
        SupportsRule = "SupportsRule",
        ContainerRule = "ContainerRule",
        LayerRule = "LayerRule",
        ScopeRule = "ScopeRule",
        StyleRule = "StyleRule",
        StartingStyleRule = "StartingStyleRule",
        NavigationRule = "NavigationRule"
    }
    /**
     * CSS coverage information.
     */
    interface RuleUsage {
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId: DOM.StyleSheetId;
        /**
         * Offset of the start of the rule (including selector) from the beginning of the stylesheet.
         */
        startOffset: number;
        /**
         * Offset of the end of the rule body from the beginning of the stylesheet.
         */
        endOffset: number;
        /**
         * Indicates whether the rule was actually used by some element in the page.
         */
        used: boolean;
    }
    /**
     * Text range within a resource. All numbers are zero-based.
     */
    interface SourceRange {
        /**
         * Start line of range.
         */
        startLine: integer;
        /**
         * Start column of range (inclusive).
         */
        startColumn: integer;
        /**
         * End line of range
         */
        endLine: integer;
        /**
         * End column of range (exclusive).
         */
        endColumn: integer;
    }
    interface ShorthandEntry {
        /**
         * Shorthand name.
         */
        name: string;
        /**
         * Shorthand value.
         */
        value: string;
        /**
         * Whether the property has "!important" annotation (implies `false` if absent).
         */
        important?: boolean;
    }
    interface CSSComputedStyleProperty {
        /**
         * Computed style property name.
         */
        name: string;
        /**
         * Computed style property value.
         */
        value: string;
    }
    interface ComputedStyleExtraFields {
        /**
         * Returns whether or not this node is being rendered with base appearance,
         * which happens when it has its appearance property set to base/base-select
         * or it is in the subtree of an element being rendered with base appearance.
         */
        isAppearanceBase: boolean;
    }
    /**
     * CSS style representation.
     */
    interface CSSStyle {
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * CSS properties in the style.
         */
        cssProperties: CSSProperty[];
        /**
         * Computed values for all shorthands found in the style.
         */
        shorthandEntries: ShorthandEntry[];
        /**
         * Style declaration text (if available).
         */
        cssText?: string;
        /**
         * Style declaration range in the enclosing stylesheet (if available).
         */
        range?: SourceRange;
    }
    /**
     * CSS property declaration data.
     */
    interface CSSProperty {
        /**
         * The property name.
         */
        name: string;
        /**
         * The property value.
         */
        value: string;
        /**
         * Whether the property has "!important" annotation (implies `false` if absent).
         */
        important?: boolean;
        /**
         * Whether the property is implicit (implies `false` if absent).
         */
        implicit?: boolean;
        /**
         * The full property text as specified in the style.
         */
        text?: string;
        /**
         * Whether the property is understood by the browser (implies `true` if absent).
         */
        parsedOk?: boolean;
        /**
         * Whether the property is disabled by the user (present for source-based properties only).
         */
        disabled?: boolean;
        /**
         * The entire property range in the enclosing style declaration (if available).
         */
        range?: SourceRange;
        /**
         * Parsed longhand components of this property if it is a shorthand.
         * This field will be empty if the given property is not a shorthand.
         */
        longhandProperties?: CSSProperty[];
    }
    const enum CSSMediaSource {
        MediaRule = "mediaRule",
        ImportRule = "importRule",
        LinkedSheet = "linkedSheet",
        InlineSheet = "inlineSheet"
    }
    /**
     * CSS media rule descriptor.
     */
    interface CSSMedia {
        /**
         * Media query text.
         */
        text: string;
        /**
         * Source of the media query: "mediaRule" if specified by a @media rule, "importRule" if
         * specified by an @import rule, "linkedSheet" if specified by a "media" attribute in a linked
         * stylesheet's LINK tag, "inlineSheet" if specified by a "media" attribute in an inline
         * stylesheet's STYLE tag.
         */
        source: CSSMediaSource;
        /**
         * URL of the document containing the media query description.
         */
        sourceURL?: string;
        /**
         * The associated rule (@media or @import) header range in the enclosing stylesheet (if
         * available).
         */
        range?: SourceRange;
        /**
         * Identifier of the stylesheet containing this object (if exists).
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Array of media queries.
         */
        mediaList?: MediaQuery[];
    }
    /**
     * Media query descriptor.
     */
    interface MediaQuery {
        /**
         * Array of media query expressions.
         */
        expressions: MediaQueryExpression[];
        /**
         * Whether the media query condition is satisfied.
         */
        active: boolean;
    }
    /**
     * Media query expression descriptor.
     */
    interface MediaQueryExpression {
        /**
         * Media query expression value.
         */
        value: number;
        /**
         * Media query expression units.
         */
        unit: string;
        /**
         * Media query expression feature.
         */
        feature: string;
        /**
         * The associated range of the value text in the enclosing stylesheet (if available).
         */
        valueRange?: SourceRange;
        /**
         * Computed length of media query expression (if applicable).
         */
        computedLength?: number;
    }
    /**
     * CSS container query rule descriptor.
     */
    interface CSSContainerQuery {
        /**
         * Container query text.
         * Contains the query part without the container name for a single query.
         * Deprecated in favor of conditionText which contains the full prelude
         * after @container.
         * @deprecated
         */
        text: string;
        /**
         * The associated rule header range in the enclosing stylesheet (if
         * available).
         */
        range?: SourceRange;
        /**
         * Identifier of the stylesheet containing this object (if exists).
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Optional name for the container.
         */
        name?: string;
        /**
         * Optional physical axes queried for the container.
         */
        physicalAxes?: DOM.PhysicalAxes;
        /**
         * Optional logical axes queried for the container.
         */
        logicalAxes?: DOM.LogicalAxes;
        /**
         * true if the query contains scroll-state() queries.
         */
        queriesScrollState?: boolean;
        /**
         * true if the query contains anchored() queries.
         */
        queriesAnchored?: boolean;
        /**
         * CSSContainerRule.conditionText
         */
        conditionText: string;
    }
    /**
     * CSS Supports at-rule descriptor.
     */
    interface CSSSupports {
        /**
         * Supports rule text.
         */
        text: string;
        /**
         * Whether the supports condition is satisfied.
         */
        active: boolean;
        /**
         * The associated rule header range in the enclosing stylesheet (if
         * available).
         */
        range?: SourceRange;
        /**
         * Identifier of the stylesheet containing this object (if exists).
         */
        styleSheetId?: DOM.StyleSheetId;
    }
    /**
     * CSS Navigation at-rule descriptor.
     */
    interface CSSNavigation {
        /**
         * Navigation rule text.
         */
        text: string;
        /**
         * Whether the navigation condition is satisfied.
         */
        active?: boolean;
        /**
         * The associated rule header range in the enclosing stylesheet (if
         * available).
         */
        range?: SourceRange;
        /**
         * Identifier of the stylesheet containing this object (if exists).
         */
        styleSheetId?: DOM.StyleSheetId;
    }
    /**
     * CSS Scope at-rule descriptor.
     */
    interface CSSScope {
        /**
         * Scope rule text.
         */
        text: string;
        /**
         * The associated rule header range in the enclosing stylesheet (if
         * available).
         */
        range?: SourceRange;
        /**
         * Identifier of the stylesheet containing this object (if exists).
         */
        styleSheetId?: DOM.StyleSheetId;
    }
    /**
     * CSS Layer at-rule descriptor.
     */
    interface CSSLayer {
        /**
         * Layer name.
         */
        text: string;
        /**
         * The associated rule header range in the enclosing stylesheet (if
         * available).
         */
        range?: SourceRange;
        /**
         * Identifier of the stylesheet containing this object (if exists).
         */
        styleSheetId?: DOM.StyleSheetId;
    }
    /**
     * CSS Starting Style at-rule descriptor.
     */
    interface CSSStartingStyle {
        /**
         * The associated rule header range in the enclosing stylesheet (if
         * available).
         */
        range?: SourceRange;
        /**
         * Identifier of the stylesheet containing this object (if exists).
         */
        styleSheetId?: DOM.StyleSheetId;
    }
    /**
     * CSS Layer data.
     */
    interface CSSLayerData {
        /**
         * Layer name.
         */
        name: string;
        /**
         * Direct sub-layers
         */
        subLayers?: CSSLayerData[];
        /**
         * Layer order. The order determines the order of the layer in the cascade order.
         * A higher number has higher priority in the cascade order.
         */
        order: number;
    }
    /**
     * Information about amount of glyphs that were rendered with given font.
     */
    interface PlatformFontUsage {
        /**
         * Font's family name reported by platform.
         */
        familyName: string;
        /**
         * Font's PostScript name reported by platform.
         */
        postScriptName: string;
        /**
         * Indicates if the font was downloaded or resolved locally.
         */
        isCustomFont: boolean;
        /**
         * Amount of glyphs that were rendered with this font.
         */
        glyphCount: number;
    }
    /**
     * Information about font variation axes for variable fonts
     */
    interface FontVariationAxis {
        /**
         * The font-variation-setting tag (a.k.a. "axis tag").
         */
        tag: string;
        /**
         * Human-readable variation name in the default language (normally, "en").
         */
        name: string;
        /**
         * The minimum value (inclusive) the font supports for this tag.
         */
        minValue: number;
        /**
         * The maximum value (inclusive) the font supports for this tag.
         */
        maxValue: number;
        /**
         * The default value.
         */
        defaultValue: number;
    }
    /**
     * Properties of a web font: https://www.w3.org/TR/2008/REC-CSS2-20080411/fonts.html#font-descriptions
     * and additional information such as platformFontFamily and fontVariationAxes.
     */
    interface FontFace {
        /**
         * The font-family.
         */
        fontFamily: string;
        /**
         * The font-style.
         */
        fontStyle: string;
        /**
         * The font-variant.
         */
        fontVariant: string;
        /**
         * The font-weight.
         */
        fontWeight: string;
        /**
         * The font-stretch.
         */
        fontStretch: string;
        /**
         * The font-display.
         */
        fontDisplay: string;
        /**
         * The unicode-range.
         */
        unicodeRange: string;
        /**
         * The src.
         */
        src: string;
        /**
         * The resolved platform font family
         */
        platformFontFamily: string;
        /**
         * Available variation settings (a.k.a. "axes").
         */
        fontVariationAxes?: FontVariationAxis[];
    }
    /**
     * CSS try rule representation.
     */
    interface CSSTryRule {
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Parent stylesheet's origin.
         */
        origin: StyleSheetOrigin;
        /**
         * Associated style declaration.
         */
        style: CSSStyle;
    }
    /**
     * CSS @position-try rule representation.
     */
    interface CSSPositionTryRule {
        /**
         * The prelude dashed-ident name
         */
        name: Value;
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Parent stylesheet's origin.
         */
        origin: StyleSheetOrigin;
        /**
         * Associated style declaration.
         */
        style: CSSStyle;
        active: boolean;
    }
    /**
     * CSS keyframes rule representation.
     */
    interface CSSKeyframesRule {
        /**
         * Animation name.
         */
        animationName: Value;
        /**
         * List of keyframes.
         */
        keyframes: CSSKeyframeRule[];
    }
    /**
     * Representation of a custom property registration through CSS.registerProperty
     */
    interface CSSPropertyRegistration {
        propertyName: string;
        initialValue?: Value;
        inherits: boolean;
        syntax: string;
    }
    const enum CSSAtRuleType {
        FontFace = "font-face",
        FontFeatureValues = "font-feature-values",
        FontPaletteValues = "font-palette-values",
        CounterStyle = "counter-style"
    }
    const enum CSSAtRuleSubsection {
        Swash = "swash",
        Annotation = "annotation",
        Ornaments = "ornaments",
        Stylistic = "stylistic",
        Styleset = "styleset",
        CharacterVariant = "character-variant"
    }
    /**
     * CSS generic @rule representation.
     */
    interface CSSAtRule {
        /**
         * Type of at-rule.
         */
        type: CSSAtRuleType;
        /**
         * Subsection of font-feature-values, if this is a subsection.
         */
        subsection?: CSSAtRuleSubsection;
        /**
         * LINT_SKIP.ThenChange(//third_party/blink/renderer/core/inspector/inspector_style_sheet.cc:FontVariantAlternatesFeatureType,//third_party/blink/renderer/core/inspector/inspector_css_agent.cc:FontVariantAlternatesFeatureType)
         * Associated name, if applicable.
         */
        name?: Value;
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Parent stylesheet's origin.
         */
        origin: StyleSheetOrigin;
        /**
         * Associated style declaration.
         */
        style: CSSStyle;
    }
    /**
     * CSS property at-rule representation.
     */
    interface CSSPropertyRule {
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Parent stylesheet's origin.
         */
        origin: StyleSheetOrigin;
        /**
         * Associated property name.
         */
        propertyName: Value;
        /**
         * Associated style declaration.
         */
        style: CSSStyle;
    }
    /**
     * CSS function argument representation.
     */
    interface CSSFunctionParameter {
        /**
         * The parameter name.
         */
        name: string;
        /**
         * The parameter type.
         */
        type: string;
    }
    /**
     * CSS function conditional block representation.
     */
    interface CSSFunctionConditionNode {
        /**
         * Media query for this conditional block. Only one type of condition should be set.
         */
        media?: CSSMedia;
        /**
         * Container query for this conditional block. Only one type of condition should be set.
         */
        containerQueries?: CSSContainerQuery;
        /**
         * @supports CSS at-rule condition. Only one type of condition should be set.
         */
        supports?: CSSSupports;
        /**
         * @navigation condition. Only one type of condition should be set.
         */
        navigation?: CSSNavigation;
        /**
         * Block body.
         */
        children: CSSFunctionNode[];
        /**
         * The condition text.
         */
        conditionText: string;
    }
    /**
     * Section of the body of a CSS function rule.
     */
    interface CSSFunctionNode {
        /**
         * A conditional block. If set, style should not be set.
         */
        condition?: CSSFunctionConditionNode;
        /**
         * Values set by this node. If set, condition should not be set.
         */
        style?: CSSStyle;
    }
    /**
     * CSS function at-rule representation.
     */
    interface CSSFunctionRule {
        /**
         * Name of the function.
         */
        name: Value;
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Parent stylesheet's origin.
         */
        origin: StyleSheetOrigin;
        /**
         * List of parameters.
         */
        parameters: CSSFunctionParameter[];
        /**
         * Function body.
         */
        children: CSSFunctionNode[];
        /**
         * The BackendNodeId of the DOM node that constitutes the origin tree scope of this rule.
         */
        originTreeScopeNodeId?: DOM.BackendNodeId;
    }
    /**
     * CSS keyframe rule representation.
     */
    interface CSSKeyframeRule {
        /**
         * The css style sheet identifier (absent for user agent stylesheet and user-specified
         * stylesheet rules) this rule came from.
         */
        styleSheetId?: DOM.StyleSheetId;
        /**
         * Parent stylesheet's origin.
         */
        origin: StyleSheetOrigin;
        /**
         * Associated key text.
         */
        keyText: Value;
        /**
         * Associated style declaration.
         */
        style: CSSStyle;
    }
    /**
     * A descriptor of operation to mutate style declaration text.
     */
    interface StyleDeclarationEdit {
        /**
         * The css style sheet identifier.
         */
        styleSheetId: DOM.StyleSheetId;
        /**
         * The range of the style text in the enclosing stylesheet.
         */
        range: SourceRange;
        /**
         * New style text.
         */
        text: string;
    }
    interface AddRuleRequest {
        /**
         * The css style sheet identifier where a new rule should be inserted.
         */
        styleSheetId: DOM.StyleSheetId;
        /**
         * The text of a new rule.
         */
        ruleText: string;
        /**
         * Text position of a new rule in the target style sheet.
         */
        location: SourceRange;
        /**
         * NodeId for the DOM node in whose context custom property declarations for registered properties should be
         * validated. If omitted, declarations in the new rule text can only be validated statically, which may produce
         * incorrect results if the declaration contains a var() for example.
         */
        nodeForPropertySyntaxValidation?: DOM.NodeId;
    }
    interface AddRuleResponse extends ProtocolResponseWithError {
        /**
         * The newly created rule.
         */
        rule: CSSRule;
    }
    interface CollectClassNamesRequest {
        styleSheetId: DOM.StyleSheetId;
    }
    interface CollectClassNamesResponse extends ProtocolResponseWithError {
        /**
         * Class name list.
         */
        classNames: string[];
    }
    interface CreateStyleSheetRequest {
        /**
         * Identifier of the frame where "via-inspector" stylesheet should be created.
         */
        frameId: Page.FrameId;
        /**
         * If true, creates a new stylesheet for every call. If false,
         * returns a stylesheet previously created by a call with force=false
         * for the frame's document if it exists or creates a new stylesheet
         * (default: false).
         */
        force?: boolean;
    }
    interface CreateStyleSheetResponse extends ProtocolResponseWithError {
        /**
         * Identifier of the created "via-inspector" stylesheet.
         */
        styleSheetId: DOM.StyleSheetId;
    }
    interface ForcePseudoStateRequest {
        /**
         * The element id for which to force the pseudo state.
         */
        nodeId: DOM.NodeId;
        /**
         * Element pseudo classes to force when computing the element's style.
         */
        forcedPseudoClasses: string[];
    }
    interface ForceStartingStyleRequest {
        /**
         * The element id for which to force the starting-style state.
         */
        nodeId: DOM.NodeId;
        /**
         * Boolean indicating if this is on or off.
         */
        forced: boolean;
    }
    interface ForcePositionTryOptionRequest {
        /**
         * The element id for which to force the position-try option.
         */
        nodeId: DOM.NodeId;
        /**
         * The 1-based index of the position-try fallback option, 0 for base position (no fallback),
         * or omitted to clear the forced state.
         */
        index?: integer;
    }
    interface GetBackgroundColorsRequest {
        /**
         * Id of the node to get background colors for.
         */
        nodeId: DOM.NodeId;
    }
    interface GetBackgroundColorsResponse extends ProtocolResponseWithError {
        /**
         * The range of background colors behind this element, if it contains any visible text. If no
         * visible text is present, this will be undefined. In the case of a flat background color,
         * this will consist of simply that color. In the case of a gradient, this will consist of each
         * of the color stops. For anything more complicated, this will be an empty array. Images will
         * be ignored (as if the image had failed to load).
         */
        backgroundColors?: string[];
        /**
         * The computed font size for this node, as a CSS computed value string (e.g. '12px').
         */
        computedFontSize?: string;
        /**
         * The computed font weight for this node, as a CSS computed value string (e.g. 'normal' or
         * '100').
         */
        computedFontWeight?: string;
    }
    interface GetComputedStyleForNodeRequest {
        nodeId: DOM.NodeId;
    }
    interface GetComputedStyleForNodeResponse extends ProtocolResponseWithError {
        /**
         * Computed style for the specified DOM node.
         */
        computedStyle: CSSComputedStyleProperty[];
        /**
         * A list of non-standard "extra fields" which blink stores alongside each
         * computed style.
         */
        extraFields: ComputedStyleExtraFields;
    }
    interface ResolveValuesRequest {
        /**
         * Cascade-dependent keywords (revert/revert-layer) do not work.
         */
        values: string[];
        /**
         * Id of the node in whose context the expression is evaluated
         */
        nodeId: DOM.NodeId;
        /**
         * Only longhands and custom property names are accepted.
         */
        propertyName?: string;
        /**
         * Pseudo element type, only works for pseudo elements that generate
         * elements in the tree, such as ::before and ::after.
         */
        pseudoType?: DOM.PseudoType;
        /**
         * Pseudo element custom ident.
         */
        pseudoIdentifier?: string;
    }
    interface ResolveValuesResponse extends ProtocolResponseWithError {
        results: string[];
    }
    interface GetLonghandPropertiesRequest {
        shorthandName: string;
        value: string;
    }
    interface GetLonghandPropertiesResponse extends ProtocolResponseWithError {
        longhandProperties: CSSProperty[];
    }
    interface GetInlineStylesForNodeRequest {
        nodeId: DOM.NodeId;
    }
    interface GetInlineStylesForNodeResponse extends ProtocolResponseWithError {
        /**
         * Inline style for the specified DOM node.
         */
        inlineStyle?: CSSStyle;
        /**
         * Attribute-defined element style (e.g. resulting from "width=20 height=100%").
         */
        attributesStyle?: CSSStyle;
    }
    interface GetAnimatedStylesForNodeRequest {
        nodeId: DOM.NodeId;
    }
    interface GetAnimatedStylesForNodeResponse extends ProtocolResponseWithError {
        /**
         * Styles coming from animations.
         */
        animationStyles?: CSSAnimationStyle[];
        /**
         * Style coming from transitions.
         */
        transitionsStyle?: CSSStyle;
        /**
         * Inherited style entries for animationsStyle and transitionsStyle from
         * the inheritance chain of the element.
         */
        inherited?: InheritedAnimatedStyleEntry[];
    }
    interface GetMatchedStylesForNodeRequest {
        nodeId: DOM.NodeId;
    }
    interface GetMatchedStylesForNodeResponse extends ProtocolResponseWithError {
        /**
         * Inline style for the specified DOM node.
         */
        inlineStyle?: CSSStyle;
        /**
         * Attribute-defined element style (e.g. resulting from "width=20 height=100%").
         */
        attributesStyle?: CSSStyle;
        /**
         * CSS rules matching this node, from all applicable stylesheets.
         */
        matchedCSSRules?: RuleMatch[];
        /**
         * Pseudo style matches for this node.
         */
        pseudoElements?: PseudoElementMatches[];
        /**
         * A chain of inherited styles (from the immediate node parent up to the DOM tree root).
         */
        inherited?: InheritedStyleEntry[];
        /**
         * A chain of inherited pseudo element styles (from the immediate node parent up to the DOM tree root).
         */
        inheritedPseudoElements?: InheritedPseudoElementMatches[];
        /**
         * A list of CSS keyframed animations matching this node.
         */
        cssKeyframesRules?: CSSKeyframesRule[];
        /**
         * A list of CSS @position-try rules matching this node, based on the position-try-fallbacks property.
         */
        cssPositionTryRules?: CSSPositionTryRule[];
        /**
         * Index of the active fallback in the applied position-try-fallback property,
         * will not be set if there is no active position-try fallback.
         */
        activePositionFallbackIndex?: integer;
        /**
         * A list of CSS at-property rules matching this node.
         */
        cssPropertyRules?: CSSPropertyRule[];
        /**
         * A list of CSS property registrations matching this node.
         */
        cssPropertyRegistrations?: CSSPropertyRegistration[];
        /**
         * A list of simple @rules matching this node or its pseudo-elements.
         */
        cssAtRules?: CSSAtRule[];
        /**
         * Id of the first parent element that does not have display: contents.
         */
        parentLayoutNodeId?: DOM.NodeId;
        /**
         * A list of CSS at-function rules referenced by styles of this node.
         */
        cssFunctionRules?: CSSFunctionRule[];
    }
    interface GetEnvironmentVariablesResponse extends ProtocolResponseWithError {
        environmentVariables: any;
    }
    interface GetMediaQueriesResponse extends ProtocolResponseWithError {
        medias: CSSMedia[];
    }
    interface GetPlatformFontsForNodeRequest {
        nodeId: DOM.NodeId;
    }
    interface GetPlatformFontsForNodeResponse extends ProtocolResponseWithError {
        /**
         * Usage statistics for every employed platform font.
         */
        fonts: PlatformFontUsage[];
    }
    interface GetStyleSheetTextRequest {
        styleSheetId: DOM.StyleSheetId;
    }
    interface GetStyleSheetTextResponse extends ProtocolResponseWithError {
        /**
         * The stylesheet text.
         */
        text: string;
    }
    interface GetLayersForNodeRequest {
        nodeId: DOM.NodeId;
    }
    interface GetLayersForNodeResponse extends ProtocolResponseWithError {
        rootLayer: CSSLayerData;
    }
    interface GetLocationForSelectorRequest {
        styleSheetId: DOM.StyleSheetId;
        selectorText: string;
    }
    interface GetLocationForSelectorResponse extends ProtocolResponseWithError {
        ranges: SourceRange[];
    }
    interface TrackComputedStyleUpdatesForNodeRequest {
        nodeId?: DOM.NodeId;
    }
    interface TrackComputedStyleUpdatesRequest {
        propertiesToTrack: CSSComputedStyleProperty[];
    }
    interface TakeComputedStyleUpdatesResponse extends ProtocolResponseWithError {
        /**
         * The list of node Ids that have their tracked computed styles updated.
         */
        nodeIds: DOM.NodeId[];
    }
    interface SetEffectivePropertyValueForNodeRequest {
        /**
         * The element id for which to set property.
         */
        nodeId: DOM.NodeId;
        propertyName: string;
        value: string;
    }
    interface SetPropertyRulePropertyNameRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        propertyName: string;
    }
    interface SetPropertyRulePropertyNameResponse extends ProtocolResponseWithError {
        /**
         * The resulting key text after modification.
         */
        propertyName: Value;
    }
    interface SetKeyframeKeyRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        keyText: string;
    }
    interface SetKeyframeKeyResponse extends ProtocolResponseWithError {
        /**
         * The resulting key text after modification.
         */
        keyText: Value;
    }
    interface SetMediaTextRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        text: string;
    }
    interface SetMediaTextResponse extends ProtocolResponseWithError {
        /**
         * The resulting CSS media rule after modification.
         */
        media: CSSMedia;
    }
    interface SetContainerQueryTextRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        text: string;
    }
    interface SetContainerQueryTextResponse extends ProtocolResponseWithError {
        /**
         * The resulting CSS container query rule after modification.
         */
        containerQuery: CSSContainerQuery;
    }
    interface SetContainerQueryConditionTextRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        text: string;
    }
    interface SetContainerQueryConditionTextResponse extends ProtocolResponseWithError {
        /**
         * The resulting CSS container query rule after modification.
         */
        containerQuery: CSSContainerQuery;
    }
    interface SetSupportsTextRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        text: string;
    }
    interface SetSupportsTextResponse extends ProtocolResponseWithError {
        /**
         * The resulting CSS Supports rule after modification.
         */
        supports: CSSSupports;
    }
    interface SetNavigationTextRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        text: string;
    }
    interface SetNavigationTextResponse extends ProtocolResponseWithError {
        /**
         * The resulting CSS Navigation rule after modification.
         */
        navigation: CSSNavigation;
    }
    interface SetScopeTextRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        text: string;
    }
    interface SetScopeTextResponse extends ProtocolResponseWithError {
        /**
         * The resulting CSS Scope rule after modification.
         */
        scope: CSSScope;
    }
    interface SetRuleSelectorRequest {
        styleSheetId: DOM.StyleSheetId;
        range: SourceRange;
        selector: string;
    }
    interface SetRuleSelectorResponse extends ProtocolResponseWithError {
        /**
         * The resulting selector list after modification.
         */
        selectorList: SelectorList;
    }
    interface SetStyleSheetTextRequest {
        styleSheetId: DOM.StyleSheetId;
        text: string;
    }
    interface SetStyleSheetTextResponse extends ProtocolResponseWithError {
        /**
         * URL of source map associated with script (if any).
         */
        sourceMapURL?: string;
    }
    interface SetStyleTextsRequest {
        edits: StyleDeclarationEdit[];
        /**
         * NodeId for the DOM node in whose context custom property declarations for registered properties should be
         * validated. If omitted, declarations in the new rule text can only be validated statically, which may produce
         * incorrect results if the declaration contains a var() for example.
         */
        nodeForPropertySyntaxValidation?: DOM.NodeId;
    }
    interface SetStyleTextsResponse extends ProtocolResponseWithError {
        /**
         * The resulting styles after modification.
         */
        styles: CSSStyle[];
    }
    interface StopRuleUsageTrackingResponse extends ProtocolResponseWithError {
        ruleUsage: RuleUsage[];
    }
    interface TakeCoverageDeltaResponse extends ProtocolResponseWithError {
        coverage: RuleUsage[];
        /**
         * Monotonically increasing time, in seconds.
         */
        timestamp: number;
    }
    interface SetLocalFontsEnabledRequest {
        /**
         * Whether rendering of local fonts is enabled.
         */
        enabled: boolean;
    }
    /**
     * Fires whenever a web font is updated.  A non-empty font parameter indicates a successfully loaded
     * web font.
     */
    interface FontsUpdatedEvent {
        /**
         * The web font that has loaded.
         */
        font?: FontFace;
    }
    /**
     * Fired whenever an active document stylesheet is added.
     */
    interface StyleSheetAddedEvent {
        /**
         * Added stylesheet metainfo.
         */
        header: CSSStyleSheetHeader;
    }
    /**
     * Fired whenever a stylesheet is changed as a result of the client operation.
     */
    interface StyleSheetChangedEvent {
        styleSheetId: DOM.StyleSheetId;
    }
    /**
     * Fired whenever an active document stylesheet is removed.
     */
    interface StyleSheetRemovedEvent {
        /**
         * Identifier of the removed stylesheet.
         */
        styleSheetId: DOM.StyleSheetId;
    }
    interface ComputedStyleUpdatedEvent {
        /**
         * The node id that has updated computed styles.
         */
        nodeId: DOM.NodeId;
    }
}
export declare namespace CacheStorage {
    /**
     * Unique identifier of the Cache object.
     */
    type CacheId = OpaqueIdentifier<string, 'Protocol.CacheStorage.CacheId'>;
    /**
     * type of HTTP response cached
     */
    const enum CachedResponseType {
        Basic = "basic",
        Cors = "cors",
        Default = "default",
        Error = "error",
        OpaqueResponse = "opaqueResponse",
        OpaqueRedirect = "opaqueRedirect"
    }
    /**
     * Data entry.
     */
    interface DataEntry {
        /**
         * Request URL.
         */
        requestURL: string;
        /**
         * Request method.
         */
        requestMethod: string;
        /**
         * Request headers
         */
        requestHeaders: Header[];
        /**
         * Number of seconds since epoch.
         */
        responseTime: number;
        /**
         * HTTP response status code.
         */
        responseStatus: integer;
        /**
         * HTTP response status text.
         */
        responseStatusText: string;
        /**
         * HTTP response type
         */
        responseType: CachedResponseType;
        /**
         * Response headers
         */
        responseHeaders: Header[];
    }
    /**
     * Cache identifier.
     */
    interface Cache {
        /**
         * An opaque unique id of the cache.
         */
        cacheId: CacheId;
        /**
         * Security origin of the cache.
         */
        securityOrigin: string;
        /**
         * Storage key of the cache.
         */
        storageKey: string;
        /**
         * Storage bucket of the cache.
         */
        storageBucket?: Storage.StorageBucket;
        /**
         * The name of the cache.
         */
        cacheName: string;
    }
    interface Header {
        name: string;
        value: string;
    }
    /**
     * Cached response
     */
    interface CachedResponse {
        /**
         * Entry content, base64-encoded.
         */
        body: binary;
    }
    interface DeleteCacheRequest {
        /**
         * Id of cache for deletion.
         */
        cacheId: CacheId;
    }
    interface DeleteEntryRequest {
        /**
         * Id of cache where the entry will be deleted.
         */
        cacheId: CacheId;
        /**
         * URL spec of the request.
         */
        request: string;
    }
    interface RequestCacheNamesRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
    }
    interface RequestCacheNamesResponse extends ProtocolResponseWithError {
        /**
         * Caches for the security origin.
         */
        caches: Cache[];
    }
    interface RequestCachedResponseRequest {
        /**
         * Id of cache that contains the entry.
         */
        cacheId: CacheId;
        /**
         * URL spec of the request.
         */
        requestURL: string;
        /**
         * headers of the request.
         */
        requestHeaders: Header[];
    }
    interface RequestCachedResponseResponse extends ProtocolResponseWithError {
        /**
         * Response read from the cache.
         */
        response: CachedResponse;
    }
    interface RequestEntriesRequest {
        /**
         * ID of cache to get entries from.
         */
        cacheId: CacheId;
        /**
         * Number of records to skip.
         */
        skipCount?: integer;
        /**
         * Number of records to fetch.
         */
        pageSize?: integer;
        /**
         * If present, only return the entries containing this substring in the path
         */
        pathFilter?: string;
    }
    interface RequestEntriesResponse extends ProtocolResponseWithError {
        /**
         * Array of object store data entries.
         */
        cacheDataEntries: DataEntry[];
        /**
         * Count of returned entries from this storage. If pathFilter is empty, it
         * is the count of all entries from this storage.
         */
        returnCount: number;
    }
}
/**
 * A domain for interacting with Cast, Presentation API, and Remote Playback API
 * functionalities.
 */
export declare namespace Cast {
    interface Sink {
        name: string;
        id: string;
        /**
         * Text describing the current session. Present only if there is an active
         * session on the sink.
         */
        session?: string;
    }
    interface EnableRequest {
        presentationUrl?: string;
    }
    interface SetSinkToUseRequest {
        sinkName: string;
    }
    interface StartDesktopMirroringRequest {
        sinkName: string;
    }
    interface StartTabMirroringRequest {
        sinkName: string;
    }
    interface StopCastingRequest {
        sinkName: string;
    }
    /**
     * This is fired whenever the list of available sinks changes. A sink is a
     * device or a software surface that you can cast to.
     */
    interface SinksUpdatedEvent {
        sinks: Sink[];
    }
    /**
     * This is fired whenever the outstanding issue/error message changes.
     * |issueMessage| is empty if there is no issue.
     */
    interface IssueUpdatedEvent {
        issueMessage: string;
    }
}
/**
 * This domain exposes the current state of the CrashReportContext API.
 */
export declare namespace CrashReportContext {
    /**
     * Key-value pair in CrashReportContext.
     */
    interface CrashReportContextEntry {
        key: string;
        value: string;
        /**
         * The ID of the frame where the key-value pair was set.
         */
        frameId: Page.FrameId;
    }
    interface GetEntriesResponse extends ProtocolResponseWithError {
        entries: CrashReportContextEntry[];
    }
}
/**
 * This domain exposes DOM read/write operations. Each DOM Node is represented with its mirror object
 * that has an `id`. This `id` can be used to get additional information on the Node, resolve it into
 * the JavaScript object wrapper, etc. It is important that client receives DOM events only for the
 * nodes that are known to the client. Backend keeps track of the nodes that were sent to the client
 * and never sends the same node twice. It is client's responsibility to collect information about
 * the nodes that were sent to the client. Note that `iframe` owner elements will return
 * corresponding document elements as their child nodes.
 */
export declare namespace DOM {
    /**
     * Unique DOM node identifier.
     */
    type NodeId = OpaqueIdentifier<integer, 'Protocol.DOM.NodeId'>;
    /**
     * Unique DOM node identifier used to reference a node that may not have been pushed to the
     * front-end.
     */
    type BackendNodeId = OpaqueIdentifier<integer, 'Protocol.DOM.BackendNodeId'>;
    /**
     * Unique identifier for a CSS stylesheet.
     */
    type StyleSheetId = OpaqueIdentifier<string, 'Protocol.DOM.StyleSheetId'>;
    /**
     * Backend node with a friendly name.
     */
    interface BackendNode {
        /**
         * `Node`'s nodeType.
         */
        nodeType: integer;
        /**
         * `Node`'s nodeName.
         */
        nodeName: string;
        backendNodeId: BackendNodeId;
    }
    /**
     * Pseudo element type.
     */
    const enum PseudoType {
        FirstLine = "first-line",
        FirstLetter = "first-letter",
        Checkmark = "checkmark",
        Before = "before",
        After = "after",
        ExpandIcon = "expand-icon",
        PickerIcon = "picker-icon",
        InterestButton = "interest-button",
        Marker = "marker",
        Backdrop = "backdrop",
        Column = "column",
        Selection = "selection",
        SearchText = "search-text",
        TargetText = "target-text",
        SpellingError = "spelling-error",
        GrammarError = "grammar-error",
        Highlight = "highlight",
        FirstLineInherited = "first-line-inherited",
        ScrollMarker = "scroll-marker",
        ScrollMarkerGroup = "scroll-marker-group",
        ScrollButton = "scroll-button",
        Scrollbar = "scrollbar",
        ScrollbarThumb = "scrollbar-thumb",
        ScrollbarButton = "scrollbar-button",
        ScrollbarTrack = "scrollbar-track",
        ScrollbarTrackPiece = "scrollbar-track-piece",
        ScrollbarCorner = "scrollbar-corner",
        Resizer = "resizer",
        InputListButton = "input-list-button",
        ViewTransition = "view-transition",
        ViewTransitionGroup = "view-transition-group",
        ViewTransitionImagePair = "view-transition-image-pair",
        ViewTransitionGroupChildren = "view-transition-group-children",
        ViewTransitionOld = "view-transition-old",
        ViewTransitionNew = "view-transition-new",
        Placeholder = "placeholder",
        FileSelectorButton = "file-selector-button",
        DetailsContent = "details-content",
        Picker = "picker",
        SelectListbox = "select-listbox",
        PermissionIcon = "permission-icon",
        OverscrollAreaParent = "overscroll-area-parent",
        OverscrollBackdrop = "overscroll-backdrop",
        Skeleton = "skeleton"
    }
    /**
     * Shadow root type.
     */
    const enum ShadowRootType {
        UserAgent = "user-agent",
        Open = "open",
        Closed = "closed"
    }
    /**
     * Document compatibility mode.
     */
    const enum CompatibilityMode {
        QuirksMode = "QuirksMode",
        LimitedQuirksMode = "LimitedQuirksMode",
        NoQuirksMode = "NoQuirksMode"
    }
    /**
     * ContainerSelector physical axes
     */
    const enum PhysicalAxes {
        Horizontal = "Horizontal",
        Vertical = "Vertical",
        Both = "Both"
    }
    /**
     * ContainerSelector logical axes
     */
    const enum LogicalAxes {
        Inline = "Inline",
        Block = "Block",
        Both = "Both"
    }
    /**
     * Physical scroll orientation
     */
    const enum ScrollOrientation {
        Horizontal = "horizontal",
        Vertical = "vertical"
    }
    /**
     * DOM interaction is implemented in terms of mirror objects that represent the actual DOM nodes.
     * DOMNode is a base node mirror type.
     */
    interface Node {
        /**
         * Node identifier that is passed into the rest of the DOM messages as the `nodeId`. Backend
         * will only push node with given `id` once. It is aware of all requested nodes and will only
         * fire DOM events for nodes known to the client.
         */
        nodeId: NodeId;
        /**
         * The id of the parent node if any.
         */
        parentId?: NodeId;
        /**
         * The BackendNodeId for this node.
         */
        backendNodeId: BackendNodeId;
        /**
         * `Node`'s nodeType.
         */
        nodeType: integer;
        /**
         * `Node`'s nodeName.
         */
        nodeName: string;
        /**
         * `Node`'s localName.
         */
        localName: string;
        /**
         * `Node`'s nodeValue.
         */
        nodeValue: string;
        /**
         * Child count for `Container` nodes.
         */
        childNodeCount?: integer;
        /**
         * Child nodes of this node when requested with children.
         */
        children?: Node[];
        /**
         * Attributes of the `Element` node in the form of flat array `[name1, value1, name2, value2]`.
         */
        attributes?: string[];
        /**
         * Document URL that `Document` or `FrameOwner` node points to.
         */
        documentURL?: string;
        /**
         * Base URL that `Document` or `FrameOwner` node uses for URL completion.
         */
        baseURL?: string;
        /**
         * `DocumentType`'s publicId.
         */
        publicId?: string;
        /**
         * `DocumentType`'s systemId.
         */
        systemId?: string;
        /**
         * `DocumentType`'s internalSubset.
         */
        internalSubset?: string;
        /**
         * `Document`'s XML version in case of XML documents.
         */
        xmlVersion?: string;
        /**
         * `Attr`'s name.
         */
        name?: string;
        /**
         * `Attr`'s value.
         */
        value?: string;
        /**
         * Pseudo element type for this node.
         */
        pseudoType?: PseudoType;
        /**
         * Pseudo element identifier for this node. Only present if there is a
         * valid pseudoType.
         */
        pseudoIdentifier?: string;
        /**
         * Shadow root type.
         */
        shadowRootType?: ShadowRootType;
        /**
         * Frame ID for frame owner elements.
         */
        frameId?: Page.FrameId;
        /**
         * Content document for frame owner elements.
         */
        contentDocument?: Node;
        /**
         * Shadow root list for given element host.
         */
        shadowRoots?: Node[];
        /**
         * Content document fragment for template elements.
         */
        templateContent?: Node;
        /**
         * Pseudo elements associated with this node.
         */
        pseudoElements?: Node[];
        /**
         * Deprecated, as the HTML Imports API has been removed (crbug.com/937746).
         * This property used to return the imported document for the HTMLImport links.
         * The property is always undefined now.
         * @deprecated
         */
        importedDocument?: Node;
        /**
         * Distributed nodes for given insertion point.
         */
        distributedNodes?: BackendNode[];
        /**
         * Whether the node is SVG.
         */
        isSVG?: boolean;
        compatibilityMode?: CompatibilityMode;
        assignedSlot?: BackendNode;
        isScrollable?: boolean;
        affectedByStartingStyles?: boolean;
        adoptedStyleSheets?: StyleSheetId[];
        adProvenance?: Network.AdProvenance;
    }
    /**
     * A structure to hold the top-level node of a detached tree and an array of its retained descendants.
     */
    interface DetachedElementInfo {
        treeNode: Node;
        retainedNodeIds: NodeId[];
    }
    /**
     * A structure holding an RGBA color.
     */
    interface RGBA {
        /**
         * The red component, in the [0-255] range.
         */
        r: integer;
        /**
         * The green component, in the [0-255] range.
         */
        g: integer;
        /**
         * The blue component, in the [0-255] range.
         */
        b: integer;
        /**
         * The alpha component, in the [0-1] range (default: 1).
         */
        a?: number;
    }
    /**
     * An array of quad vertices, x immediately followed by y for each point, points clock-wise.
     */
    type Quad = number[];
    /**
     * Box model.
     */
    interface BoxModel {
        /**
         * Content box
         */
        content: Quad;
        /**
         * Padding box
         */
        padding: Quad;
        /**
         * Border box
         */
        border: Quad;
        /**
         * Margin box
         */
        margin: Quad;
        /**
         * Node width
         */
        width: integer;
        /**
         * Node height
         */
        height: integer;
        /**
         * Shape outside coordinates
         */
        shapeOutside?: ShapeOutsideInfo;
    }
    /**
     * CSS Shape Outside details.
     */
    interface ShapeOutsideInfo {
        /**
         * Shape bounds
         */
        bounds: Quad;
        /**
         * Shape coordinate details
         */
        shape: any[];
        /**
         * Margin shape bounds
         */
        marginShape: any[];
    }
    /**
     * Rectangle.
     */
    interface Rect {
        /**
         * X coordinate
         */
        x: number;
        /**
         * Y coordinate
         */
        y: number;
        /**
         * Rectangle width
         */
        width: number;
        /**
         * Rectangle height
         */
        height: number;
    }
    interface CSSComputedStyleProperty {
        /**
         * Computed style property name.
         */
        name: string;
        /**
         * Computed style property value.
         */
        value: string;
    }
    interface CollectClassNamesFromSubtreeRequest {
        /**
         * Id of the node to collect class names.
         */
        nodeId: NodeId;
    }
    interface CollectClassNamesFromSubtreeResponse extends ProtocolResponseWithError {
        /**
         * Class name list.
         */
        classNames: string[];
    }
    interface CopyToRequest {
        /**
         * Id of the node to copy.
         */
        nodeId: NodeId;
        /**
         * Id of the element to drop the copy into.
         */
        targetNodeId: NodeId;
        /**
         * Drop the copy before this node (if absent, the copy becomes the last child of
         * `targetNodeId`).
         */
        insertBeforeNodeId?: NodeId;
    }
    interface CopyToResponse extends ProtocolResponseWithError {
        /**
         * Id of the node clone.
         */
        nodeId: NodeId;
    }
    interface DescribeNodeRequest {
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
        /**
         * The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the
         * entire subtree or provide an integer larger than 0.
         */
        depth?: integer;
        /**
         * Whether or not iframes and shadow roots should be traversed when returning the subtree
         * (default is false).
         */
        pierce?: boolean;
    }
    interface DescribeNodeResponse extends ProtocolResponseWithError {
        /**
         * Node description.
         */
        node: Node;
    }
    interface ScrollIntoViewIfNeededRequest {
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
        /**
         * The rect to be scrolled into view, relative to the node's border box, in CSS pixels.
         * When omitted, center of the node will be used, similar to Element.scrollIntoView.
         */
        rect?: Rect;
    }
    interface DiscardSearchResultsRequest {
        /**
         * Unique search session identifier.
         */
        searchId: string;
    }
    const enum EnableRequestIncludeWhitespace {
        None = "none",
        All = "all"
    }
    interface EnableRequest {
        /**
         * Whether to include whitespaces in the children array of returned Nodes.
         */
        includeWhitespace?: EnableRequestIncludeWhitespace;
    }
    interface FocusRequest {
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
    }
    interface GetAttributesRequest {
        /**
         * Id of the node to retrieve attributes for.
         */
        nodeId: NodeId;
    }
    interface GetAttributesResponse extends ProtocolResponseWithError {
        /**
         * An interleaved array of node attribute names and values.
         */
        attributes: string[];
    }
    interface GetBoxModelRequest {
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
    }
    interface GetBoxModelResponse extends ProtocolResponseWithError {
        /**
         * Box model for the node.
         */
        model: BoxModel;
    }
    interface GetContentQuadsRequest {
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
    }
    interface GetContentQuadsResponse extends ProtocolResponseWithError {
        /**
         * Quads that describe node layout relative to viewport.
         */
        quads: Quad[];
    }
    interface GetDocumentRequest {
        /**
         * The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the
         * entire subtree or provide an integer larger than 0.
         */
        depth?: integer;
        /**
         * Whether or not iframes and shadow roots should be traversed when returning the subtree
         * (default is false).
         */
        pierce?: boolean;
    }
    interface GetDocumentResponse extends ProtocolResponseWithError {
        /**
         * Resulting node.
         */
        root: Node;
    }
    interface GetFlattenedDocumentRequest {
        /**
         * The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the
         * entire subtree or provide an integer larger than 0.
         */
        depth?: integer;
        /**
         * Whether or not iframes and shadow roots should be traversed when returning the subtree
         * (default is false).
         */
        pierce?: boolean;
    }
    interface GetFlattenedDocumentResponse extends ProtocolResponseWithError {
        /**
         * Resulting node.
         */
        nodes: Node[];
    }
    interface GetNodesForSubtreeByStyleRequest {
        /**
         * Node ID pointing to the root of a subtree.
         */
        nodeId: NodeId;
        /**
         * The style to filter nodes by (includes nodes if any of properties matches).
         */
        computedStyles: CSSComputedStyleProperty[];
        /**
         * Whether or not iframes and shadow roots in the same target should be traversed when returning the
         * results (default is false).
         */
        pierce?: boolean;
    }
    interface GetNodesForSubtreeByStyleResponse extends ProtocolResponseWithError {
        /**
         * Resulting nodes.
         */
        nodeIds: NodeId[];
    }
    interface GetNodeForLocationRequest {
        /**
         * X coordinate.
         */
        x: integer;
        /**
         * Y coordinate.
         */
        y: integer;
        /**
         * False to skip to the nearest non-UA shadow root ancestor (default: false).
         */
        includeUserAgentShadowDOM?: boolean;
        /**
         * Whether to ignore pointer-events: none on elements and hit test them.
         */
        ignorePointerEventsNone?: boolean;
    }
    interface GetNodeForLocationResponse extends ProtocolResponseWithError {
        /**
         * Resulting node.
         */
        backendNodeId: BackendNodeId;
        /**
         * Frame this node belongs to.
         */
        frameId: Page.FrameId;
        /**
         * Id of the node at given coordinates, only when enabled and requested document.
         */
        nodeId?: NodeId;
    }
    interface GetOuterHTMLRequest {
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
        /**
         * Include all shadow roots. Equals to false if not specified.
         */
        includeShadowDOM?: boolean;
    }
    interface GetOuterHTMLResponse extends ProtocolResponseWithError {
        /**
         * Outer HTML markup.
         */
        outerHTML: string;
    }
    interface GetRelayoutBoundaryRequest {
        /**
         * Id of the node.
         */
        nodeId: NodeId;
    }
    interface GetRelayoutBoundaryResponse extends ProtocolResponseWithError {
        /**
         * Relayout boundary node id for the given node.
         */
        nodeId: NodeId;
    }
    interface GetSearchResultsRequest {
        /**
         * Unique search session identifier.
         */
        searchId: string;
        /**
         * Start index of the search result to be returned.
         */
        fromIndex: integer;
        /**
         * End index of the search result to be returned.
         */
        toIndex: integer;
    }
    interface GetSearchResultsResponse extends ProtocolResponseWithError {
        /**
         * Ids of the search result nodes.
         */
        nodeIds: NodeId[];
    }
    interface MoveToRequest {
        /**
         * Id of the node to move.
         */
        nodeId: NodeId;
        /**
         * Id of the element to drop the moved node into.
         */
        targetNodeId: NodeId;
        /**
         * Drop node before this one (if absent, the moved node becomes the last child of
         * `targetNodeId`).
         */
        insertBeforeNodeId?: NodeId;
    }
    interface MoveToResponse extends ProtocolResponseWithError {
        /**
         * New id of the moved node.
         */
        nodeId: NodeId;
    }
    interface PerformSearchRequest {
        /**
         * Plain text or query selector or XPath search query.
         */
        query: string;
        /**
         * True to search in user agent shadow DOM.
         */
        includeUserAgentShadowDOM?: boolean;
    }
    interface PerformSearchResponse extends ProtocolResponseWithError {
        /**
         * Unique search session identifier.
         */
        searchId: string;
        /**
         * Number of search results.
         */
        resultCount: integer;
    }
    interface PushNodeByPathToFrontendRequest {
        /**
         * Path to node in the proprietary format.
         */
        path: string;
    }
    interface PushNodeByPathToFrontendResponse extends ProtocolResponseWithError {
        /**
         * Id of the node for given path.
         */
        nodeId: NodeId;
    }
    interface PushNodesByBackendIdsToFrontendRequest {
        /**
         * The array of backend node ids.
         */
        backendNodeIds: BackendNodeId[];
    }
    interface PushNodesByBackendIdsToFrontendResponse extends ProtocolResponseWithError {
        /**
         * The array of ids of pushed nodes that correspond to the backend ids specified in
         * backendNodeIds.
         */
        nodeIds: NodeId[];
    }
    interface QuerySelectorRequest {
        /**
         * Id of the node to query upon.
         */
        nodeId: NodeId;
        /**
         * Selector string.
         */
        selector: string;
    }
    interface QuerySelectorResponse extends ProtocolResponseWithError {
        /**
         * Query selector result.
         */
        nodeId: NodeId;
    }
    interface QuerySelectorAllRequest {
        /**
         * Id of the node to query upon.
         */
        nodeId: NodeId;
        /**
         * Selector string.
         */
        selector: string;
    }
    interface QuerySelectorAllResponse extends ProtocolResponseWithError {
        /**
         * Query selector result.
         */
        nodeIds: NodeId[];
    }
    interface GetTopLayerElementsResponse extends ProtocolResponseWithError {
        /**
         * NodeIds of top layer elements
         */
        nodeIds: NodeId[];
    }
    const enum GetElementByRelationRequestRelation {
        PopoverTarget = "PopoverTarget",
        InterestTarget = "InterestTarget",
        CommandFor = "CommandFor"
    }
    interface GetElementByRelationRequest {
        /**
         * Id of the node from which to query the relation.
         */
        nodeId: NodeId;
        /**
         * Type of relation to get.
         */
        relation: GetElementByRelationRequestRelation;
    }
    interface GetElementByRelationResponse extends ProtocolResponseWithError {
        /**
         * NodeId of the element matching the queried relation.
         */
        nodeId: NodeId;
    }
    interface RemoveAttributeRequest {
        /**
         * Id of the element to remove attribute from.
         */
        nodeId: NodeId;
        /**
         * Name of the attribute to remove.
         */
        name: string;
    }
    interface RemoveNodeRequest {
        /**
         * Id of the node to remove.
         */
        nodeId: NodeId;
    }
    interface RequestChildNodesRequest {
        /**
         * Id of the node to get children for.
         */
        nodeId: NodeId;
        /**
         * The maximum depth at which children should be retrieved, defaults to 1. Use -1 for the
         * entire subtree or provide an integer larger than 0.
         */
        depth?: integer;
        /**
         * Whether or not iframes and shadow roots should be traversed when returning the sub-tree
         * (default is false).
         */
        pierce?: boolean;
    }
    interface RequestNodeRequest {
        /**
         * JavaScript object id to convert into node.
         */
        objectId: Runtime.RemoteObjectId;
    }
    interface RequestNodeResponse extends ProtocolResponseWithError {
        /**
         * Node id for given object.
         */
        nodeId: NodeId;
    }
    interface ResolveNodeRequest {
        /**
         * Id of the node to resolve.
         */
        nodeId?: NodeId;
        /**
         * Backend identifier of the node to resolve.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * Symbolic group name that can be used to release multiple objects.
         */
        objectGroup?: string;
        /**
         * Execution context in which to resolve the node.
         */
        executionContextId?: Runtime.ExecutionContextId;
    }
    interface ResolveNodeResponse extends ProtocolResponseWithError {
        /**
         * JavaScript object wrapper for given node.
         */
        object: Runtime.RemoteObject;
    }
    interface SetAttributeValueRequest {
        /**
         * Id of the element to set attribute for.
         */
        nodeId: NodeId;
        /**
         * Attribute name.
         */
        name: string;
        /**
         * Attribute value.
         */
        value: string;
    }
    interface SetAttributesAsTextRequest {
        /**
         * Id of the element to set attributes for.
         */
        nodeId: NodeId;
        /**
         * Text with a number of attributes. Will parse this text using HTML parser.
         */
        text: string;
        /**
         * Attribute name to replace with new attributes derived from text in case text parsed
         * successfully.
         */
        name?: string;
    }
    interface SetFileInputFilesRequest {
        /**
         * Array of file paths to set.
         */
        files: string[];
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
    }
    interface SetNodeStackTracesEnabledRequest {
        /**
         * Enable or disable.
         */
        enable: boolean;
    }
    interface GetNodeStackTracesRequest {
        /**
         * Id of the node to get stack traces for.
         */
        nodeId: NodeId;
    }
    interface GetNodeStackTracesResponse extends ProtocolResponseWithError {
        /**
         * Creation stack trace, if available.
         */
        creation?: Runtime.StackTrace;
    }
    interface GetFileInfoRequest {
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId: Runtime.RemoteObjectId;
    }
    interface GetFileInfoResponse extends ProtocolResponseWithError {
        path: string;
    }
    interface GetDetachedDomNodesResponse extends ProtocolResponseWithError {
        /**
         * The list of detached nodes
         */
        detachedNodes: DetachedElementInfo[];
    }
    interface SetInspectedNodeRequest {
        /**
         * DOM node id to be accessible by means of $x command line API.
         */
        nodeId: NodeId;
    }
    interface SetNodeNameRequest {
        /**
         * Id of the node to set name for.
         */
        nodeId: NodeId;
        /**
         * New node's name.
         */
        name: string;
    }
    interface SetNodeNameResponse extends ProtocolResponseWithError {
        /**
         * New node's id.
         */
        nodeId: NodeId;
    }
    interface SetNodeValueRequest {
        /**
         * Id of the node to set value for.
         */
        nodeId: NodeId;
        /**
         * New node's value.
         */
        value: string;
    }
    interface SetOuterHTMLRequest {
        /**
         * Id of the node to set markup for.
         */
        nodeId: NodeId;
        /**
         * Outer HTML markup to set.
         */
        outerHTML: string;
    }
    interface GetFrameOwnerRequest {
        frameId: Page.FrameId;
    }
    interface GetFrameOwnerResponse extends ProtocolResponseWithError {
        /**
         * Resulting node.
         */
        backendNodeId: BackendNodeId;
        /**
         * Id of the node at given coordinates, only when enabled and requested document.
         */
        nodeId?: NodeId;
    }
    interface GetContainerForNodeRequest {
        nodeId: NodeId;
        containerName?: string;
        physicalAxes?: PhysicalAxes;
        logicalAxes?: LogicalAxes;
        queriesScrollState?: boolean;
        queriesAnchored?: boolean;
    }
    interface GetContainerForNodeResponse extends ProtocolResponseWithError {
        /**
         * The container node for the given node, or null if not found.
         */
        nodeId?: NodeId;
    }
    interface GetQueryingDescendantsForContainerRequest {
        /**
         * Id of the container node to find querying descendants from.
         */
        nodeId: NodeId;
    }
    interface GetQueryingDescendantsForContainerResponse extends ProtocolResponseWithError {
        /**
         * Descendant nodes with container queries against the given container.
         */
        nodeIds: NodeId[];
    }
    interface GetAnchorElementRequest {
        /**
         * Id of the positioned element from which to find the anchor.
         */
        nodeId: NodeId;
        /**
         * An optional anchor specifier, as defined in
         * https://www.w3.org/TR/css-anchor-position-1/#anchor-specifier.
         * If not provided, it will return the implicit anchor element for
         * the given positioned element.
         */
        anchorSpecifier?: string;
    }
    interface GetAnchorElementResponse extends ProtocolResponseWithError {
        /**
         * The anchor element of the given anchor query.
         */
        nodeId: NodeId;
    }
    interface ForceShowPopoverRequest {
        /**
         * Id of the popover HTMLElement
         */
        nodeId: NodeId;
        /**
         * If true, opens the popover and keeps it open. If false, closes the
         * popover if it was previously force-opened.
         */
        enable: boolean;
        /**
         * Optional ID of the element invoking this popover, used to establish the implicit anchor.
         * If not provided, it will fall back to the first invoker in the document, preferring
         * elements with a popovertarget attribute over those with a commandfor attribute. Note that
         * if there are multiple invokers, this is just an estimate.
         */
        invokerNodeId?: BackendNodeId;
    }
    interface ForceShowPopoverResponse extends ProtocolResponseWithError {
        /**
         * List of popovers that were closed in order to respect popover stacking order.
         */
        nodeIds: NodeId[];
    }
    interface GetImplicitAnchorCandidatesRequest {
        /**
         * Id of the popover HTMLElement.
         */
        nodeId: NodeId;
    }
    interface GetImplicitAnchorCandidatesResponse extends ProtocolResponseWithError {
        /**
         * Candidate elements that can invoke this popover.
         */
        backendNodeIds: BackendNodeId[];
    }
    interface ForceShowInterestRequest {
        /**
         * Id of the interest invoker HTMLElement.
         */
        nodeId: NodeId;
        /**
         * If true, opens and holds interest. If false, releases forced interest.
         */
        enable: boolean;
    }
    const enum SetTextMarkerRequestType {
        Spelling = "spelling",
        Grammar = "grammar"
    }
    interface SetTextMarkerRequest {
        /**
         * Identifier of the node.
         */
        nodeId?: NodeId;
        /**
         * Identifier of the backend node.
         */
        backendNodeId?: BackendNodeId;
        /**
         * JavaScript object id of the node wrapper.
         */
        objectId?: Runtime.RemoteObjectId;
        /**
         * The type of marker to set on the given range of text.
         */
        type: SetTextMarkerRequestType;
        /**
         * Start offset into the element's rendered text in UTF-16 code units.
         * For a text control, an offset into the control's value.
         * Offsets count text in DOM order and do not enter shadow trees.
         * To mark text inside a shadow tree, pass the element inside the shadow tree.
         */
        start: integer;
        /**
         * End offset (exclusive) in the same units and space as start.
         */
        end: integer;
    }
    /**
     * Fired when `Element`'s attribute is modified.
     */
    interface AttributeModifiedEvent {
        /**
         * Id of the node that has changed.
         */
        nodeId: NodeId;
        /**
         * Attribute name.
         */
        name: string;
        /**
         * Attribute value.
         */
        value: string;
    }
    /**
     * Fired when `Element`'s adoptedStyleSheets are modified.
     */
    interface AdoptedStyleSheetsModifiedEvent {
        /**
         * Id of the node that has changed.
         */
        nodeId: NodeId;
        /**
         * New adoptedStyleSheets array.
         */
        adoptedStyleSheets: StyleSheetId[];
    }
    /**
     * Fired when `Element`'s attribute is removed.
     */
    interface AttributeRemovedEvent {
        /**
         * Id of the node that has changed.
         */
        nodeId: NodeId;
        /**
         * A ttribute name.
         */
        name: string;
    }
    /**
     * Mirrors `DOMCharacterDataModified` event.
     */
    interface CharacterDataModifiedEvent {
        /**
         * Id of the node that has changed.
         */
        nodeId: NodeId;
        /**
         * New text value.
         */
        characterData: string;
    }
    /**
     * Fired when `Container`'s child node count has changed.
     */
    interface ChildNodeCountUpdatedEvent {
        /**
         * Id of the node that has changed.
         */
        nodeId: NodeId;
        /**
         * New node count.
         */
        childNodeCount: integer;
    }
    /**
     * Mirrors `DOMNodeInserted` event.
     */
    interface ChildNodeInsertedEvent {
        /**
         * Id of the node that has changed.
         */
        parentNodeId: NodeId;
        /**
         * Id of the previous sibling.
         */
        previousNodeId: NodeId;
        /**
         * Inserted node data.
         */
        node: Node;
    }
    /**
     * Mirrors `DOMNodeRemoved` event.
     */
    interface ChildNodeRemovedEvent {
        /**
         * Parent id.
         */
        parentNodeId: NodeId;
        /**
         * Id of the node that has been removed.
         */
        nodeId: NodeId;
    }
    /**
     * Called when distribution is changed.
     */
    interface DistributedNodesUpdatedEvent {
        /**
         * Insertion point where distributed nodes were updated.
         */
        insertionPointId: NodeId;
        /**
         * Distributed nodes for given insertion point.
         */
        distributedNodes: BackendNode[];
    }
    /**
     * Fired when `Element`'s inline style is modified via a CSS property modification.
     */
    interface InlineStyleInvalidatedEvent {
        /**
         * Ids of the nodes for which the inline styles have been invalidated.
         */
        nodeIds: NodeId[];
    }
    /**
     * Called when a pseudo element is added to an element.
     */
    interface PseudoElementAddedEvent {
        /**
         * Pseudo element's parent element id.
         */
        parentId: NodeId;
        /**
         * The added pseudo element.
         */
        pseudoElement: Node;
    }
    /**
     * Fired when a node's scrollability state changes.
     */
    interface ScrollableFlagUpdatedEvent {
        /**
         * The id of the node.
         */
        nodeId: DOM.NodeId;
        /**
         * If the node is scrollable.
         */
        isScrollable: boolean;
    }
    /**
     * Fired when a node's ad related state changes.
     */
    interface AdRelatedStateUpdatedEvent {
        /**
         * The id of the node.
         */
        nodeId: DOM.NodeId;
        /**
         * The provenance of the ad related node, if it is ad related.
         */
        adProvenance?: Network.AdProvenance;
    }
    /**
     * Fired when a node's starting styles changes.
     */
    interface AffectedByStartingStylesFlagUpdatedEvent {
        /**
         * The id of the node.
         */
        nodeId: DOM.NodeId;
        /**
         * If the node has starting styles.
         */
        affectedByStartingStyles: boolean;
    }
    /**
     * Called when a pseudo element is removed from an element.
     */
    interface PseudoElementRemovedEvent {
        /**
         * Pseudo element's parent element id.
         */
        parentId: NodeId;
        /**
         * The removed pseudo element id.
         */
        pseudoElementId: NodeId;
    }
    /**
     * Fired when backend wants to provide client with the missing DOM structure. This happens upon
     * most of the calls requesting node ids.
     */
    interface SetChildNodesEvent {
        /**
         * Parent node id to populate with children.
         */
        parentId: NodeId;
        /**
         * Child nodes array.
         */
        nodes: Node[];
    }
    /**
     * Called when shadow root is popped from the element.
     */
    interface ShadowRootPoppedEvent {
        /**
         * Host element id.
         */
        hostId: NodeId;
        /**
         * Shadow root id.
         */
        rootId: NodeId;
    }
    /**
     * Called when shadow root is pushed into the element.
     */
    interface ShadowRootPushedEvent {
        /**
         * Host element id.
         */
        hostId: NodeId;
        /**
         * Shadow root.
         */
        root: Node;
    }
}
/**
 * DOM debugging allows setting breakpoints on particular DOM operations and events. JavaScript
 * execution will stop on these operations as if there was a regular breakpoint set.
 */
export declare namespace DOMDebugger {
    /**
     * DOM breakpoint type.
     */
    const enum DOMBreakpointType {
        SubtreeModified = "subtree-modified",
        AttributeModified = "attribute-modified",
        NodeRemoved = "node-removed"
    }
    /**
     * CSP Violation type.
     */
    const enum CSPViolationType {
        TrustedtypeSinkViolation = "trustedtype-sink-violation",
        TrustedtypePolicyViolation = "trustedtype-policy-violation"
    }
    /**
     * Object event listener.
     */
    interface EventListener {
        /**
         * `EventListener`'s type.
         */
        type: string;
        /**
         * `EventListener`'s useCapture.
         */
        useCapture: boolean;
        /**
         * `EventListener`'s passive flag.
         */
        passive: boolean;
        /**
         * `EventListener`'s once flag.
         */
        once: boolean;
        /**
         * Script id of the handler code.
         */
        scriptId: Runtime.ScriptId;
        /**
         * Line number in the script (0-based).
         */
        lineNumber: integer;
        /**
         * Column number in the script (0-based).
         */
        columnNumber: integer;
        /**
         * Event handler function value.
         */
        handler?: Runtime.RemoteObject;
        /**
         * Event original handler function value.
         */
        originalHandler?: Runtime.RemoteObject;
        /**
         * Node the listener is added to (if any).
         */
        backendNodeId?: DOM.BackendNodeId;
    }
    interface GetEventListenersRequest {
        /**
         * Identifier of the object to return listeners for.
         */
        objectId: Runtime.RemoteObjectId;
        /**
         * The maximum depth at which Node children should be retrieved, defaults to 1. Use -1 for the
         * entire subtree or provide an integer larger than 0.
         */
        depth?: integer;
        /**
         * Whether or not iframes and shadow roots should be traversed when returning the subtree
         * (default is false). Reports listeners for all contexts if pierce is enabled.
         */
        pierce?: boolean;
    }
    interface GetEventListenersResponse extends ProtocolResponseWithError {
        /**
         * Array of relevant listeners.
         */
        listeners: EventListener[];
    }
    interface RemoveDOMBreakpointRequest {
        /**
         * Identifier of the node to remove breakpoint from.
         */
        nodeId: DOM.NodeId;
        /**
         * Type of the breakpoint to remove.
         */
        type: DOMBreakpointType;
    }
    interface RemoveEventListenerBreakpointRequest {
        /**
         * Event name.
         */
        eventName: string;
        /**
         * EventTarget interface name.
         */
        targetName?: string;
    }
    interface RemoveInstrumentationBreakpointRequest {
        /**
         * Instrumentation name to stop on.
         */
        eventName: string;
    }
    interface RemoveXHRBreakpointRequest {
        /**
         * Resource URL substring.
         */
        url: string;
    }
    interface SetBreakOnCSPViolationRequest {
        /**
         * CSP Violations to stop upon.
         */
        violationTypes: CSPViolationType[];
    }
    interface SetDOMBreakpointRequest {
        /**
         * Identifier of the node to set breakpoint on.
         */
        nodeId: DOM.NodeId;
        /**
         * Type of the operation to stop upon.
         */
        type: DOMBreakpointType;
    }
    interface SetEventListenerBreakpointRequest {
        /**
         * DOM Event name to stop on (any DOM event will do).
         */
        eventName: string;
        /**
         * EventTarget interface name to stop on. If equal to `"*"` or not provided, will stop on any
         * EventTarget.
         */
        targetName?: string;
    }
    interface SetInstrumentationBreakpointRequest {
        /**
         * Instrumentation name to stop on.
         */
        eventName: string;
    }
    interface SetXHRBreakpointRequest {
        /**
         * Resource URL substring. All XHRs having this substring in the URL will get stopped upon.
         */
        url: string;
    }
}
/**
 * This domain facilitates obtaining document snapshots with DOM, layout, and style information.
 */
export declare namespace DOMSnapshot {
    /**
     * A Node in the DOM tree.
     */
    interface DOMNode {
        /**
         * `Node`'s nodeType.
         */
        nodeType: integer;
        /**
         * `Node`'s nodeName.
         */
        nodeName: string;
        /**
         * `Node`'s nodeValue.
         */
        nodeValue: string;
        /**
         * Only set for textarea elements, contains the text value.
         */
        textValue?: string;
        /**
         * Only set for input elements, contains the input's associated text value.
         */
        inputValue?: string;
        /**
         * Only set for radio and checkbox input elements, indicates if the element has been checked
         */
        inputChecked?: boolean;
        /**
         * Only set for option elements, indicates if the element has been selected
         */
        optionSelected?: boolean;
        /**
         * `Node`'s id, corresponds to DOM.Node.backendNodeId.
         */
        backendNodeId: DOM.BackendNodeId;
        /**
         * The indexes of the node's child nodes in the `domNodes` array returned by `getSnapshot`, if
         * any.
         */
        childNodeIndexes?: integer[];
        /**
         * Attributes of an `Element` node.
         */
        attributes?: NameValue[];
        /**
         * Indexes of pseudo elements associated with this node in the `domNodes` array returned by
         * `getSnapshot`, if any.
         */
        pseudoElementIndexes?: integer[];
        /**
         * The index of the node's related layout tree node in the `layoutTreeNodes` array returned by
         * `getSnapshot`, if any.
         */
        layoutNodeIndex?: integer;
        /**
         * Document URL that `Document` or `FrameOwner` node points to.
         */
        documentURL?: string;
        /**
         * Base URL that `Document` or `FrameOwner` node uses for URL completion.
         */
        baseURL?: string;
        /**
         * Only set for documents, contains the document's content language.
         */
        contentLanguage?: string;
        /**
         * Only set for documents, contains the document's character set encoding.
         */
        documentEncoding?: string;
        /**
         * `DocumentType` node's publicId.
         */
        publicId?: string;
        /**
         * `DocumentType` node's systemId.
         */
        systemId?: string;
        /**
         * Frame ID for frame owner elements and also for the document node.
         */
        frameId?: Page.FrameId;
        /**
         * The index of a frame owner element's content document in the `domNodes` array returned by
         * `getSnapshot`, if any.
         */
        contentDocumentIndex?: integer;
        /**
         * Type of a pseudo element node.
         */
        pseudoType?: DOM.PseudoType;
        /**
         * Shadow root type.
         */
        shadowRootType?: DOM.ShadowRootType;
        /**
         * Whether this DOM node responds to mouse clicks. This includes nodes that have had click
         * event listeners attached via JavaScript as well as anchor tags that naturally navigate when
         * clicked.
         */
        isClickable?: boolean;
        /**
         * Details of the node's event listeners, if any.
         */
        eventListeners?: DOMDebugger.EventListener[];
        /**
         * The selected url for nodes with a srcset attribute.
         */
        currentSourceURL?: string;
        /**
         * The url of the script (if any) that generates this node.
         */
        originURL?: string;
        /**
         * Scroll offsets, set when this node is a Document.
         */
        scrollOffsetX?: number;
        scrollOffsetY?: number;
    }
    /**
     * Details of post layout rendered text positions. The exact layout should not be regarded as
     * stable and may change between versions.
     */
    interface InlineTextBox {
        /**
         * The bounding box in document coordinates. Note that scroll offset of the document is ignored.
         */
        boundingBox: DOM.Rect;
        /**
         * The starting index in characters, for this post layout textbox substring. Characters that
         * would be represented as a surrogate pair in UTF-16 have length 2.
         */
        startCharacterIndex: integer;
        /**
         * The number of characters in this post layout textbox substring. Characters that would be
         * represented as a surrogate pair in UTF-16 have length 2.
         */
        numCharacters: integer;
    }
    /**
     * Details of an element in the DOM tree with a LayoutObject.
     */
    interface LayoutTreeNode {
        /**
         * The index of the related DOM node in the `domNodes` array returned by `getSnapshot`.
         */
        domNodeIndex: integer;
        /**
         * The bounding box in document coordinates. Note that scroll offset of the document is ignored.
         */
        boundingBox: DOM.Rect;
        /**
         * Contents of the LayoutText, if any.
         */
        layoutText?: string;
        /**
         * The post-layout inline text nodes, if any.
         */
        inlineTextNodes?: InlineTextBox[];
        /**
         * Index into the `computedStyles` array returned by `getSnapshot`.
         */
        styleIndex?: integer;
        /**
         * Global paint order index, which is determined by the stacking order of the nodes. Nodes
         * that are painted together will have the same index. Only provided if includePaintOrder in
         * getSnapshot was true.
         */
        paintOrder?: integer;
        /**
         * Set to true to indicate the element begins a new stacking context.
         */
        isStackingContext?: boolean;
    }
    /**
     * A subset of the full ComputedStyle as defined by the request whitelist.
     */
    interface ComputedStyle {
        /**
         * Name/value pairs of computed style properties.
         */
        properties: NameValue[];
    }
    /**
     * A name/value pair.
     */
    interface NameValue {
        /**
         * Attribute/property name.
         */
        name: string;
        /**
         * Attribute/property value.
         */
        value: string;
    }
    /**
     * Index of the string in the strings table.
     */
    type StringIndex = integer;
    /**
     * Index of the string in the strings table.
     */
    type ArrayOfStrings = StringIndex[];
    /**
     * Data that is only present on rare nodes.
     */
    interface RareStringData {
        index: integer[];
        value: StringIndex[];
    }
    interface RareBooleanData {
        index: integer[];
    }
    interface RareIntegerData {
        index: integer[];
        value: integer[];
    }
    type Rectangle = number[];
    /**
     * Document snapshot.
     */
    interface DocumentSnapshot {
        /**
         * Document URL that `Document` or `FrameOwner` node points to.
         */
        documentURL: StringIndex;
        /**
         * Document title.
         */
        title: StringIndex;
        /**
         * Base URL that `Document` or `FrameOwner` node uses for URL completion.
         */
        baseURL: StringIndex;
        /**
         * Contains the document's content language.
         */
        contentLanguage: StringIndex;
        /**
         * Contains the document's character set encoding.
         */
        encodingName: StringIndex;
        /**
         * `DocumentType` node's publicId.
         */
        publicId: StringIndex;
        /**
         * `DocumentType` node's systemId.
         */
        systemId: StringIndex;
        /**
         * Frame ID for frame owner elements and also for the document node.
         */
        frameId: StringIndex;
        /**
         * A table with dom nodes.
         */
        nodes: NodeTreeSnapshot;
        /**
         * The nodes in the layout tree.
         */
        layout: LayoutTreeSnapshot;
        /**
         * The post-layout inline text nodes.
         */
        textBoxes: TextBoxSnapshot;
        /**
         * Horizontal scroll offset.
         */
        scrollOffsetX?: number;
        /**
         * Vertical scroll offset.
         */
        scrollOffsetY?: number;
        /**
         * Document content width.
         */
        contentWidth?: number;
        /**
         * Document content height.
         */
        contentHeight?: number;
    }
    /**
     * Table containing nodes.
     */
    interface NodeTreeSnapshot {
        /**
         * Parent node index.
         */
        parentIndex?: integer[];
        /**
         * `Node`'s nodeType.
         */
        nodeType?: integer[];
        /**
         * Type of the shadow root the `Node` is in. String values are equal to the `ShadowRootType` enum.
         */
        shadowRootType?: RareStringData;
        /**
         * `Node`'s nodeName.
         */
        nodeName?: StringIndex[];
        /**
         * `Node`'s nodeValue.
         */
        nodeValue?: StringIndex[];
        /**
         * `Node`'s id, corresponds to DOM.Node.backendNodeId.
         */
        backendNodeId?: DOM.BackendNodeId[];
        /**
         * Attributes of an `Element` node. Flatten name, value pairs.
         */
        attributes?: ArrayOfStrings[];
        /**
         * Only set for textarea elements, contains the text value.
         */
        textValue?: RareStringData;
        /**
         * Only set for input elements, contains the input's associated text value.
         */
        inputValue?: RareStringData;
        /**
         * Only set for radio and checkbox input elements, indicates if the element has been checked
         */
        inputChecked?: RareBooleanData;
        /**
         * Only set for option elements, indicates if the element has been selected
         */
        optionSelected?: RareBooleanData;
        /**
         * The index of the document in the list of the snapshot documents.
         */
        contentDocumentIndex?: RareIntegerData;
        /**
         * Type of a pseudo element node.
         */
        pseudoType?: RareStringData;
        /**
         * Pseudo element identifier for this node. Only present if there is a
         * valid pseudoType.
         */
        pseudoIdentifier?: RareStringData;
        /**
         * Whether this DOM node responds to mouse clicks. This includes nodes that have had click
         * event listeners attached via JavaScript as well as anchor tags that naturally navigate when
         * clicked.
         */
        isClickable?: RareBooleanData;
        /**
         * The selected url for nodes with a srcset attribute.
         */
        currentSourceURL?: RareStringData;
        /**
         * The url of the script (if any) that generates this node.
         */
        originURL?: RareStringData;
    }
    /**
     * Table of details of an element in the DOM tree with a LayoutObject.
     */
    interface LayoutTreeSnapshot {
        /**
         * Index of the corresponding node in the `NodeTreeSnapshot` array returned by `captureSnapshot`.
         */
        nodeIndex: integer[];
        /**
         * Array of indexes specifying computed style strings, filtered according to the `computedStyles` parameter passed to `captureSnapshot`.
         */
        styles: ArrayOfStrings[];
        /**
         * The absolute position bounding box.
         */
        bounds: Rectangle[];
        /**
         * Contents of the LayoutText, if any.
         */
        text: StringIndex[];
        /**
         * Stacking context information.
         */
        stackingContexts: RareBooleanData;
        /**
         * Global paint order index, which is determined by the stacking order of the nodes. Nodes
         * that are painted together will have the same index. Only provided if includePaintOrder in
         * captureSnapshot was true.
         */
        paintOrders?: integer[];
        /**
         * The offset rect of nodes. Only available when includeDOMRects is set to true
         */
        offsetRects?: Rectangle[];
        /**
         * The scroll rect of nodes. Only available when includeDOMRects is set to true
         */
        scrollRects?: Rectangle[];
        /**
         * The client rect of nodes. Only available when includeDOMRects is set to true
         */
        clientRects?: Rectangle[];
        /**
         * The list of background colors that are blended with colors of overlapping elements.
         */
        blendedBackgroundColors?: StringIndex[];
        /**
         * The list of computed text opacities.
         */
        textColorOpacities?: number[];
    }
    /**
     * Table of details of the post layout rendered text positions. The exact layout should not be regarded as
     * stable and may change between versions.
     */
    interface TextBoxSnapshot {
        /**
         * Index of the layout tree node that owns this box collection.
         */
        layoutIndex: integer[];
        /**
         * The absolute position bounding box.
         */
        bounds: Rectangle[];
        /**
         * The starting index in characters, for this post layout textbox substring. Characters that
         * would be represented as a surrogate pair in UTF-16 have length 2.
         */
        start: integer[];
        /**
         * The number of characters in this post layout textbox substring. Characters that would be
         * represented as a surrogate pair in UTF-16 have length 2.
         */
        length: integer[];
    }
    interface GetSnapshotRequest {
        /**
         * Whitelist of computed styles to return.
         */
        computedStyleWhitelist: string[];
        /**
         * Whether or not to retrieve details of DOM listeners (default false).
         */
        includeEventListeners?: boolean;
        /**
         * Whether to determine and include the paint order index of LayoutTreeNodes (default false).
         */
        includePaintOrder?: boolean;
        /**
         * Whether to include UA shadow tree in the snapshot (default false).
         */
        includeUserAgentShadowTree?: boolean;
    }
    interface GetSnapshotResponse extends ProtocolResponseWithError {
        /**
         * The nodes in the DOM tree. The DOMNode at index 0 corresponds to the root document.
         */
        domNodes: DOMNode[];
        /**
         * The nodes in the layout tree.
         */
        layoutTreeNodes: LayoutTreeNode[];
        /**
         * Whitelisted ComputedStyle properties for each node in the layout tree.
         */
        computedStyles: ComputedStyle[];
    }
    interface CaptureSnapshotRequest {
        /**
         * Whitelist of computed styles to return.
         */
        computedStyles: string[];
        /**
         * Whether to include layout object paint orders into the snapshot.
         */
        includePaintOrder?: boolean;
        /**
         * Whether to include DOM rectangles (offsetRects, clientRects, scrollRects) into the snapshot
         */
        includeDOMRects?: boolean;
        /**
         * Whether to include blended background colors in the snapshot (default: false).
         * Blended background color is achieved by blending background colors of all elements
         * that overlap with the current element.
         */
        includeBlendedBackgroundColors?: boolean;
        /**
         * Whether to include text color opacity in the snapshot (default: false).
         * An element might have the opacity property set that affects the text color of the element.
         * The final text color opacity is computed based on the opacity of all overlapping elements.
         */
        includeTextColorOpacities?: boolean;
    }
    interface CaptureSnapshotResponse extends ProtocolResponseWithError {
        /**
         * The nodes in the DOM tree. The DOMNode at index 0 corresponds to the root document.
         */
        documents: DocumentSnapshot[];
        /**
         * Shared string table that all string properties refer to with indexes.
         */
        strings: string[];
    }
}
/**
 * Query and modify DOM storage.
 */
export declare namespace DOMStorage {
    type SerializedStorageKey = string;
    /**
     * DOM Storage identifier.
     */
    interface StorageId {
        /**
         * Security origin for the storage.
         */
        securityOrigin?: string;
        /**
         * Represents a key by which DOM Storage keys its CachedStorageAreas
         */
        storageKey?: SerializedStorageKey;
        /**
         * Whether the storage is local storage (not session storage).
         */
        isLocalStorage: boolean;
    }
    /**
     * DOM Storage item.
     */
    type Item = string[];
    interface ClearRequest {
        storageId: StorageId;
    }
    interface GetDOMStorageItemsRequest {
        storageId: StorageId;
    }
    interface GetDOMStorageItemsResponse extends ProtocolResponseWithError {
        entries: Item[];
    }
    interface RemoveDOMStorageItemRequest {
        storageId: StorageId;
        key: string;
    }
    interface SetDOMStorageItemRequest {
        storageId: StorageId;
        key: string;
        value: string;
    }
    interface DomStorageItemAddedEvent {
        storageId: StorageId;
        key: string;
        newValue: string;
    }
    interface DomStorageItemRemovedEvent {
        storageId: StorageId;
        key: string;
    }
    interface DomStorageItemUpdatedEvent {
        storageId: StorageId;
        key: string;
        oldValue: string;
        newValue: string;
    }
    interface DomStorageItemsClearedEvent {
        storageId: StorageId;
    }
}
export declare namespace DeviceAccess {
    /**
     * Device request id.
     */
    type RequestId = OpaqueIdentifier<string, 'Protocol.DeviceAccess.RequestId'>;
    /**
     * A device id.
     */
    type DeviceId = OpaqueIdentifier<string, 'Protocol.DeviceAccess.DeviceId'>;
    /**
     * Device information displayed in a user prompt to select a device.
     */
    interface PromptDevice {
        id: DeviceId;
        /**
         * Display name as it appears in a device request user prompt.
         */
        name: string;
    }
    interface SelectPromptRequest {
        id: RequestId;
        deviceId: DeviceId;
    }
    interface CancelPromptRequest {
        id: RequestId;
    }
    /**
     * A device request opened a user prompt to select a device. Respond with the
     * selectPrompt or cancelPrompt command.
     */
    interface DeviceRequestPromptedEvent {
        id: RequestId;
        devices: PromptDevice[];
    }
}
export declare namespace DeviceOrientation {
    interface SetDeviceOrientationOverrideRequest {
        /**
         * Mock alpha
         */
        alpha: number;
        /**
         * Mock beta
         */
        beta: number;
        /**
         * Mock gamma
         */
        gamma: number;
    }
}
/**
 * This domain allows interacting with the Digital Credentials API for automation.
 */
export declare namespace DigitalCredentials {
    /**
     * The type of virtual wallet action.
     */
    const enum VirtualWalletAction {
        Respond = "respond",
        Decline = "decline",
        Wait = "wait",
        Clear = "clear"
    }
    interface SetVirtualWalletBehaviorRequest {
        /**
         * The action of the virtual wallet.
         */
        action: VirtualWalletAction;
        /**
         * The protocol identifier (e.g. "openid4vp"). Required when |action| is
         * "respond", forbidden otherwise.
         */
        protocol?: string;
        /**
         * The response data object returned by the wallet.
         * Required when |action| is "respond", forbidden otherwise.
         */
        response?: any;
        /**
         * The frame to scope the virtual wallet behavior to.
         */
        frameId?: Page.FrameId;
    }
}
/**
 * This domain emulates different environments for the page.
 */
export declare namespace Emulation {
    interface SafeAreaInsets {
        /**
         * Overrides safe-area-inset-top.
         */
        top?: integer;
        /**
         * Overrides safe-area-max-inset-top.
         */
        topMax?: integer;
        /**
         * Overrides safe-area-inset-left.
         */
        left?: integer;
        /**
         * Overrides safe-area-max-inset-left.
         */
        leftMax?: integer;
        /**
         * Overrides safe-area-inset-bottom.
         */
        bottom?: integer;
        /**
         * Overrides safe-area-max-inset-bottom.
         */
        bottomMax?: integer;
        /**
         * Overrides safe-area-inset-right.
         */
        right?: integer;
        /**
         * Overrides safe-area-max-inset-right.
         */
        rightMax?: integer;
    }
    const enum ScreenOrientationType {
        PortraitPrimary = "portraitPrimary",
        PortraitSecondary = "portraitSecondary",
        LandscapePrimary = "landscapePrimary",
        LandscapeSecondary = "landscapeSecondary"
    }
    /**
     * Screen orientation.
     */
    interface ScreenOrientation {
        /**
         * Orientation type.
         */
        type: ScreenOrientationType;
        /**
         * Orientation angle.
         */
        angle: integer;
    }
    const enum DisplayFeatureOrientation {
        Vertical = "vertical",
        Horizontal = "horizontal"
    }
    interface DisplayFeature {
        /**
         * Orientation of a display feature in relation to screen
         */
        orientation: DisplayFeatureOrientation;
        /**
         * The offset from the screen origin in either the x (for vertical
         * orientation) or y (for horizontal orientation) direction.
         */
        offset: integer;
        /**
         * A display feature may mask content such that it is not physically
         * displayed - this length along with the offset describes this area.
         * A display feature that only splits content will have a 0 mask_length.
         */
        maskLength: integer;
    }
    const enum DevicePostureType {
        Continuous = "continuous",
        Folded = "folded"
    }
    interface DevicePosture {
        /**
         * Current posture of the device
         */
        type: DevicePostureType;
    }
    interface MediaFeature {
        name: string;
        value: string;
    }
    /**
     * advance: If the scheduler runs out of immediate work, the virtual time base may fast forward to
     * allow the next delayed task (if any) to run; pause: The virtual time base may not advance;
     * pauseIfNetworkFetchesPending: The virtual time base may not advance if there are any pending
     * resource fetches.
     */
    const enum VirtualTimePolicy {
        Advance = "advance",
        Pause = "pause",
        PauseIfNetworkFetchesPending = "pauseIfNetworkFetchesPending"
    }
    /**
     * Used to specify User Agent Client Hints to emulate. See https://wicg.github.io/ua-client-hints
     */
    interface UserAgentBrandVersion {
        brand: string;
        version: string;
    }
    /**
     * Used to specify User Agent Client Hints to emulate. See https://wicg.github.io/ua-client-hints
     * Missing optional values will be filled in by the target with what it would normally use.
     */
    interface UserAgentMetadata {
        /**
         * Brands appearing in Sec-CH-UA.
         */
        brands?: UserAgentBrandVersion[];
        /**
         * Brands appearing in Sec-CH-UA-Full-Version-List.
         */
        fullVersionList?: UserAgentBrandVersion[];
        /**
         * @deprecated
         */
        fullVersion?: string;
        platform: string;
        platformVersion: string;
        architecture: string;
        model: string;
        mobile: boolean;
        bitness?: string;
        wow64?: boolean;
        /**
         * Used to specify User Agent form-factor values.
         * See https://wicg.github.io/ua-client-hints/#sec-ch-ua-form-factors
         */
        formFactors?: string[];
    }
    /**
     * Used to specify sensor types to emulate.
     * See https://w3c.github.io/sensors/#automation for more information.
     */
    const enum SensorType {
        AbsoluteOrientation = "absolute-orientation",
        Accelerometer = "accelerometer",
        AmbientLight = "ambient-light",
        Gravity = "gravity",
        Gyroscope = "gyroscope",
        LinearAcceleration = "linear-acceleration",
        Magnetometer = "magnetometer",
        RelativeOrientation = "relative-orientation"
    }
    interface SensorMetadata {
        available?: boolean;
        minimumFrequency?: number;
        maximumFrequency?: number;
    }
    interface SensorReadingSingle {
        value: number;
    }
    interface SensorReadingXYZ {
        x: number;
        y: number;
        z: number;
    }
    interface SensorReadingQuaternion {
        x: number;
        y: number;
        z: number;
        w: number;
    }
    interface SensorReading {
        single?: SensorReadingSingle;
        xyz?: SensorReadingXYZ;
        quaternion?: SensorReadingQuaternion;
    }
    const enum PressureSource {
        Cpu = "cpu"
    }
    const enum PressureState {
        Nominal = "nominal",
        Fair = "fair",
        Serious = "serious",
        Critical = "critical"
    }
    interface PressureMetadata {
        available?: boolean;
    }
    interface WorkAreaInsets {
        /**
         * Work area top inset in pixels. Default is 0;
         */
        top?: integer;
        /**
         * Work area left inset in pixels. Default is 0;
         */
        left?: integer;
        /**
         * Work area bottom inset in pixels. Default is 0;
         */
        bottom?: integer;
        /**
         * Work area right inset in pixels. Default is 0;
         */
        right?: integer;
    }
    type ScreenId = OpaqueIdentifier<string, 'Protocol.Emulation.ScreenId'>;
    /**
     * Screen information similar to the one returned by window.getScreenDetails() method,
     * see https://w3c.github.io/window-management/#screendetailed.
     */
    interface ScreenInfo {
        /**
         * Offset of the left edge of the screen.
         */
        left: integer;
        /**
         * Offset of the top edge of the screen.
         */
        top: integer;
        /**
         * Width of the screen.
         */
        width: integer;
        /**
         * Height of the screen.
         */
        height: integer;
        /**
         * Offset of the left edge of the available screen area.
         */
        availLeft: integer;
        /**
         * Offset of the top edge of the available screen area.
         */
        availTop: integer;
        /**
         * Width of the available screen area.
         */
        availWidth: integer;
        /**
         * Height of the available screen area.
         */
        availHeight: integer;
        /**
         * Specifies the screen's device pixel ratio.
         */
        devicePixelRatio: number;
        /**
         * Specifies the screen's orientation.
         */
        orientation: ScreenOrientation;
        /**
         * Specifies the screen's color depth in bits.
         */
        colorDepth: integer;
        /**
         * Indicates whether the device has multiple screens.
         */
        isExtended: boolean;
        /**
         * Indicates whether the screen is internal to the device or external, attached to the device.
         */
        isInternal: boolean;
        /**
         * Indicates whether the screen is set as the the operating system primary screen.
         */
        isPrimary: boolean;
        /**
         * Specifies the descriptive label for the screen.
         */
        label: string;
        /**
         * Specifies the unique identifier of the screen.
         */
        id: ScreenId;
    }
    /**
     * Enum of image types that can be disabled.
     */
    const enum DisabledImageType {
        Avif = "avif",
        Jxl = "jxl",
        Webp = "webp"
    }
    interface CanEmulateResponse extends ProtocolResponseWithError {
        /**
         * True if emulation is supported.
         */
        result: boolean;
    }
    interface SetFocusEmulationEnabledRequest {
        /**
         * Whether to enable to disable focus emulation.
         */
        enabled: boolean;
    }
    interface SetAutoDarkModeOverrideRequest {
        /**
         * Whether to enable or disable automatic dark mode.
         * If not specified, any existing override will be cleared.
         */
        enabled?: boolean;
    }
    interface SetCPUThrottlingRateRequest {
        /**
         * Throttling rate as a slowdown factor (1 is no throttle, 2 is 2x slowdown, etc).
         */
        rate: number;
    }
    interface SetDefaultBackgroundColorOverrideRequest {
        /**
         * RGBA of the default background color. If not specified, any existing override will be
         * cleared.
         */
        color?: DOM.RGBA;
    }
    interface SetSafeAreaInsetsOverrideRequest {
        insets: SafeAreaInsets;
    }
    interface SetVirtualKeyboardGeometryOverrideRequest {
        keyboardRect?: DOM.Rect;
    }
    const enum SetDeviceMetricsOverrideRequestScrollbarType {
        Overlay = "overlay",
        Default = "default"
    }
    const enum SetDeviceMetricsOverrideRequestViewportMeta {
        Enable = "enable",
        Default = "default"
    }
    const enum SetDeviceMetricsOverrideRequestTextLayoutMode {
        Mobile = "mobile",
        Default = "default"
    }
    interface SetDeviceMetricsOverrideRequest {
        /**
         * Overriding width value in pixels (minimum 0, maximum 10000000). 0 disables the override.
         */
        width: integer;
        /**
         * Overriding height value in pixels (minimum 0, maximum 10000000). 0 disables the override.
         */
        height: integer;
        /**
         * Overriding device scale factor value. 0 disables the override.
         */
        deviceScaleFactor: number;
        /**
         * Whether to emulate mobile device. This includes viewport meta tag, overlay scrollbars, text
         * autosizing and more.
         */
        mobile: boolean;
        /**
         * Scale to apply to resulting view image.
         */
        scale?: number;
        /**
         * Overriding screen width value in pixels (minimum 0, maximum 10000000).
         */
        screenWidth?: integer;
        /**
         * Overriding screen height value in pixels (minimum 0, maximum 10000000).
         */
        screenHeight?: integer;
        /**
         * Overriding view X position on screen in pixels (minimum 0, maximum 10000000).
         */
        positionX?: integer;
        /**
         * Overriding view Y position on screen in pixels (minimum 0, maximum 10000000).
         */
        positionY?: integer;
        /**
         * Do not set visible view size, rely upon explicit setVisibleSize call.
         */
        dontSetVisibleSize?: boolean;
        /**
         * Screen orientation override.
         */
        screenOrientation?: ScreenOrientation;
        /**
         * If set, the visible area of the page will be overridden to this viewport. This viewport
         * change is not observed by the page, e.g. viewport-relative elements do not change positions.
         */
        viewport?: Page.Viewport;
        /**
         * If set, the display feature of a multi-segment screen. If not set, multi-segment support
         * is turned-off.
         * Deprecated, use Emulation.setDisplayFeaturesOverride.
         * @deprecated
         */
        displayFeature?: DisplayFeature;
        /**
         * If set, the posture of a foldable device. If not set the posture is set
         * to continuous.
         * Deprecated, use Emulation.setDevicePostureOverride.
         * @deprecated
         */
        devicePosture?: DevicePosture;
        /**
         * Scrollbar type. Default: `default`.
         */
        scrollbarType?: SetDeviceMetricsOverrideRequestScrollbarType;
        /**
         * If set to true, enables screen orientation lock emulation, which
         * intercepts screen.orientation.lock() calls from the page and reports
         * orientation changes via screenOrientationLockChanged events. This is
         * useful for emulating mobile device orientation lock behavior in
         * responsive design mode.
         */
        screenOrientationLockEmulation?: boolean;
        /**
         * Viewport meta tag behavior. Default: `default`. Note: if `mobile` is `true`,
         * the viewport meta tag is always enabled.
         */
        viewportMeta?: SetDeviceMetricsOverrideRequestViewportMeta;
        /**
         * Text layout mode. Default: `default`. Note: if `mobile` is `true`,
         * mobile text layout mode (text autosizing) is always enabled.
         */
        textLayoutMode?: SetDeviceMetricsOverrideRequestTextLayoutMode;
    }
    interface SetDevicePostureOverrideRequest {
        posture: DevicePosture;
    }
    interface SetDisplayFeaturesOverrideRequest {
        features: DisplayFeature[];
    }
    interface SetScrollbarsHiddenRequest {
        /**
         * Whether scrollbars should be always hidden.
         */
        hidden: boolean;
    }
    interface SetDocumentCookieDisabledRequest {
        /**
         * Whether document.coookie API should be disabled.
         */
        disabled: boolean;
    }
    const enum SetEmitTouchEventsForMouseRequestConfiguration {
        Mobile = "mobile",
        Desktop = "desktop"
    }
    interface SetEmitTouchEventsForMouseRequest {
        /**
         * Whether touch emulation based on mouse input should be enabled.
         */
        enabled: boolean;
        /**
         * Touch/gesture events configuration. Default: current platform.
         */
        configuration?: SetEmitTouchEventsForMouseRequestConfiguration;
    }
    interface SetEmulatedMediaRequest {
        /**
         * Media type to emulate. Empty string disables the override.
         */
        media?: string;
        /**
         * Media features to emulate.
         */
        features?: MediaFeature[];
    }
    const enum SetEmulatedVisionDeficiencyRequestType {
        None = "none",
        BlurredVision = "blurredVision",
        ReducedContrast = "reducedContrast",
        Achromatopsia = "achromatopsia",
        Deuteranopia = "deuteranopia",
        Protanopia = "protanopia",
        Tritanopia = "tritanopia"
    }
    interface SetEmulatedVisionDeficiencyRequest {
        /**
         * Vision deficiency to emulate. Order: best-effort emulations come first, followed by any
         * physiologically accurate emulations for medically recognized color vision deficiencies.
         */
        type: SetEmulatedVisionDeficiencyRequestType;
    }
    interface SetEmulatedOSTextScaleRequest {
        scale?: number;
    }
    interface SetGeolocationOverrideRequest {
        /**
         * Mock latitude
         */
        latitude?: number;
        /**
         * Mock longitude
         */
        longitude?: number;
        /**
         * Mock accuracy
         */
        accuracy?: number;
        /**
         * Mock altitude
         */
        altitude?: number;
        /**
         * Mock altitudeAccuracy
         */
        altitudeAccuracy?: number;
        /**
         * Mock heading
         */
        heading?: number;
        /**
         * Mock speed
         */
        speed?: number;
    }
    interface GetOverriddenSensorInformationRequest {
        type: SensorType;
    }
    interface GetOverriddenSensorInformationResponse extends ProtocolResponseWithError {
        requestedSamplingFrequency: number;
    }
    interface SetSensorOverrideEnabledRequest {
        enabled: boolean;
        type: SensorType;
        metadata?: SensorMetadata;
    }
    interface SetSensorOverrideReadingsRequest {
        type: SensorType;
        reading: SensorReading;
    }
    interface SetPressureSourceOverrideEnabledRequest {
        enabled: boolean;
        source: PressureSource;
        metadata?: PressureMetadata;
    }
    interface SetPressureStateOverrideRequest {
        source: PressureSource;
        state: PressureState;
    }
    interface SetIdleOverrideRequest {
        /**
         * Mock isUserActive
         */
        isUserActive: boolean;
        /**
         * Mock isScreenUnlocked
         */
        isScreenUnlocked: boolean;
    }
    interface SetNavigatorOverridesRequest {
        /**
         * The platform navigator.platform should return.
         */
        platform: string;
    }
    interface SetPageScaleFactorRequest {
        /**
         * Page scale factor.
         */
        pageScaleFactor: number;
    }
    interface SetScriptExecutionDisabledRequest {
        /**
         * Whether script execution should be disabled in the page.
         */
        value: boolean;
    }
    interface SetTouchEmulationEnabledRequest {
        /**
         * Whether the touch event emulation should be enabled.
         */
        enabled: boolean;
        /**
         * Maximum touch points supported. Defaults to one.
         */
        maxTouchPoints?: integer;
    }
    interface SetVirtualTimePolicyRequest {
        policy: VirtualTimePolicy;
        /**
         * If set, after this many virtual milliseconds have elapsed virtual time will be paused and a
         * virtualTimeBudgetExpired event is sent.
         */
        budget?: number;
        /**
         * If set this specifies the maximum number of tasks that can be run before virtual is forced
         * forwards to prevent deadlock.
         */
        maxVirtualTimeTaskStarvationCount?: integer;
        /**
         * If set, base::Time::Now will be overridden to initially return this value.
         */
        initialVirtualTime?: Network.TimeSinceEpoch;
    }
    interface SetVirtualTimePolicyResponse extends ProtocolResponseWithError {
        /**
         * Absolute timestamp at which virtual time was first enabled (up time in milliseconds).
         */
        virtualTimeTicksBase: number;
    }
    interface SetLocaleOverrideRequest {
        /**
         * ICU style C locale (e.g. "en_US"). If not specified or empty, disables the override and
         * restores default host system locale.
         */
        locale?: string;
    }
    interface SetTimezoneOverrideRequest {
        /**
         * The timezone identifier. List of supported timezones:
         * https://source.chromium.org/chromium/chromium/deps/icu.git/+/faee8bc70570192d82d2978a71e2a615788597d1:source/data/misc/metaZones.txt
         * If empty, disables the override and restores default host system timezone.
         */
        timezoneId: string;
    }
    interface SetVisibleSizeRequest {
        /**
         * Frame width (DIP).
         */
        width: integer;
        /**
         * Frame height (DIP).
         */
        height: integer;
    }
    interface SetDisabledImageTypesRequest {
        /**
         * Image types to disable.
         */
        imageTypes: DisabledImageType[];
    }
    interface SetDataSaverOverrideRequest {
        /**
         * Override value. Omitting the parameter disables the override.
         */
        dataSaverEnabled?: boolean;
    }
    interface SetHardwareConcurrencyOverrideRequest {
        /**
         * Hardware concurrency to report
         */
        hardwareConcurrency: integer;
    }
    const enum SetCPUPerformanceOverrideRequestPerformanceTier {
        Unknown = "unknown",
        Low = "low",
        Mid = "mid",
        High = "high",
        Ultra = "ultra"
    }
    interface SetCPUPerformanceOverrideRequest {
        /**
         * Override value. Omitting the parameter disables the override.
         */
        performanceTier?: SetCPUPerformanceOverrideRequestPerformanceTier;
    }
    interface SetUserAgentOverrideRequest {
        /**
         * User agent to use.
         */
        userAgent: string;
        /**
         * Browser language to emulate.
         */
        acceptLanguage?: string;
        /**
         * The platform navigator.platform should return.
         */
        platform?: string;
        /**
         * To be sent in Sec-CH-UA-* headers and returned in navigator.userAgentData
         */
        userAgentMetadata?: UserAgentMetadata;
    }
    interface SetAutomationOverrideRequest {
        /**
         * Whether the override should be enabled.
         */
        enabled: boolean;
    }
    interface SetSmallViewportHeightDifferenceOverrideRequest {
        /**
         * This will cause an element of size 100svh to be `difference` pixels smaller than an element
         * of size 100lvh.
         */
        difference: integer;
    }
    interface GetScreenInfosResponse extends ProtocolResponseWithError {
        screenInfos: ScreenInfo[];
    }
    interface AddScreenRequest {
        /**
         * Offset of the left edge of the screen in pixels.
         */
        left: integer;
        /**
         * Offset of the top edge of the screen in pixels.
         */
        top: integer;
        /**
         * The width of the screen in pixels.
         */
        width: integer;
        /**
         * The height of the screen in pixels.
         */
        height: integer;
        /**
         * Specifies the screen's work area. Default is entire screen.
         */
        workAreaInsets?: WorkAreaInsets;
        /**
         * Specifies the screen's device pixel ratio. Default is 1.
         */
        devicePixelRatio?: number;
        /**
         * Specifies the screen's rotation angle. Available values are 0, 90, 180 and 270. Default is 0.
         */
        rotation?: integer;
        /**
         * Specifies the screen's color depth in bits. Default is 24.
         */
        colorDepth?: integer;
        /**
         * Specifies the descriptive label for the screen. Default is none.
         */
        label?: string;
        /**
         * Indicates whether the screen is internal to the device or external, attached to the device. Default is false.
         */
        isInternal?: boolean;
    }
    interface AddScreenResponse extends ProtocolResponseWithError {
        screenInfo: ScreenInfo;
    }
    interface UpdateScreenRequest {
        /**
         * Target screen identifier.
         */
        screenId: ScreenId;
        /**
         * Offset of the left edge of the screen in pixels.
         */
        left?: integer;
        /**
         * Offset of the top edge of the screen in pixels.
         */
        top?: integer;
        /**
         * The width of the screen in pixels.
         */
        width?: integer;
        /**
         * The height of the screen in pixels.
         */
        height?: integer;
        /**
         * Specifies the screen's work area.
         */
        workAreaInsets?: WorkAreaInsets;
        /**
         * Specifies the screen's device pixel ratio.
         */
        devicePixelRatio?: number;
        /**
         * Specifies the screen's rotation angle. Available values are 0, 90, 180 and 270.
         */
        rotation?: integer;
        /**
         * Specifies the screen's color depth in bits.
         */
        colorDepth?: integer;
        /**
         * Specifies the descriptive label for the screen.
         */
        label?: string;
        /**
         * Indicates whether the screen is internal to the device or external, attached to the device. Default is false.
         */
        isInternal?: boolean;
    }
    interface UpdateScreenResponse extends ProtocolResponseWithError {
        screenInfo: ScreenInfo;
    }
    interface RemoveScreenRequest {
        screenId: ScreenId;
    }
    interface SetPrimaryScreenRequest {
        screenId: ScreenId;
    }
    /**
     * Fired when a page calls screen.orientation.lock() or screen.orientation.unlock()
     * while device emulation is enabled. This allows the DevTools frontend to update the
     * emulated device orientation accordingly.
     */
    interface ScreenOrientationLockChangedEvent {
        /**
         * Whether the screen orientation is currently locked.
         */
        locked: boolean;
        /**
         * The orientation lock type requested by the page. Only set when locked is true.
         */
        orientation?: ScreenOrientation;
    }
}
/**
 * EventBreakpoints permits setting JavaScript breakpoints on operations and events
 * occurring in native code invoked from JavaScript. Once breakpoint is hit, it is
 * reported through Debugger domain, similarly to regular breakpoints being hit.
 */
export declare namespace EventBreakpoints {
    interface SetInstrumentationBreakpointRequest {
        /**
         * Instrumentation name to stop on.
         */
        eventName: string;
    }
    interface RemoveInstrumentationBreakpointRequest {
        /**
         * Instrumentation name to stop on.
         */
        eventName: string;
    }
}
/**
 * Defines commands and events for browser extensions.
 */
export declare namespace Extensions {
    /**
     * Storage areas.
     */
    const enum StorageArea {
        Session = "session",
        Local = "local",
        Sync = "sync",
        Managed = "managed"
    }
    /**
     * Detailed information about an extension.
     */
    interface ExtensionInfo {
        /**
         * Extension id.
         */
        id: string;
        /**
         * Extension name.
         */
        name: string;
        /**
         * Extension version.
         */
        version: string;
        /**
         * The path from which the extension was loaded.
         */
        path: string;
        /**
         * Extension enabled status.
         */
        enabled: boolean;
    }
    interface TriggerActionRequest {
        /**
         * Extension id.
         */
        id: string;
        /**
         * A tab target ID to trigger the default extension action on.
         */
        targetId: string;
    }
    interface LoadUnpackedRequest {
        /**
         * Absolute file path.
         */
        path: string;
        /**
         * Enable the extension in incognito
         */
        enableInIncognito?: boolean;
    }
    interface LoadUnpackedResponse extends ProtocolResponseWithError {
        /**
         * Extension id.
         */
        id: string;
    }
    interface GetExtensionsResponse extends ProtocolResponseWithError {
        extensions: ExtensionInfo[];
    }
    interface UninstallRequest {
        /**
         * Extension id.
         */
        id: string;
    }
    interface GetStorageItemsRequest {
        /**
         * ID of extension.
         */
        id: string;
        /**
         * StorageArea to retrieve data from.
         */
        storageArea: StorageArea;
        /**
         * Keys to retrieve.
         */
        keys?: string[];
    }
    interface GetStorageItemsResponse extends ProtocolResponseWithError {
        data: any;
    }
    interface RemoveStorageItemsRequest {
        /**
         * ID of extension.
         */
        id: string;
        /**
         * StorageArea to remove data from.
         */
        storageArea: StorageArea;
        /**
         * Keys to remove.
         */
        keys: string[];
    }
    interface ClearStorageItemsRequest {
        /**
         * ID of extension.
         */
        id: string;
        /**
         * StorageArea to remove data from.
         */
        storageArea: StorageArea;
    }
    interface SetStorageItemsRequest {
        /**
         * ID of extension.
         */
        id: string;
        /**
         * StorageArea to set data in.
         */
        storageArea: StorageArea;
        /**
         * Values to set.
         */
        values: any;
    }
}
/**
 * This domain allows interacting with the FedCM dialog.
 */
export declare namespace FedCm {
    /**
     * Whether this is a sign-up or sign-in action for this account, i.e.
     * whether this account has ever been used to sign in to this RP before.
     */
    const enum LoginState {
        SignIn = "SignIn",
        SignUp = "SignUp"
    }
    /**
     * The types of FedCM dialogs.
     */
    const enum DialogType {
        AccountChooser = "AccountChooser",
        AutoReauthn = "AutoReauthn",
        ConfirmIdpLogin = "ConfirmIdpLogin",
        Error = "Error"
    }
    /**
     * The buttons on the FedCM dialog.
     */
    const enum DialogButton {
        ConfirmIdpLoginContinue = "ConfirmIdpLoginContinue",
        ErrorGotIt = "ErrorGotIt",
        ErrorMoreDetails = "ErrorMoreDetails"
    }
    /**
     * The URLs that each account has
     */
    const enum AccountUrlType {
        TermsOfService = "TermsOfService",
        PrivacyPolicy = "PrivacyPolicy"
    }
    /**
     * Corresponds to IdentityRequestAccount
     */
    interface Account {
        accountId: string;
        email: string;
        name: string;
        givenName: string;
        pictureUrl: string;
        idpConfigUrl: string;
        idpLoginUrl: string;
        loginState: LoginState;
        /**
         * These two are only set if the loginState is signUp
         */
        termsOfServiceUrl?: string;
        privacyPolicyUrl?: string;
    }
    interface EnableRequest {
        /**
         * Allows callers to disable the promise rejection delay that would
         * normally happen, if this is unimportant to what's being tested.
         * (step 4 of https://fedidcg.github.io/FedCM/#browser-api-rp-sign-in)
         */
        disableRejectionDelay?: boolean;
    }
    interface SelectAccountRequest {
        dialogId: string;
        accountIndex: integer;
    }
    interface ClickDialogButtonRequest {
        dialogId: string;
        dialogButton: DialogButton;
    }
    interface OpenUrlRequest {
        dialogId: string;
        accountIndex: integer;
        accountUrlType: AccountUrlType;
    }
    interface DismissDialogRequest {
        dialogId: string;
        triggerCooldown?: boolean;
    }
    interface DialogShownEvent {
        dialogId: string;
        dialogType: DialogType;
        accounts: Account[];
        /**
         * These exist primarily so that the caller can verify the
         * RP context was used appropriately.
         */
        title: string;
        subtitle?: string;
    }
    /**
     * Triggered when a dialog is closed, either by user action, JS abort,
     * or a command below.
     */
    interface DialogClosedEvent {
        dialogId: string;
    }
}
/**
 * A domain for letting clients substitute browser's network layer with client code.
 */
export declare namespace Fetch {
    /**
     * Unique request identifier.
     * Note that this does not identify individual HTTP requests that are part of
     * a network request.
     */
    type RequestId = OpaqueIdentifier<string, 'Protocol.Fetch.RequestId'>;
    /**
     * Stages of the request to handle. Request will intercept before the request is
     * sent. Response will intercept after the response is received (but before response
     * body is received).
     */
    const enum RequestStage {
        Request = "Request",
        Response = "Response"
    }
    interface RequestPattern {
        /**
         * Wildcards (`'*'` -> zero or more, `'?'` -> exactly one) are allowed. Escape character is
         * backslash. Omitting is equivalent to `"*"`.
         */
        urlPattern?: string;
        /**
         * If set, only requests for matching resource types will be intercepted.
         */
        resourceType?: Network.ResourceType;
        /**
         * Stage at which to begin intercepting requests. Default is Request.
         */
        requestStage?: RequestStage;
    }
    /**
     * Response HTTP header entry
     */
    interface HeaderEntry {
        name: string;
        value: string;
    }
    const enum AuthChallengeSource {
        Server = "Server",
        Proxy = "Proxy"
    }
    /**
     * Authorization challenge for HTTP status code 401 or 407.
     */
    interface AuthChallenge {
        /**
         * Source of the authentication challenge.
         */
        source?: AuthChallengeSource;
        /**
         * Origin of the challenger.
         */
        origin: string;
        /**
         * The authentication scheme used, such as basic or digest
         */
        scheme: string;
        /**
         * The realm of the challenge. May be empty.
         */
        realm: string;
    }
    const enum AuthChallengeResponseResponse {
        Default = "Default",
        CancelAuth = "CancelAuth",
        ProvideCredentials = "ProvideCredentials"
    }
    /**
     * Response to an AuthChallenge.
     */
    interface AuthChallengeResponse {
        /**
         * The decision on what to do in response to the authorization challenge.  Default means
         * deferring to the default behavior of the net stack, which will likely either the Cancel
         * authentication or display a popup dialog box.
         */
        response: AuthChallengeResponseResponse;
        /**
         * The username to provide, possibly empty. Should only be set if response is
         * ProvideCredentials.
         */
        username?: string;
        /**
         * The password to provide, possibly empty. Should only be set if response is
         * ProvideCredentials.
         */
        password?: string;
    }
    interface EnableRequest {
        /**
         * If specified, only requests matching any of these patterns will produce
         * fetchRequested event and will be paused until clients response. If not set,
         * all requests will be affected.
         */
        patterns?: RequestPattern[];
        /**
         * If true, authRequired events will be issued and requests will be paused
         * expecting a call to continueWithAuth.
         */
        handleAuthRequests?: boolean;
    }
    interface FailRequestRequest {
        /**
         * An id the client received in requestPaused event.
         */
        requestId: RequestId;
        /**
         * Causes the request to fail with the given reason.
         */
        errorReason: Network.ErrorReason;
    }
    interface FulfillRequestRequest {
        /**
         * An id the client received in requestPaused event.
         */
        requestId: RequestId;
        /**
         * An HTTP response code.
         */
        responseCode: integer;
        /**
         * Response headers.
         */
        responseHeaders?: HeaderEntry[];
        /**
         * Alternative way of specifying response headers as a \0-separated
         * series of name: value pairs. Prefer the above method unless you
         * need to represent some non-UTF8 values that can't be transmitted
         * over the protocol as text.
         */
        binaryResponseHeaders?: binary;
        /**
         * A response body. If absent, original response body will be used if
         * the request is intercepted at the response stage and empty body
         * will be used if the request is intercepted at the request stage.
         */
        body?: binary;
        /**
         * A textual representation of responseCode.
         * If absent, a standard phrase matching responseCode is used.
         */
        responsePhrase?: string;
    }
    interface ContinueRequestRequest {
        /**
         * An id the client received in requestPaused event.
         */
        requestId: RequestId;
        /**
         * If set, the request url will be modified in a way that's not observable by page.
         */
        url?: string;
        /**
         * If set, the request method is overridden.
         */
        method?: string;
        /**
         * If set, overrides the post data in the request.
         */
        postData?: binary;
        /**
         * If set, overrides the request headers. Note that the overrides do not
         * extend to subsequent redirect hops, if a redirect happens. Another override
         * may be applied to a different request produced by a redirect.
         */
        headers?: HeaderEntry[];
        /**
         * If set, overrides response interception behavior for this request.
         */
        interceptResponse?: boolean;
    }
    interface ContinueWithAuthRequest {
        /**
         * An id the client received in authRequired event.
         */
        requestId: RequestId;
        /**
         * Response to  with an authChallenge.
         */
        authChallengeResponse: AuthChallengeResponse;
    }
    interface ContinueResponseRequest {
        /**
         * An id the client received in requestPaused event.
         */
        requestId: RequestId;
        /**
         * An HTTP response code. If absent, original response code will be used.
         */
        responseCode?: integer;
        /**
         * A textual representation of responseCode.
         * If absent, a standard phrase matching responseCode is used.
         */
        responsePhrase?: string;
        /**
         * Response headers. If absent, original response headers will be used.
         */
        responseHeaders?: HeaderEntry[];
        /**
         * Alternative way of specifying response headers as a \0-separated
         * series of name: value pairs. Prefer the above method unless you
         * need to represent some non-UTF8 values that can't be transmitted
         * over the protocol as text.
         */
        binaryResponseHeaders?: binary;
    }
    interface GetResponseBodyRequest {
        /**
         * Identifier for the intercepted request to get body for.
         */
        requestId: RequestId;
    }
    interface GetResponseBodyResponse extends ProtocolResponseWithError {
        /**
         * Response body.
         */
        body: string;
        /**
         * True, if content was sent as base64.
         */
        base64Encoded: boolean;
    }
    interface TakeResponseBodyAsStreamRequest {
        requestId: RequestId;
    }
    interface TakeResponseBodyAsStreamResponse extends ProtocolResponseWithError {
        stream: IO.StreamHandle;
    }
    /**
     * Issued when the domain is enabled and the request URL matches the
     * specified filter. The request is paused until the client responds
     * with one of continueRequest, failRequest or fulfillRequest.
     * The stage of the request can be determined by presence of responseErrorReason
     * and responseStatusCode -- the request is at the response stage if either
     * of these fields is present and in the request stage otherwise.
     * Redirect responses and subsequent requests are reported similarly to regular
     * responses and requests. Redirect responses may be distinguished by the value
     * of `responseStatusCode` (which is one of 301, 302, 303, 307, 308) along with
     * presence of the `location` header. Requests resulting from a redirect will
     * have `redirectedRequestId` field set.
     */
    interface RequestPausedEvent {
        /**
         * Each request the page makes will have a unique id.
         */
        requestId: RequestId;
        /**
         * The details of the request.
         */
        request: Network.Request;
        /**
         * The id of the frame that initiated the request.
         */
        frameId: Page.FrameId;
        /**
         * How the requested resource will be used.
         */
        resourceType: Network.ResourceType;
        /**
         * Response error if intercepted at response stage.
         */
        responseErrorReason?: Network.ErrorReason;
        /**
         * Response code if intercepted at response stage.
         */
        responseStatusCode?: integer;
        /**
         * Response status text if intercepted at response stage.
         */
        responseStatusText?: string;
        /**
         * Response headers if intercepted at the response stage.
         */
        responseHeaders?: HeaderEntry[];
        /**
         * If the intercepted request had a corresponding Network.requestWillBeSent event fired for it,
         * then this networkId will be the same as the requestId present in the requestWillBeSent event.
         */
        networkId?: Network.RequestId;
        /**
         * If the request is due to a redirect response from the server, the id of the request that
         * has caused the redirect.
         */
        redirectedRequestId?: RequestId;
    }
    /**
     * Issued when the domain is enabled with handleAuthRequests set to true.
     * The request is paused until client responds with continueWithAuth.
     */
    interface AuthRequiredEvent {
        /**
         * Each request the page makes will have a unique id.
         */
        requestId: RequestId;
        /**
         * The details of the request.
         */
        request: Network.Request;
        /**
         * The id of the frame that initiated the request.
         */
        frameId: Page.FrameId;
        /**
         * How the requested resource will be used.
         */
        resourceType: Network.ResourceType;
        /**
         * Details of the Authorization Challenge encountered.
         * If this is set, client should respond with continueRequest that
         * contains AuthChallengeResponse.
         */
        authChallenge: AuthChallenge;
    }
}
export declare namespace FileSystem {
    interface File {
        name: string;
        /**
         * Timestamp
         */
        lastModified: Network.TimeSinceEpoch;
        /**
         * Size in bytes
         */
        size: number;
        type: string;
    }
    interface Directory {
        name: string;
        nestedDirectories: string[];
        /**
         * Files that are directly nested under this directory.
         */
        nestedFiles: File[];
    }
    interface BucketFileSystemLocator {
        /**
         * Storage key
         */
        storageKey: Storage.SerializedStorageKey;
        /**
         * Bucket name. Not passing a `bucketName` will retrieve the default Bucket. (https://developer.mozilla.org/en-US/docs/Web/API/Storage_API#storage_buckets)
         */
        bucketName?: string;
        /**
         * Path to the directory using each path component as an array item.
         */
        pathComponents: string[];
    }
    interface GetDirectoryRequest {
        bucketFileSystemLocator: BucketFileSystemLocator;
    }
    interface GetDirectoryResponse extends ProtocolResponseWithError {
        /**
         * Returns the directory object at the path.
         */
        directory: Directory;
    }
}
/**
 * This domain provides commands to trigger the "Find in page" feature.
 */
export declare namespace FindInPage {
    interface FindFirstRequest {
        query: string;
    }
}
/**
 * This domain provides experimental commands only supported in headless mode.
 */
export declare namespace HeadlessExperimental {
    const enum ScreenshotParamsFormat {
        Jpeg = "jpeg",
        Png = "png",
        Webp = "webp"
    }
    /**
     * Encoding options for a screenshot.
     */
    interface ScreenshotParams {
        /**
         * Image compression format (defaults to png).
         */
        format?: ScreenshotParamsFormat;
        /**
         * Compression quality from range [0..100] (jpeg and webp only).
         */
        quality?: integer;
        /**
         * Optimize image encoding for speed, not for resulting size (defaults to false)
         */
        optimizeForSpeed?: boolean;
    }
    interface BeginFrameRequest {
        /**
         * Timestamp of this BeginFrame in Renderer TimeTicks (milliseconds of uptime). If not set,
         * the current time will be used.
         */
        frameTimeTicks?: number;
        /**
         * The interval between BeginFrames that is reported to the compositor, in milliseconds.
         * Defaults to a 60 frames/second interval, i.e. about 16.666 milliseconds.
         */
        interval?: number;
        /**
         * Whether updates should not be committed and drawn onto the display. False by default. If
         * true, only side effects of the BeginFrame will be run, such as layout and animations, but
         * any visual updates may not be visible on the display or in screenshots.
         */
        noDisplayUpdates?: boolean;
        /**
         * If set, a screenshot of the frame will be captured and returned in the response. Otherwise,
         * no screenshot will be captured. Note that capturing a screenshot can fail, for example,
         * during renderer initialization. In such a case, no screenshot data will be returned.
         */
        screenshot?: ScreenshotParams;
    }
    interface BeginFrameResponse extends ProtocolResponseWithError {
        /**
         * Whether the BeginFrame resulted in damage and, thus, a new frame was committed to the
         * display. Reported for diagnostic uses, may be removed in the future.
         */
        hasDamage: boolean;
        /**
         * Base64-encoded image data of the screenshot, if one was requested and successfully taken.
         */
        screenshotData?: binary;
    }
}
/**
 * Input/Output operations for streams produced by DevTools.
 */
export declare namespace IO {
    /**
     * This is either obtained from another method or specified as `blob:<uuid>` where
     * `<uuid>` is an UUID of a Blob.
     */
    type StreamHandle = OpaqueIdentifier<string, 'Protocol.IO.StreamHandle'>;
    interface CloseRequest {
        /**
         * Handle of the stream to close.
         */
        handle: StreamHandle;
    }
    interface ReadRequest {
        /**
         * Handle of the stream to read.
         */
        handle: StreamHandle;
        /**
         * Seek to the specified offset before reading (if not specified, proceed with offset
         * following the last read). Some types of streams may only support sequential reads.
         */
        offset?: integer;
        /**
         * Maximum number of bytes to read (left upon the agent discretion if not specified).
         */
        size?: integer;
    }
    interface ReadResponse extends ProtocolResponseWithError {
        /**
         * Set if the data is base64-encoded
         */
        base64Encoded?: boolean;
        /**
         * Data that were read.
         */
        data: string;
        /**
         * Set if the end-of-file condition occurred while reading.
         */
        eof: boolean;
    }
    interface ResolveBlobRequest {
        /**
         * Object id of a Blob object wrapper.
         */
        objectId: Runtime.RemoteObjectId;
    }
    interface ResolveBlobResponse extends ProtocolResponseWithError {
        /**
         * UUID of the specified Blob.
         */
        uuid: string;
    }
}
export declare namespace IndexedDB {
    /**
     * Database with an array of object stores.
     */
    interface DatabaseWithObjectStores {
        /**
         * Database name.
         */
        name: string;
        /**
         * Database version (type is not 'integer', as the standard
         * requires the version number to be 'unsigned long long')
         */
        version: number;
        /**
         * Object stores in this database.
         */
        objectStores: ObjectStore[];
    }
    /**
     * Object store.
     */
    interface ObjectStore {
        /**
         * Object store name.
         */
        name: string;
        /**
         * Object store key path.
         */
        keyPath: KeyPath;
        /**
         * If true, object store has auto increment flag set.
         */
        autoIncrement: boolean;
        /**
         * Indexes in this object store.
         */
        indexes: ObjectStoreIndex[];
    }
    /**
     * Object store index.
     */
    interface ObjectStoreIndex {
        /**
         * Index name.
         */
        name: string;
        /**
         * Index key path.
         */
        keyPath: KeyPath;
        /**
         * If true, index is unique.
         */
        unique: boolean;
        /**
         * If true, index allows multiple entries for a key.
         */
        multiEntry: boolean;
    }
    const enum KeyType {
        Number = "number",
        String = "string",
        Date = "date",
        Array = "array"
    }
    /**
     * Key.
     */
    interface Key {
        /**
         * Key type.
         */
        type: KeyType;
        /**
         * Number value.
         */
        number?: number;
        /**
         * String value.
         */
        string?: string;
        /**
         * Date value.
         */
        date?: number;
        /**
         * Array value.
         */
        array?: Key[];
    }
    /**
     * Key range.
     */
    interface KeyRange {
        /**
         * Lower bound.
         */
        lower?: Key;
        /**
         * Upper bound.
         */
        upper?: Key;
        /**
         * If true lower bound is open.
         */
        lowerOpen: boolean;
        /**
         * If true upper bound is open.
         */
        upperOpen: boolean;
    }
    /**
     * Data entry.
     */
    interface DataEntry {
        /**
         * Key object.
         */
        key: Runtime.RemoteObject;
        /**
         * Primary key object.
         */
        primaryKey: Runtime.RemoteObject;
        /**
         * Value object.
         */
        value: Runtime.RemoteObject;
    }
    const enum KeyPathType {
        Null = "null",
        String = "string",
        Array = "array"
    }
    /**
     * Key path.
     */
    interface KeyPath {
        /**
         * Key path type.
         */
        type: KeyPathType;
        /**
         * String value.
         */
        string?: string;
        /**
         * Array value.
         */
        array?: string[];
    }
    interface ClearObjectStoreRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, or storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
        /**
         * Database name.
         */
        databaseName: string;
        /**
         * Object store name.
         */
        objectStoreName: string;
    }
    interface DeleteDatabaseRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, or storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
        /**
         * Database name.
         */
        databaseName: string;
    }
    interface DeleteObjectStoreEntriesRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, or storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
        databaseName: string;
        objectStoreName: string;
        /**
         * Range of entry keys to delete
         */
        keyRange: KeyRange;
    }
    interface RequestDataRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, or storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
        /**
         * Database name.
         */
        databaseName: string;
        /**
         * Object store name.
         */
        objectStoreName: string;
        /**
         * Index name. If not specified, it performs an object store data request.
         */
        indexName?: string;
        /**
         * Number of records to skip.
         */
        skipCount: integer;
        /**
         * Number of records to fetch.
         */
        pageSize: integer;
        /**
         * Key range.
         */
        keyRange?: KeyRange;
    }
    interface RequestDataResponse extends ProtocolResponseWithError {
        /**
         * Array of object store data entries.
         */
        objectStoreDataEntries: DataEntry[];
        /**
         * If true, there are more entries to fetch in the given range.
         */
        hasMore: boolean;
    }
    interface GetMetadataRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, or storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
        /**
         * Database name.
         */
        databaseName: string;
        /**
         * Object store name.
         */
        objectStoreName: string;
    }
    interface GetMetadataResponse extends ProtocolResponseWithError {
        /**
         * the entries count
         */
        entriesCount: number;
        /**
         * the current value of key generator, to become the next inserted
         * key into the object store. Valid if objectStore.autoIncrement
         * is true.
         */
        keyGeneratorValue: number;
    }
    interface RequestDatabaseRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, or storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
        /**
         * Database name.
         */
        databaseName: string;
    }
    interface RequestDatabaseResponse extends ProtocolResponseWithError {
        /**
         * Database with an array of object stores.
         */
        databaseWithObjectStores: DatabaseWithObjectStores;
    }
    interface RequestDatabaseNamesRequest {
        /**
         * At least and at most one of securityOrigin, storageKey, or storageBucket must be specified.
         * Security origin.
         */
        securityOrigin?: string;
        /**
         * Storage key.
         */
        storageKey?: string;
        /**
         * Storage bucket. If not specified, it uses the default bucket.
         */
        storageBucket?: Storage.StorageBucket;
    }
    interface RequestDatabaseNamesResponse extends ProtocolResponseWithError {
        /**
         * Database names for origin.
         */
        databaseNames: string[];
    }
}
export declare namespace Input {
    interface TouchPoint {
        /**
         * X coordinate of the event relative to the main frame's viewport in CSS pixels.
         */
        x: number;
        /**
         * Y coordinate of the event relative to the main frame's viewport in CSS pixels. 0 refers to
         * the top of the viewport and Y increases as it proceeds towards the bottom of the viewport.
         */
        y: number;
        /**
         * X radius of the touch area (default: 1.0).
         */
        radiusX?: number;
        /**
         * Y radius of the touch area (default: 1.0).
         */
        radiusY?: number;
        /**
         * Rotation angle (default: 0.0).
         */
        rotationAngle?: number;
        /**
         * Force (default: 1.0).
         */
        force?: number;
        /**
         * The normalized tangential pressure, which has a range of [-1,1] (default: 0).
         */
        tangentialPressure?: number;
        /**
         * The plane angle between the Y-Z plane and the plane containing both the stylus axis and the Y axis, in degrees of the range [-90,90], a positive tiltX is to the right (default: 0)
         */
        tiltX?: number;
        /**
         * The plane angle between the X-Z plane and the plane containing both the stylus axis and the X axis, in degrees of the range [-90,90], a positive tiltY is towards the user (default: 0).
         */
        tiltY?: number;
        /**
         * The clockwise rotation of a pen stylus around its own major axis, in degrees in the range [0,359] (default: 0).
         */
        twist?: integer;
        /**
         * Identifier used to track touch sources between events, must be unique within an event.
         */
        id?: number;
    }
    const enum GestureSourceType {
        Default = "default",
        Touch = "touch",
        Mouse = "mouse"
    }
    const enum MouseButton {
        None = "none",
        Left = "left",
        Middle = "middle",
        Right = "right",
        Back = "back",
        Forward = "forward"
    }
    /**
     * UTC time in seconds, counted from January 1, 1970.
     */
    type TimeSinceEpoch = number;
    interface DragDataItem {
        /**
         * Mime type of the dragged data.
         */
        mimeType: string;
        /**
         * Depending of the value of `mimeType`, it contains the dragged link,
         * text, HTML markup or any other data.
         */
        data: string;
        /**
         * Title associated with a link. Only valid when `mimeType` == "text/uri-list".
         */
        title?: string;
        /**
         * Stores the base URL for the contained markup. Only valid when `mimeType`
         * == "text/html".
         */
        baseURL?: string;
    }
    interface DragData {
        items: DragDataItem[];
        /**
         * List of filenames that should be included when dropping
         */
        files?: string[];
        /**
         * Bit field representing allowed drag operations. Copy = 1, Link = 2, Move = 16
         */
        dragOperationsMask: integer;
    }
    const enum DispatchDragEventRequestType {
        DragEnter = "dragEnter",
        DragOver = "dragOver",
        Drop = "drop",
        DragCancel = "dragCancel"
    }
    interface DispatchDragEventRequest {
        /**
         * Type of the drag event.
         */
        type: DispatchDragEventRequestType;
        /**
         * X coordinate of the event relative to the main frame's viewport in CSS pixels.
         */
        x: number;
        /**
         * Y coordinate of the event relative to the main frame's viewport in CSS pixels. 0 refers to
         * the top of the viewport and Y increases as it proceeds towards the bottom of the viewport.
         */
        y: number;
        data: DragData;
        /**
         * Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8
         * (default: 0).
         */
        modifiers?: integer;
    }
    const enum DispatchKeyEventRequestType {
        KeyDown = "keyDown",
        KeyUp = "keyUp",
        RawKeyDown = "rawKeyDown",
        Char = "char"
    }
    interface DispatchKeyEventRequest {
        /**
         * Type of the key event.
         */
        type: DispatchKeyEventRequestType;
        /**
         * Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8
         * (default: 0).
         */
        modifiers?: integer;
        /**
         * Time at which the event occurred.
         */
        timestamp?: TimeSinceEpoch;
        /**
         * Text as generated by processing a virtual key code with a keyboard layout. Not needed for
         * for `keyUp` and `rawKeyDown` events (default: "")
         */
        text?: string;
        /**
         * Text that would have been generated by the keyboard if no modifiers were pressed (except for
         * shift). Useful for shortcut (accelerator) key handling (default: "").
         */
        unmodifiedText?: string;
        /**
         * Unique key identifier (e.g., 'U+0041') (default: "").
         */
        keyIdentifier?: string;
        /**
         * Unique DOM defined string value for each physical key (e.g., 'KeyA') (default: "").
         */
        code?: string;
        /**
         * Unique DOM defined string value describing the meaning of the key in the context of active
         * modifiers, keyboard layout, etc (e.g., 'AltGr') (default: "").
         */
        key?: string;
        /**
         * Windows virtual key code (default: 0).
         */
        windowsVirtualKeyCode?: integer;
        /**
         * Native virtual key code (default: 0).
         */
        nativeVirtualKeyCode?: integer;
        /**
         * Whether the event was generated from auto repeat (default: false).
         */
        autoRepeat?: boolean;
        /**
         * Whether the event was generated from the keypad (default: false).
         */
        isKeypad?: boolean;
        /**
         * Whether the event was a system key event (default: false).
         */
        isSystemKey?: boolean;
        /**
         * Whether the event was from the left or right side of the keyboard. 1=Left, 2=Right (default:
         * 0).
         */
        location?: integer;
        /**
         * Editing commands to send with the key event (e.g., 'selectAll') (default: []).
         * These are related to but not equal the command names used in `document.execCommand` and NSStandardKeyBindingResponding.
         * See https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/editing/commands/editor_command_names.h for valid command names.
         */
        commands?: string[];
    }
    interface InsertTextRequest {
        /**
         * The text to insert.
         */
        text: string;
    }
    interface ImeSetCompositionRequest {
        /**
         * The text to insert
         */
        text: string;
        /**
         * selection start
         */
        selectionStart: integer;
        /**
         * selection end
         */
        selectionEnd: integer;
        /**
         * replacement start
         */
        replacementStart?: integer;
        /**
         * replacement end
         */
        replacementEnd?: integer;
    }
    const enum DispatchMouseEventRequestType {
        MousePressed = "mousePressed",
        MouseReleased = "mouseReleased",
        MouseMoved = "mouseMoved",
        MouseWheel = "mouseWheel"
    }
    const enum DispatchMouseEventRequestPointerType {
        Mouse = "mouse",
        Pen = "pen"
    }
    interface DispatchMouseEventRequest {
        /**
         * Type of the mouse event.
         */
        type: DispatchMouseEventRequestType;
        /**
         * X coordinate of the event relative to the main frame's viewport in CSS pixels.
         */
        x: number;
        /**
         * Y coordinate of the event relative to the main frame's viewport in CSS pixels. 0 refers to
         * the top of the viewport and Y increases as it proceeds towards the bottom of the viewport.
         */
        y: number;
        /**
         * Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8
         * (default: 0).
         */
        modifiers?: integer;
        /**
         * Time at which the event occurred.
         */
        timestamp?: TimeSinceEpoch;
        /**
         * Mouse button (default: "none").
         */
        button?: MouseButton;
        /**
         * A number indicating which buttons are pressed on the mouse when a mouse event is triggered.
         * Left=1, Right=2, Middle=4, Back=8, Forward=16, None=0.
         */
        buttons?: integer;
        /**
         * Number of times the mouse button was clicked (default: 0).
         */
        clickCount?: integer;
        /**
         * The normalized pressure, which has a range of [0,1] (default: 0).
         */
        force?: number;
        /**
         * The normalized tangential pressure, which has a range of [-1,1] (default: 0).
         */
        tangentialPressure?: number;
        /**
         * The plane angle between the Y-Z plane and the plane containing both the stylus axis and the Y axis, in degrees of the range [-90,90], a positive tiltX is to the right (default: 0).
         */
        tiltX?: number;
        /**
         * The plane angle between the X-Z plane and the plane containing both the stylus axis and the X axis, in degrees of the range [-90,90], a positive tiltY is towards the user (default: 0).
         */
        tiltY?: number;
        /**
         * The clockwise rotation of a pen stylus around its own major axis, in degrees in the range [0,359] (default: 0).
         */
        twist?: integer;
        /**
         * X delta in CSS pixels for mouse wheel event (default: 0).
         */
        deltaX?: number;
        /**
         * Y delta in CSS pixels for mouse wheel event (default: 0).
         */
        deltaY?: number;
        /**
         * Pointer type (default: "mouse").
         */
        pointerType?: DispatchMouseEventRequestPointerType;
    }
    const enum DispatchTouchEventRequestType {
        TouchStart = "touchStart",
        TouchEnd = "touchEnd",
        TouchMove = "touchMove",
        TouchCancel = "touchCancel"
    }
    interface DispatchTouchEventRequest {
        /**
         * Type of the touch event. TouchEnd and TouchCancel must not contain any touch points, while
         * TouchStart and TouchMove must contains at least one.
         */
        type: DispatchTouchEventRequestType;
        /**
         * Active touch points on the touch device. One event per any changed point (compared to
         * previous touch event in a sequence) is generated, emulating pressing/moving/releasing points
         * one by one.
         */
        touchPoints: TouchPoint[];
        /**
         * Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8
         * (default: 0).
         */
        modifiers?: integer;
        /**
         * Time at which the event occurred.
         */
        timestamp?: TimeSinceEpoch;
    }
    const enum EmulateTouchFromMouseEventRequestType {
        MousePressed = "mousePressed",
        MouseReleased = "mouseReleased",
        MouseMoved = "mouseMoved",
        MouseWheel = "mouseWheel"
    }
    interface EmulateTouchFromMouseEventRequest {
        /**
         * Type of the mouse event.
         */
        type: EmulateTouchFromMouseEventRequestType;
        /**
         * X coordinate of the mouse pointer in DIP.
         */
        x: integer;
        /**
         * Y coordinate of the mouse pointer in DIP.
         */
        y: integer;
        /**
         * Mouse button. Only "none", "left", "right" are supported.
         */
        button: MouseButton;
        /**
         * Time at which the event occurred (default: current time).
         */
        timestamp?: TimeSinceEpoch;
        /**
         * X delta in DIP for mouse wheel event (default: 0).
         */
        deltaX?: number;
        /**
         * Y delta in DIP for mouse wheel event (default: 0).
         */
        deltaY?: number;
        /**
         * Bit field representing pressed modifier keys. Alt=1, Ctrl=2, Meta/Command=4, Shift=8
         * (default: 0).
         */
        modifiers?: integer;
        /**
         * Number of times the mouse button was clicked (default: 0).
         */
        clickCount?: integer;
    }
    interface SetIgnoreInputEventsRequest {
        /**
         * Ignores input events processing when set to true.
         */
        ignore: boolean;
    }
    interface SetInterceptDragsRequest {
        enabled: boolean;
    }
    interface SynthesizePinchGestureRequest {
        /**
         * X coordinate of the start of the gesture in CSS pixels.
         */
        x: number;
        /**
         * Y coordinate of the start of the gesture in CSS pixels.
         */
        y: number;
        /**
         * Relative scale factor after zooming (>1.0 zooms in, <1.0 zooms out).
         */
        scaleFactor: number;
        /**
         * Relative pointer speed in pixels per second (default: 800).
         */
        relativeSpeed?: integer;
        /**
         * Which type of input events to be generated (default: 'default', which queries the platform
         * for the preferred input type).
         */
        gestureSourceType?: GestureSourceType;
    }
    interface SynthesizeScrollGestureRequest {
        /**
         * X coordinate of the start of the gesture in CSS pixels.
         */
        x: number;
        /**
         * Y coordinate of the start of the gesture in CSS pixels.
         */
        y: number;
        /**
         * The distance to scroll along the X axis (positive to scroll left).
         */
        xDistance?: number;
        /**
         * The distance to scroll along the Y axis (positive to scroll up).
         */
        yDistance?: number;
        /**
         * The number of additional pixels to scroll back along the X axis, in addition to the given
         * distance.
         */
        xOverscroll?: number;
        /**
         * The number of additional pixels to scroll back along the Y axis, in addition to the given
         * distance.
         */
        yOverscroll?: number;
        /**
         * Prevent fling (default: true).
         */
        preventFling?: boolean;
        /**
         * Swipe speed in pixels per second (default: 800).
         */
        speed?: integer;
        /**
         * Which type of input events to be generated (default: 'default', which queries the platform
         * for the preferred input type).
         */
        gestureSourceType?: GestureSourceType;
        /**
         * The number of times to repeat the gesture (default: 0).
         */
        repeatCount?: integer;
        /**
         * The number of milliseconds delay between each repeat. (default: 250).
         */
        repeatDelayMs?: integer;
        /**
         * The name of the interaction markers to generate, if not empty (default: "").
         */
        interactionMarkerName?: string;
    }
    interface SynthesizeTapGestureRequest {
        /**
         * X coordinate of the start of the gesture in CSS pixels.
         */
        x: number;
        /**
         * Y coordinate of the start of the gesture in CSS pixels.
         */
        y: number;
        /**
         * Duration between touchdown and touchup events in ms (default: 50).
         */
        duration?: integer;
        /**
         * Number of times to perform the tap (e.g. 2 for double tap, default: 1).
         */
        tapCount?: integer;
        /**
         * Which type of input events to be generated (default: 'default', which queries the platform
         * for the preferred input type).
         */
        gestureSourceType?: GestureSourceType;
    }
    /**
     * Emitted only when `Input.setInterceptDrags` is enabled. Use this data with `Input.dispatchDragEvent` to
     * restore normal drag and drop behavior.
     */
    interface DragInterceptedEvent {
        data: DragData;
    }
}
export declare namespace Inspector {
    /**
     * Fired when remote debugging connection is about to be terminated. Contains detach reason.
     */
    interface DetachedEvent {
        /**
         * The reason why connection has been terminated.
         */
        reason: string;
    }
}
export declare namespace LayerTree {
    /**
     * Unique Layer identifier.
     */
    type LayerId = OpaqueIdentifier<string, 'Protocol.LayerTree.LayerId'>;
    /**
     * Unique snapshot identifier.
     */
    type SnapshotId = OpaqueIdentifier<string, 'Protocol.LayerTree.SnapshotId'>;
    const enum ScrollRectType {
        RepaintsOnScroll = "RepaintsOnScroll",
        TouchEventHandler = "TouchEventHandler",
        WheelEventHandler = "WheelEventHandler"
    }
    /**
     * Rectangle where scrolling happens on the main thread.
     */
    interface ScrollRect {
        /**
         * Rectangle itself.
         */
        rect: DOM.Rect;
        /**
         * Reason for rectangle to force scrolling on the main thread
         */
        type: ScrollRectType;
    }
    /**
     * Sticky position constraints.
     */
    interface StickyPositionConstraint {
        /**
         * Layout rectangle of the sticky element before being shifted
         */
        stickyBoxRect: DOM.Rect;
        /**
         * Layout rectangle of the containing block of the sticky element
         */
        containingBlockRect: DOM.Rect;
        /**
         * The nearest sticky layer that shifts the sticky box
         */
        nearestLayerShiftingStickyBox?: LayerId;
        /**
         * The nearest sticky layer that shifts the containing block
         */
        nearestLayerShiftingContainingBlock?: LayerId;
    }
    /**
     * Serialized fragment of layer picture along with its offset within the layer.
     */
    interface PictureTile {
        /**
         * Offset from owning layer left boundary
         */
        x: number;
        /**
         * Offset from owning layer top boundary
         */
        y: number;
        /**
         * Base64-encoded snapshot data.
         */
        picture: binary;
    }
    /**
     * Information about a compositing layer.
     */
    interface Layer {
        /**
         * The unique id for this layer.
         */
        layerId: LayerId;
        /**
         * The id of parent (not present for root).
         */
        parentLayerId?: LayerId;
        /**
         * The backend id for the node associated with this layer.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * Offset from parent layer, X coordinate.
         */
        offsetX: number;
        /**
         * Offset from parent layer, Y coordinate.
         */
        offsetY: number;
        /**
         * Layer width.
         */
        width: number;
        /**
         * Layer height.
         */
        height: number;
        /**
         * Transformation matrix for layer, default is identity matrix
         */
        transform?: number[];
        /**
         * Transform anchor point X, absent if no transform specified
         */
        anchorX?: number;
        /**
         * Transform anchor point Y, absent if no transform specified
         */
        anchorY?: number;
        /**
         * Transform anchor point Z, absent if no transform specified
         */
        anchorZ?: number;
        /**
         * Indicates how many time this layer has painted.
         */
        paintCount: integer;
        /**
         * Indicates whether this layer hosts any content, rather than being used for
         * transform/scrolling purposes only.
         */
        drawsContent: boolean;
        /**
         * Set if layer is not visible.
         */
        invisible?: boolean;
        /**
         * Rectangles scrolling on main thread only.
         */
        scrollRects?: ScrollRect[];
        /**
         * Sticky position constraint information
         */
        stickyPositionConstraint?: StickyPositionConstraint;
    }
    /**
     * Array of timings, one per paint step.
     */
    type PaintProfile = number[];
    interface CompositingReasonsRequest {
        /**
         * The id of the layer for which we want to get the reasons it was composited.
         */
        layerId: LayerId;
    }
    interface CompositingReasonsResponse extends ProtocolResponseWithError {
        /**
         * A list of strings specifying reasons for the given layer to become composited.
         */
        compositingReasons: string[];
        /**
         * A list of strings specifying reason IDs for the given layer to become composited.
         */
        compositingReasonIds: string[];
    }
    interface LoadSnapshotRequest {
        /**
         * An array of tiles composing the snapshot.
         */
        tiles: PictureTile[];
    }
    interface LoadSnapshotResponse extends ProtocolResponseWithError {
        /**
         * The id of the snapshot.
         */
        snapshotId: SnapshotId;
    }
    interface MakeSnapshotRequest {
        /**
         * The id of the layer.
         */
        layerId: LayerId;
    }
    interface MakeSnapshotResponse extends ProtocolResponseWithError {
        /**
         * The id of the layer snapshot.
         */
        snapshotId: SnapshotId;
    }
    interface ProfileSnapshotRequest {
        /**
         * The id of the layer snapshot.
         */
        snapshotId: SnapshotId;
        /**
         * The maximum number of times to replay the snapshot (1, if not specified).
         */
        minRepeatCount?: integer;
        /**
         * The minimum duration (in seconds) to replay the snapshot.
         */
        minDuration?: number;
        /**
         * The clip rectangle to apply when replaying the snapshot.
         */
        clipRect?: DOM.Rect;
    }
    interface ProfileSnapshotResponse extends ProtocolResponseWithError {
        /**
         * The array of paint profiles, one per run.
         */
        timings: PaintProfile[];
    }
    interface ReleaseSnapshotRequest {
        /**
         * The id of the layer snapshot.
         */
        snapshotId: SnapshotId;
    }
    interface ReplaySnapshotRequest {
        /**
         * The id of the layer snapshot.
         */
        snapshotId: SnapshotId;
        /**
         * The first step to replay from (replay from the very start if not specified).
         */
        fromStep?: integer;
        /**
         * The last step to replay to (replay till the end if not specified).
         */
        toStep?: integer;
        /**
         * The scale to apply while replaying (defaults to 1).
         */
        scale?: number;
    }
    interface ReplaySnapshotResponse extends ProtocolResponseWithError {
        /**
         * A data: URL for resulting image.
         */
        dataURL: string;
    }
    interface SnapshotCommandLogRequest {
        /**
         * The id of the layer snapshot.
         */
        snapshotId: SnapshotId;
    }
    interface SnapshotCommandLogResponse extends ProtocolResponseWithError {
        /**
         * The array of canvas function calls.
         */
        commandLog: any[];
    }
    interface LayerPaintedEvent {
        /**
         * The id of the painted layer.
         */
        layerId: LayerId;
        /**
         * Clip rectangle.
         */
        clip: DOM.Rect;
    }
    interface LayerTreeDidChangeEvent {
        /**
         * Layer tree, absent if not in the compositing mode.
         */
        layers?: Layer[];
    }
}
/**
 * Provides access to log entries.
 */
export declare namespace Log {
    const enum LogEntrySource {
        XML = "xml",
        Javascript = "javascript",
        Network = "network",
        Storage = "storage",
        Appcache = "appcache",
        Rendering = "rendering",
        Security = "security",
        Deprecation = "deprecation",
        Worker = "worker",
        Violation = "violation",
        Intervention = "intervention",
        Recommendation = "recommendation",
        Other = "other"
    }
    const enum LogEntryLevel {
        Verbose = "verbose",
        Info = "info",
        Warning = "warning",
        Error = "error"
    }
    const enum LogEntryCategory {
        Cors = "cors"
    }
    /**
     * Log entry.
     */
    interface LogEntry {
        /**
         * Log entry source.
         */
        source: LogEntrySource;
        /**
         * Log entry severity.
         */
        level: LogEntryLevel;
        /**
         * Logged text.
         */
        text: string;
        category?: LogEntryCategory;
        /**
         * Timestamp when this entry was added.
         */
        timestamp: Runtime.Timestamp;
        /**
         * URL of the resource if known.
         */
        url?: string;
        /**
         * Line number in the resource.
         */
        lineNumber?: integer;
        /**
         * JavaScript stack trace.
         */
        stackTrace?: Runtime.StackTrace;
        /**
         * Identifier of the network request associated with this entry.
         */
        networkRequestId?: Network.RequestId;
        /**
         * Identifier of the worker associated with this entry.
         */
        workerId?: string;
        /**
         * Call arguments.
         */
        args?: Runtime.RemoteObject[];
    }
    const enum ViolationSettingName {
        LongTask = "longTask",
        LongLayout = "longLayout",
        BlockedEvent = "blockedEvent",
        BlockedParser = "blockedParser",
        DiscouragedAPIUse = "discouragedAPIUse",
        Handler = "handler",
        RecurringHandler = "recurringHandler"
    }
    /**
     * Violation configuration setting.
     */
    interface ViolationSetting {
        /**
         * Violation type.
         */
        name: ViolationSettingName;
        /**
         * Time threshold to trigger upon.
         */
        threshold: number;
    }
    interface StartViolationsReportRequest {
        /**
         * Configuration for violations.
         */
        config: ViolationSetting[];
    }
    /**
     * Issued when new message was logged.
     */
    interface EntryAddedEvent {
        /**
         * The entry.
         */
        entry: LogEntry;
    }
}
/**
 * This domain allows detailed inspection of media elements.
 */
export declare namespace Media {
    /**
     * Players will get an ID that is unique within the agent context.
     */
    type PlayerId = OpaqueIdentifier<string, 'Protocol.Media.PlayerId'>;
    type Timestamp = number;
    const enum PlayerMessageLevel {
        Error = "error",
        Warning = "warning",
        Info = "info",
        Debug = "debug"
    }
    /**
     * Have one type per entry in MediaLogRecord::Type
     * Corresponds to kMessage
     */
    interface PlayerMessage {
        /**
         * Keep in sync with MediaLogMessageLevel
         * We are currently keeping the message level 'error' separate from the
         * PlayerError type because right now they represent different things,
         * this one being a DVLOG(ERROR) style log message that gets printed
         * based on what log level is selected in the UI, and the other is a
         * representation of a media::PipelineStatus object. Soon however we're
         * going to be moving away from using PipelineStatus for errors and
         * introducing a new error type which should hopefully let us integrate
         * the error log level into the PlayerError type.
         */
        level: PlayerMessageLevel;
        message: string;
    }
    /**
     * Corresponds to kMediaPropertyChange
     */
    interface PlayerProperty {
        name: string;
        value: string;
    }
    /**
     * Corresponds to kMediaEventTriggered
     */
    interface PlayerEvent {
        timestamp: Timestamp;
        value: string;
    }
    /**
     * Represents logged source line numbers reported in an error.
     * NOTE: file and line are from chromium c++ implementation code, not js.
     */
    interface PlayerErrorSourceLocation {
        file: string;
        line: integer;
    }
    /**
     * Corresponds to kMediaError
     */
    interface PlayerError {
        errorType: string;
        /**
         * Code is the numeric enum entry for a specific set of error codes, such
         * as PipelineStatusCodes in media/base/pipeline_status.h
         */
        code: integer;
        /**
         * A trace of where this error was caused / where it passed through.
         */
        stack: PlayerErrorSourceLocation[];
        /**
         * Errors potentially have a root cause error, ie, a DecoderError might be
         * caused by an WindowsError
         */
        cause: PlayerError[];
        /**
         * Extra data attached to an error, such as an HRESULT, Video Codec, etc.
         */
        data: any;
    }
    interface Player {
        playerId: PlayerId;
        domNodeId?: DOM.BackendNodeId;
    }
    /**
     * This can be called multiple times, and can be used to set / override /
     * remove player properties. A null propValue indicates removal.
     */
    interface PlayerPropertiesChangedEvent {
        playerId: PlayerId;
        properties: PlayerProperty[];
    }
    /**
     * Send events as a list, allowing them to be batched on the browser for less
     * congestion. If batched, events must ALWAYS be in chronological order.
     */
    interface PlayerEventsAddedEvent {
        playerId: PlayerId;
        events: PlayerEvent[];
    }
    /**
     * Send a list of any messages that need to be delivered.
     */
    interface PlayerMessagesLoggedEvent {
        playerId: PlayerId;
        messages: PlayerMessage[];
    }
    /**
     * Send a list of any errors that need to be delivered.
     */
    interface PlayerErrorsRaisedEvent {
        playerId: PlayerId;
        errors: PlayerError[];
    }
    /**
     * Called whenever a player is created, or when a new agent joins and receives
     * a list of active players. If an agent is restored, it will receive one
     * event for each active player.
     */
    interface PlayerCreatedEvent {
        player: Player;
    }
}
export declare namespace Memory {
    /**
     * Memory pressure level.
     */
    const enum PressureLevel {
        Moderate = "moderate",
        Critical = "critical"
    }
    /**
     * Heap profile sample.
     */
    interface SamplingProfileNode {
        /**
         * Size of the sampled allocation.
         */
        size: number;
        /**
         * Total bytes attributed to this sample.
         */
        total: number;
        /**
         * Execution stack at the point of allocation.
         */
        stack: string[];
    }
    /**
     * Array of heap profile samples.
     */
    interface SamplingProfile {
        samples: SamplingProfileNode[];
        modules: Module[];
    }
    /**
     * Executable module information
     */
    interface Module {
        /**
         * Name of the module.
         */
        name: string;
        /**
         * UUID of the module.
         */
        uuid: string;
        /**
         * Base address where the module is loaded into memory. Encoded as a decimal
         * or hexadecimal (0x prefixed) string.
         */
        baseAddress: string;
        /**
         * Size of the module in bytes.
         */
        size: number;
    }
    /**
     * DOM object counter data.
     */
    interface DOMCounter {
        /**
         * Object name. Note: object names should be presumed volatile and clients should not expect
         * the returned names to be consistent across runs.
         */
        name: string;
        /**
         * Object count.
         */
        count: integer;
    }
    interface GetDOMCountersResponse extends ProtocolResponseWithError {
        documents: integer;
        nodes: integer;
        jsEventListeners: integer;
    }
    interface GetDOMCountersForLeakDetectionResponse extends ProtocolResponseWithError {
        /**
         * DOM object counters.
         */
        counters: DOMCounter[];
    }
    interface SetPressureNotificationsSuppressedRequest {
        /**
         * If true, memory pressure notifications will be suppressed.
         */
        suppressed: boolean;
    }
    interface SimulatePressureNotificationRequest {
        /**
         * Memory pressure level of the notification.
         */
        level: PressureLevel;
    }
    interface StartSamplingRequest {
        /**
         * Average number of bytes between samples.
         */
        samplingInterval?: integer;
        /**
         * Do not randomize intervals between samples.
         */
        suppressRandomness?: boolean;
    }
    interface GetAllTimeSamplingProfileResponse extends ProtocolResponseWithError {
        profile: SamplingProfile;
    }
    interface GetBrowserSamplingProfileResponse extends ProtocolResponseWithError {
        profile: SamplingProfile;
    }
    interface GetSamplingProfileResponse extends ProtocolResponseWithError {
        profile: SamplingProfile;
    }
}
/**
 * Network domain allows tracking network activities of the page. It exposes information about http,
 * file, data and other requests and responses, their headers, bodies, timing, etc.
 */
export declare namespace Network {
    /**
     * Resource type as it was perceived by the rendering engine.
     */
    const enum ResourceType {
        Document = "Document",
        Stylesheet = "Stylesheet",
        Image = "Image",
        Media = "Media",
        Font = "Font",
        Script = "Script",
        TextTrack = "TextTrack",
        XHR = "XHR",
        Fetch = "Fetch",
        Prefetch = "Prefetch",
        EventSource = "EventSource",
        WebSocket = "WebSocket",
        Manifest = "Manifest",
        SignedExchange = "SignedExchange",
        Ping = "Ping",
        CSPViolationReport = "CSPViolationReport",
        Preflight = "Preflight",
        FedCM = "FedCM",
        Other = "Other"
    }
    /**
     * Unique loader identifier.
     */
    type LoaderId = OpaqueIdentifier<string, 'Protocol.Network.LoaderId'>;
    /**
     * Unique network request identifier.
     * Note that this does not identify individual HTTP requests that are part of
     * a network request.
     */
    type RequestId = OpaqueIdentifier<string, 'Protocol.Network.RequestId'>;
    /**
     * Network level fetch failure reason.
     */
    const enum ErrorReason {
        Failed = "Failed",
        Aborted = "Aborted",
        TimedOut = "TimedOut",
        AccessDenied = "AccessDenied",
        ConnectionClosed = "ConnectionClosed",
        ConnectionReset = "ConnectionReset",
        ConnectionRefused = "ConnectionRefused",
        ConnectionAborted = "ConnectionAborted",
        ConnectionFailed = "ConnectionFailed",
        NameNotResolved = "NameNotResolved",
        InternetDisconnected = "InternetDisconnected",
        AddressUnreachable = "AddressUnreachable",
        BlockedByClient = "BlockedByClient",
        BlockedByResponse = "BlockedByResponse"
    }
    /**
     * UTC time in seconds, counted from January 1, 1970.
     */
    type TimeSinceEpoch = number;
    /**
     * Monotonically increasing time in seconds since an arbitrary point in the past.
     */
    type MonotonicTime = number;
    /**
     * Request / response headers as keys / values of JSON object.
     */
    interface Headers {
        [key: string]: string;
    }
    /**
     * The underlying connection technology that the browser is supposedly using.
     */
    const enum ConnectionType {
        None = "none",
        Cellular2g = "cellular2g",
        Cellular3g = "cellular3g",
        Cellular4g = "cellular4g",
        Bluetooth = "bluetooth",
        Ethernet = "ethernet",
        Wifi = "wifi",
        Wimax = "wimax",
        Other = "other"
    }
    /**
     * Represents the cookie's 'SameSite' status:
     * https://tools.ietf.org/html/draft-west-first-party-cookies
     */
    const enum CookieSameSite {
        Strict = "Strict",
        Lax = "Lax",
        None = "None"
    }
    /**
     * Represents the cookie's 'Priority' status:
     * https://tools.ietf.org/html/draft-west-cookie-priority-00
     */
    const enum CookiePriority {
        Low = "Low",
        Medium = "Medium",
        High = "High"
    }
    /**
     * Represents the source scheme of the origin that originally set the cookie.
     * A value of "Unset" allows protocol clients to emulate legacy cookie scope for the scheme.
     * This is a temporary ability and it will be removed in the future.
     */
    const enum CookieSourceScheme {
        Unset = "Unset",
        NonSecure = "NonSecure",
        Secure = "Secure"
    }
    /**
     * Timing information for the request.
     */
    interface ResourceTiming {
        /**
         * Timing's requestTime is a baseline in seconds, while the other numbers are ticks in
         * milliseconds relatively to this requestTime.
         */
        requestTime: number;
        /**
         * Started resolving proxy.
         */
        proxyStart: number;
        /**
         * Finished resolving proxy.
         */
        proxyEnd: number;
        /**
         * Started DNS address resolve.
         */
        dnsStart: number;
        /**
         * Finished DNS address resolve.
         */
        dnsEnd: number;
        /**
         * Started connecting to the remote host.
         */
        connectStart: number;
        /**
         * Connected to the remote host.
         */
        connectEnd: number;
        /**
         * Started SSL handshake.
         */
        sslStart: number;
        /**
         * Finished SSL handshake.
         */
        sslEnd: number;
        /**
         * Started running ServiceWorker.
         */
        workerStart: number;
        /**
         * Finished Starting ServiceWorker.
         */
        workerReady: number;
        /**
         * Started fetch event.
         */
        workerFetchStart: number;
        /**
         * Settled fetch event respondWith promise.
         */
        workerRespondWithSettled: number;
        /**
         * Started ServiceWorker static routing source evaluation.
         */
        workerRouterEvaluationStart?: number;
        /**
         * Started cache lookup when the source was evaluated to `cache`.
         */
        workerCacheLookupStart?: number;
        /**
         * Started sending request.
         */
        sendStart: number;
        /**
         * Finished sending request.
         */
        sendEnd: number;
        /**
         * Time the server started pushing request.
         */
        pushStart: number;
        /**
         * Time the server finished pushing request.
         */
        pushEnd: number;
        /**
         * Started receiving response headers.
         */
        receiveHeadersStart: number;
        /**
         * Finished receiving response headers.
         */
        receiveHeadersEnd: number;
    }
    /**
     * Loading priority of a resource request.
     */
    const enum ResourcePriority {
        VeryLow = "VeryLow",
        Low = "Low",
        Medium = "Medium",
        High = "High",
        VeryHigh = "VeryHigh"
    }
    /**
     * The render-blocking behavior of a resource request.
     */
    const enum RenderBlockingBehavior {
        Blocking = "Blocking",
        InBodyParserBlocking = "InBodyParserBlocking",
        NonBlocking = "NonBlocking",
        NonBlockingDynamic = "NonBlockingDynamic",
        PotentiallyBlocking = "PotentiallyBlocking"
    }
    /**
     * Post data entry for HTTP request
     */
    interface PostDataEntry {
        bytes?: binary;
    }
    const enum RequestReferrerPolicy {
        UnsafeUrl = "unsafe-url",
        NoReferrerWhenDowngrade = "no-referrer-when-downgrade",
        NoReferrer = "no-referrer",
        Origin = "origin",
        OriginWhenCrossOrigin = "origin-when-cross-origin",
        SameOrigin = "same-origin",
        StrictOrigin = "strict-origin",
        StrictOriginWhenCrossOrigin = "strict-origin-when-cross-origin"
    }
    /**
     * HTTP request data.
     */
    interface Request {
        /**
         * Request URL (without fragment).
         */
        url: string;
        /**
         * Fragment of the requested URL starting with hash, if present.
         */
        urlFragment?: string;
        /**
         * HTTP request method.
         */
        method: string;
        /**
         * HTTP request headers.
         */
        headers: Headers;
        /**
         * HTTP POST request data.
         * Use postDataEntries instead.
         * @deprecated
         */
        postData?: string;
        /**
         * True when the request has POST data. Note that postData might still be omitted when this flag is true when the data is too long.
         */
        hasPostData?: boolean;
        /**
         * Request body elements (post data broken into individual entries).
         */
        postDataEntries?: PostDataEntry[];
        /**
         * The mixed content type of the request.
         */
        mixedContentType?: Security.MixedContentType;
        /**
         * Priority of the resource request at the time request is sent.
         */
        initialPriority: ResourcePriority;
        /**
         * The referrer policy of the request, as defined in https://www.w3.org/TR/referrer-policy/
         */
        referrerPolicy: RequestReferrerPolicy;
        /**
         * Whether is loaded via link preload.
         */
        isLinkPreload?: boolean;
        /**
         * Set for requests when the TrustToken API is used. Contains the parameters
         * passed by the developer (e.g. via "fetch") as understood by the backend.
         */
        trustTokenParams?: TrustTokenParams;
        /**
         * True if this resource request is considered to be the 'same site' as the
         * request corresponding to the main frame.
         */
        isSameSite?: boolean;
        /**
         * True when the resource request is ad-related.
         */
        isAdRelated?: boolean;
    }
    /**
     * Details of a signed certificate timestamp (SCT).
     */
    interface SignedCertificateTimestamp {
        /**
         * Validation status.
         */
        status: string;
        /**
         * Origin.
         */
        origin: string;
        /**
         * Log name / description.
         */
        logDescription: string;
        /**
         * Log ID.
         */
        logId: string;
        /**
         * Issuance date. Unlike TimeSinceEpoch, this contains the number of
         * milliseconds since January 1, 1970, UTC, not the number of seconds.
         */
        timestamp: number;
        /**
         * Hash algorithm.
         */
        hashAlgorithm: string;
        /**
         * Signature algorithm.
         */
        signatureAlgorithm: string;
        /**
         * Signature data.
         */
        signatureData: string;
    }
    /**
     * Security details about a request.
     */
    interface SecurityDetails {
        /**
         * Protocol name (e.g. "TLS 1.2" or "QUIC").
         */
        protocol: string;
        /**
         * Key Exchange used by the connection, or the empty string if not applicable.
         */
        keyExchange: string;
        /**
         * (EC)DH group used by the connection, if applicable.
         */
        keyExchangeGroup?: string;
        /**
         * Cipher name.
         */
        cipher: string;
        /**
         * TLS MAC. Note that AEAD ciphers do not have separate MACs.
         */
        mac?: string;
        /**
         * Certificate ID value.
         */
        certificateId: Security.CertificateId;
        /**
         * Certificate subject name.
         */
        subjectName: string;
        /**
         * Subject Alternative Name (SAN) DNS names and IP addresses.
         */
        sanList: string[];
        /**
         * Name of the issuing CA.
         */
        issuer: string;
        /**
         * Certificate valid from date.
         */
        validFrom: TimeSinceEpoch;
        /**
         * Certificate valid to (expiration) date
         */
        validTo: TimeSinceEpoch;
        /**
         * List of signed certificate timestamps (SCTs).
         */
        signedCertificateTimestampList: SignedCertificateTimestamp[];
        /**
         * Whether the request complied with Certificate Transparency policy
         */
        certificateTransparencyCompliance: CertificateTransparencyCompliance;
        /**
         * The signature algorithm used by the server in the TLS server signature,
         * represented as a TLS SignatureScheme code point. Omitted if not
         * applicable or not known.
         */
        serverSignatureAlgorithm?: integer;
        /**
         * Whether the connection used Encrypted ClientHello
         */
        encryptedClientHello: boolean;
    }
    /**
     * Whether the request complied with Certificate Transparency policy.
     */
    const enum CertificateTransparencyCompliance {
        Unknown = "unknown",
        NotCompliant = "not-compliant",
        Compliant = "compliant"
    }
    /**
     * The reason why request was blocked.
     */
    const enum BlockedReason {
        Other = "other",
        Csp = "csp",
        MixedContent = "mixed-content",
        Origin = "origin",
        Inspector = "inspector",
        Integrity = "integrity",
        SubresourceFilter = "subresource-filter",
        ContentType = "content-type",
        CoepFrameResourceNeedsCoepHeader = "coep-frame-resource-needs-coep-header",
        CoopSandboxedIframeCannotNavigateToCoopPage = "coop-sandboxed-iframe-cannot-navigate-to-coop-page",
        CorpNotSameOrigin = "corp-not-same-origin",
        CorpNotSameOriginAfterDefaultedToSameOriginByCoep = "corp-not-same-origin-after-defaulted-to-same-origin-by-coep",
        CorpNotSameOriginAfterDefaultedToSameOriginByDip = "corp-not-same-origin-after-defaulted-to-same-origin-by-dip",
        CorpNotSameOriginAfterDefaultedToSameOriginByCoepAndDip = "corp-not-same-origin-after-defaulted-to-same-origin-by-coep-and-dip",
        CorpNotSameSite = "corp-not-same-site",
        SriMessageSignatureMismatch = "sri-message-signature-mismatch"
    }
    /**
     * The reason why request was blocked.
     */
    const enum CorsError {
        DisallowedByMode = "DisallowedByMode",
        InvalidResponse = "InvalidResponse",
        WildcardOriginNotAllowed = "WildcardOriginNotAllowed",
        MissingAllowOriginHeader = "MissingAllowOriginHeader",
        MultipleAllowOriginValues = "MultipleAllowOriginValues",
        InvalidAllowOriginValue = "InvalidAllowOriginValue",
        AllowOriginMismatch = "AllowOriginMismatch",
        InvalidAllowCredentials = "InvalidAllowCredentials",
        CorsDisabledScheme = "CorsDisabledScheme",
        PreflightInvalidStatus = "PreflightInvalidStatus",
        PreflightDisallowedRedirect = "PreflightDisallowedRedirect",
        PreflightWildcardOriginNotAllowed = "PreflightWildcardOriginNotAllowed",
        PreflightMissingAllowOriginHeader = "PreflightMissingAllowOriginHeader",
        PreflightMultipleAllowOriginValues = "PreflightMultipleAllowOriginValues",
        PreflightInvalidAllowOriginValue = "PreflightInvalidAllowOriginValue",
        PreflightAllowOriginMismatch = "PreflightAllowOriginMismatch",
        PreflightInvalidAllowCredentials = "PreflightInvalidAllowCredentials",
        PreflightMissingAllowExternal = "PreflightMissingAllowExternal",
        PreflightInvalidAllowExternal = "PreflightInvalidAllowExternal",
        InvalidAllowMethodsPreflightResponse = "InvalidAllowMethodsPreflightResponse",
        InvalidAllowHeadersPreflightResponse = "InvalidAllowHeadersPreflightResponse",
        MethodDisallowedByPreflightResponse = "MethodDisallowedByPreflightResponse",
        HeaderDisallowedByPreflightResponse = "HeaderDisallowedByPreflightResponse",
        RedirectContainsCredentials = "RedirectContainsCredentials",
        InsecureLocalNetwork = "InsecureLocalNetwork",
        InvalidLocalNetworkAccess = "InvalidLocalNetworkAccess",
        NoCorsRedirectModeNotFollow = "NoCorsRedirectModeNotFollow",
        LocalNetworkAccessPermissionDenied = "LocalNetworkAccessPermissionDenied"
    }
    interface CorsErrorStatus {
        corsError: CorsError;
        failedParameter: string;
    }
    /**
     * Source of serviceworker response.
     */
    const enum ServiceWorkerResponseSource {
        CacheStorage = "cache-storage",
        HttpCache = "http-cache",
        FallbackCode = "fallback-code",
        Network = "network"
    }
    const enum TrustTokenParamsRefreshPolicy {
        UseCached = "UseCached",
        Refresh = "Refresh"
    }
    /**
     * Determines what type of Trust Token operation is executed and
     * depending on the type, some additional parameters. The values
     * are specified in third_party/blink/renderer/core/fetch/trust_token.idl.
     */
    interface TrustTokenParams {
        operation: TrustTokenOperationType;
        /**
         * Only set for "token-redemption" operation and determine whether
         * to request a fresh SRR or use a still valid cached SRR.
         */
        refreshPolicy: TrustTokenParamsRefreshPolicy;
        /**
         * Origins of issuers from whom to request tokens or redemption
         * records.
         */
        issuers?: string[];
    }
    const enum TrustTokenOperationType {
        Issuance = "Issuance",
        Redemption = "Redemption",
        Signing = "Signing"
    }
    /**
     * The reason why Chrome uses a specific transport protocol for HTTP semantics.
     */
    const enum AlternateProtocolUsage {
        AlternativeJobWonWithoutRace = "alternativeJobWonWithoutRace",
        AlternativeJobWonRace = "alternativeJobWonRace",
        MainJobWonRace = "mainJobWonRace",
        MappingMissing = "mappingMissing",
        Broken = "broken",
        DnsAlpnH3JobWonWithoutRace = "dnsAlpnH3JobWonWithoutRace",
        DnsAlpnH3JobWonRace = "dnsAlpnH3JobWonRace",
        UnspecifiedReason = "unspecifiedReason"
    }
    /**
     * Source of service worker router.
     */
    const enum ServiceWorkerRouterSource {
        Network = "network",
        Cache = "cache",
        FetchEvent = "fetch-event",
        RaceNetworkAndFetchHandler = "race-network-and-fetch-handler",
        RaceNetworkAndCache = "race-network-and-cache"
    }
    interface ServiceWorkerRouterInfo {
        /**
         * ID of the rule matched. If there is a matched rule, this field will
         * be set, otherwiser no value will be set.
         */
        ruleIdMatched?: integer;
        /**
         * The router source of the matched rule. If there is a matched rule, this
         * field will be set, otherwise no value will be set.
         */
        matchedSourceType?: ServiceWorkerRouterSource;
        /**
         * The actual router source used.
         */
        actualSourceType?: ServiceWorkerRouterSource;
    }
    /**
     * HTTP response data.
     */
    interface Response {
        /**
         * Response URL. This URL can be different from CachedResource.url in case of redirect.
         */
        url: string;
        /**
         * HTTP response status code.
         */
        status: integer;
        /**
         * HTTP response status text.
         */
        statusText: string;
        /**
         * HTTP response headers.
         */
        headers: Headers;
        /**
         * HTTP response headers text. This has been replaced by the headers in Network.responseReceivedExtraInfo.
         * @deprecated
         */
        headersText?: string;
        /**
         * Resource mimeType as determined by the browser.
         */
        mimeType: string;
        /**
         * Resource charset as determined by the browser (if applicable).
         */
        charset: string;
        /**
         * Refined HTTP request headers that were actually transmitted over the network.
         */
        requestHeaders?: Headers;
        /**
         * HTTP request headers text. This has been replaced by the headers in Network.requestWillBeSentExtraInfo.
         * @deprecated
         */
        requestHeadersText?: string;
        /**
         * Specifies whether physical connection was actually reused for this request.
         */
        connectionReused: boolean;
        /**
         * Physical connection id that was actually used for this request.
         */
        connectionId: number;
        /**
         * Remote IP address.
         */
        remoteIPAddress?: string;
        /**
         * Remote port.
         */
        remotePort?: integer;
        /**
         * Specifies that the request was served from the disk cache.
         */
        fromDiskCache?: boolean;
        /**
         * Specifies that the request was served from the ServiceWorker.
         */
        fromServiceWorker?: boolean;
        /**
         * Specifies that the request was served from the prefetch cache.
         */
        fromPrefetchCache?: boolean;
        /**
         * Specifies that the request was served from the prefetch cache.
         */
        fromEarlyHints?: boolean;
        /**
         * Information about how ServiceWorker Static Router API was used. If this
         * field is set with `matchedSourceType` field, a matching rule is found.
         * If this field is set without `matchedSource`, no matching rule is found.
         * Otherwise, the API is not used.
         */
        serviceWorkerRouterInfo?: ServiceWorkerRouterInfo;
        /**
         * Total number of bytes received for this request so far.
         */
        encodedDataLength: number;
        /**
         * Timing information for the given request.
         */
        timing?: ResourceTiming;
        /**
         * Response source of response from ServiceWorker.
         */
        serviceWorkerResponseSource?: ServiceWorkerResponseSource;
        /**
         * The time at which the returned response was generated.
         */
        responseTime?: TimeSinceEpoch;
        /**
         * Cache Storage Cache Name.
         */
        cacheStorageCacheName?: string;
        /**
         * Protocol used to fetch this request.
         */
        protocol?: string;
        /**
         * The reason why Chrome uses a specific transport protocol for HTTP semantics.
         */
        alternateProtocolUsage?: AlternateProtocolUsage;
        /**
         * Security state of the request resource.
         */
        securityState: Security.SecurityState;
        /**
         * Security details for the request.
         */
        securityDetails?: SecurityDetails;
    }
    /**
     * WebSocket request data.
     */
    interface WebSocketRequest {
        /**
         * HTTP request headers.
         */
        headers: Headers;
    }
    /**
     * WebSocket response data.
     */
    interface WebSocketResponse {
        /**
         * HTTP response status code.
         */
        status: integer;
        /**
         * HTTP response status text.
         */
        statusText: string;
        /**
         * HTTP response headers.
         */
        headers: Headers;
        /**
         * HTTP response headers text.
         */
        headersText?: string;
        /**
         * HTTP request headers.
         */
        requestHeaders?: Headers;
        /**
         * HTTP request headers text.
         */
        requestHeadersText?: string;
    }
    /**
     * WebSocket message data. This represents an entire WebSocket message, not just a fragmented frame as the name suggests.
     */
    interface WebSocketFrame {
        /**
         * WebSocket message opcode.
         */
        opcode: number;
        /**
         * WebSocket message mask.
         */
        mask: boolean;
        /**
         * WebSocket message payload data.
         * If the opcode is 1, this is a text message and payloadData is a UTF-8 string.
         * If the opcode isn't 1, then payloadData is a base64 encoded string representing binary data.
         */
        payloadData: string;
    }
    /**
     * Information about the cached resource.
     */
    interface CachedResource {
        /**
         * Resource URL. This is the url of the original network request.
         */
        url: string;
        /**
         * Type of this resource.
         */
        type: ResourceType;
        /**
         * Cached response data.
         */
        response?: Response;
        /**
         * Cached response body size.
         */
        bodySize: number;
    }
    const enum InitiatorType {
        Parser = "parser",
        Script = "script",
        Preload = "preload",
        SignedExchange = "SignedExchange",
        Preflight = "preflight",
        FedCM = "FedCM",
        Other = "other"
    }
    /**
     * Information about the request initiator.
     */
    interface Initiator {
        /**
         * Type of this initiator.
         */
        type: InitiatorType;
        /**
         * Initiator JavaScript stack trace, set for Script only.
         * Requires the Debugger domain to be enabled.
         */
        stack?: Runtime.StackTrace;
        /**
         * Initiator URL, set for Parser type or for Script type (when script is importing module) or for SignedExchange type.
         */
        url?: string;
        /**
         * Initiator line number, set for Parser type or for Script type (when script is importing
         * module) (0-based).
         */
        lineNumber?: number;
        /**
         * Initiator column number, set for Parser type or for Script type (when script is importing
         * module) (0-based).
         */
        columnNumber?: number;
        /**
         * Set if another request triggered this request (e.g. preflight).
         */
        requestId?: RequestId;
    }
    /**
     * cookiePartitionKey object
     * The representation of the components of the key that are created by the cookiePartitionKey class contained in net/cookies/cookie_partition_key.h.
     */
    interface CookiePartitionKey {
        /**
         * The site of the top-level URL the browser was visiting at the start
         * of the request to the endpoint that set the cookie.
         */
        topLevelSite: string;
        /**
         * Indicates if the cookie has any ancestors that are cross-site to the topLevelSite.
         */
        hasCrossSiteAncestor: boolean;
    }
    /**
     * Cookie object
     */
    interface Cookie {
        /**
         * Cookie name.
         */
        name: string;
        /**
         * Cookie value.
         */
        value: string;
        /**
         * Cookie domain.
         */
        domain: string;
        /**
         * Cookie path.
         */
        path: string;
        /**
         * Cookie expiration date as the number of seconds since the UNIX epoch.
         * The value is set to -1 if the expiry date is not set.
         * The value can be null for values that cannot be represented in
         * JSON (±Inf).
         */
        expires: number;
        /**
         * Cookie size.
         */
        size: integer;
        /**
         * True if cookie is http-only.
         */
        httpOnly: boolean;
        /**
         * True if cookie is secure.
         */
        secure: boolean;
        /**
         * True in case of session cookie.
         */
        session: boolean;
        /**
         * Cookie SameSite type.
         */
        sameSite?: CookieSameSite;
        /**
         * Cookie Priority
         */
        priority: CookiePriority;
        /**
         * Cookie source scheme type.
         */
        sourceScheme: CookieSourceScheme;
        /**
         * Cookie source port. Valid values are {-1, [1, 65535]}, -1 indicates an unspecified port.
         * An unspecified port value allows protocol clients to emulate legacy cookie scope for the port.
         * This is a temporary ability and it will be removed in the future.
         */
        sourcePort: integer;
        /**
         * Cookie partition key.
         */
        partitionKey?: CookiePartitionKey;
        /**
         * True if cookie partition key is opaque.
         */
        partitionKeyOpaque?: boolean;
    }
    /**
     * Types of reasons why a cookie may not be stored from a response.
     */
    const enum SetCookieBlockedReason {
        SecureOnly = "SecureOnly",
        SameSiteStrict = "SameSiteStrict",
        SameSiteLax = "SameSiteLax",
        SameSiteUnspecifiedTreatedAsLax = "SameSiteUnspecifiedTreatedAsLax",
        SameSiteNoneInsecure = "SameSiteNoneInsecure",
        UserPreferences = "UserPreferences",
        ThirdPartyPhaseout = "ThirdPartyPhaseout",
        SyntaxError = "SyntaxError",
        SchemeNotSupported = "SchemeNotSupported",
        OverwriteSecure = "OverwriteSecure",
        InvalidDomain = "InvalidDomain",
        InvalidPrefix = "InvalidPrefix",
        UnknownError = "UnknownError",
        SchemefulSameSiteStrict = "SchemefulSameSiteStrict",
        SchemefulSameSiteLax = "SchemefulSameSiteLax",
        SchemefulSameSiteUnspecifiedTreatedAsLax = "SchemefulSameSiteUnspecifiedTreatedAsLax",
        NameValuePairExceedsMaxSize = "NameValuePairExceedsMaxSize",
        DisallowedCharacter = "DisallowedCharacter",
        NoCookieContent = "NoCookieContent"
    }
    /**
     * Types of reasons why a cookie may not be sent with a request.
     */
    const enum CookieBlockedReason {
        SecureOnly = "SecureOnly",
        NotOnPath = "NotOnPath",
        DomainMismatch = "DomainMismatch",
        SameSiteStrict = "SameSiteStrict",
        SameSiteLax = "SameSiteLax",
        SameSiteUnspecifiedTreatedAsLax = "SameSiteUnspecifiedTreatedAsLax",
        SameSiteNoneInsecure = "SameSiteNoneInsecure",
        UserPreferences = "UserPreferences",
        ThirdPartyPhaseout = "ThirdPartyPhaseout",
        UnknownError = "UnknownError",
        SchemefulSameSiteStrict = "SchemefulSameSiteStrict",
        SchemefulSameSiteLax = "SchemefulSameSiteLax",
        SchemefulSameSiteUnspecifiedTreatedAsLax = "SchemefulSameSiteUnspecifiedTreatedAsLax",
        NameValuePairExceedsMaxSize = "NameValuePairExceedsMaxSize",
        PortMismatch = "PortMismatch",
        SchemeMismatch = "SchemeMismatch",
        AnonymousContext = "AnonymousContext"
    }
    /**
     * Types of reasons why a cookie should have been blocked by 3PCD but is exempted for the request.
     */
    const enum CookieExemptionReason {
        None = "None",
        UserSetting = "UserSetting",
        EnterprisePolicy = "EnterprisePolicy",
        StorageAccess = "StorageAccess",
        TopLevelStorageAccess = "TopLevelStorageAccess",
        Scheme = "Scheme",
        SameSiteNoneCookiesInSandbox = "SameSiteNoneCookiesInSandbox"
    }
    /**
     * A cookie which was not stored from a response with the corresponding reason.
     */
    interface BlockedSetCookieWithReason {
        /**
         * The reason(s) this cookie was blocked.
         */
        blockedReasons: SetCookieBlockedReason[];
        /**
         * The string representing this individual cookie as it would appear in the header.
         * This is not the entire "cookie" or "set-cookie" header which could have multiple cookies.
         */
        cookieLine: string;
        /**
         * The cookie object which represents the cookie which was not stored. It is optional because
         * sometimes complete cookie information is not available, such as in the case of parsing
         * errors.
         */
        cookie?: Cookie;
    }
    /**
     * A cookie should have been blocked by 3PCD but is exempted and stored from a response with the
     * corresponding reason. A cookie could only have at most one exemption reason.
     */
    interface ExemptedSetCookieWithReason {
        /**
         * The reason the cookie was exempted.
         */
        exemptionReason: CookieExemptionReason;
        /**
         * The string representing this individual cookie as it would appear in the header.
         */
        cookieLine: string;
        /**
         * The cookie object representing the cookie.
         */
        cookie: Cookie;
    }
    /**
     * A cookie associated with the request which may or may not be sent with it.
     * Includes the cookies itself and reasons for blocking or exemption.
     */
    interface AssociatedCookie {
        /**
         * The cookie object representing the cookie which was not sent.
         */
        cookie: Cookie;
        /**
         * The reason(s) the cookie was blocked. If empty means the cookie is included.
         */
        blockedReasons: CookieBlockedReason[];
        /**
         * The reason the cookie should have been blocked by 3PCD but is exempted. A cookie could
         * only have at most one exemption reason.
         */
        exemptionReason?: CookieExemptionReason;
    }
    /**
     * Cookie parameter object
     */
    interface CookieParam {
        /**
         * Cookie name.
         */
        name: string;
        /**
         * Cookie value.
         */
        value: string;
        /**
         * The request-URI to associate with the setting of the cookie. This value can affect the
         * default domain, path, source port, and source scheme values of the created cookie.
         */
        url?: string;
        /**
         * Cookie domain.
         */
        domain?: string;
        /**
         * Cookie path.
         */
        path?: string;
        /**
         * True if cookie is secure.
         */
        secure?: boolean;
        /**
         * True if cookie is http-only.
         */
        httpOnly?: boolean;
        /**
         * Cookie SameSite type.
         */
        sameSite?: CookieSameSite;
        /**
         * Cookie expiration date, session cookie if not set
         */
        expires?: TimeSinceEpoch;
        /**
         * Cookie Priority.
         */
        priority?: CookiePriority;
        /**
         * Cookie source scheme type.
         */
        sourceScheme?: CookieSourceScheme;
        /**
         * Cookie source port. Valid values are {-1, [1, 65535]}, -1 indicates an unspecified port.
         * An unspecified port value allows protocol clients to emulate legacy cookie scope for the port.
         * This is a temporary ability and it will be removed in the future.
         */
        sourcePort?: integer;
        /**
         * Cookie partition key. If not set, the cookie will be set as not partitioned.
         */
        partitionKey?: CookiePartitionKey;
    }
    const enum AuthChallengeSource {
        Server = "Server",
        Proxy = "Proxy"
    }
    /**
     * Authorization challenge for HTTP status code 401 or 407.
     */
    interface AuthChallenge {
        /**
         * Source of the authentication challenge.
         */
        source?: AuthChallengeSource;
        /**
         * Origin of the challenger.
         */
        origin: string;
        /**
         * The authentication scheme used, such as basic or digest
         */
        scheme: string;
        /**
         * The realm of the challenge. May be empty.
         */
        realm: string;
    }
    const enum AuthChallengeResponseResponse {
        Default = "Default",
        CancelAuth = "CancelAuth",
        ProvideCredentials = "ProvideCredentials"
    }
    /**
     * Response to an AuthChallenge.
     */
    interface AuthChallengeResponse {
        /**
         * The decision on what to do in response to the authorization challenge.  Default means
         * deferring to the default behavior of the net stack, which will likely either the Cancel
         * authentication or display a popup dialog box.
         */
        response: AuthChallengeResponseResponse;
        /**
         * The username to provide, possibly empty. Should only be set if response is
         * ProvideCredentials.
         */
        username?: string;
        /**
         * The password to provide, possibly empty. Should only be set if response is
         * ProvideCredentials.
         */
        password?: string;
    }
    /**
     * Information about a signed exchange signature.
     * https://wicg.github.io/webpackage/draft-yasskin-httpbis-origin-signed-exchanges-impl.html#rfc.section.3.1
     */
    interface SignedExchangeSignature {
        /**
         * Signed exchange signature label.
         */
        label: string;
        /**
         * The hex string of signed exchange signature.
         */
        signature: string;
        /**
         * Signed exchange signature integrity.
         */
        integrity: string;
        /**
         * Signed exchange signature cert Url.
         */
        certUrl?: string;
        /**
         * The hex string of signed exchange signature cert sha256.
         */
        certSha256?: string;
        /**
         * Signed exchange signature validity Url.
         */
        validityUrl: string;
        /**
         * Signed exchange signature date.
         */
        date: integer;
        /**
         * Signed exchange signature expires.
         */
        expires: integer;
        /**
         * The encoded certificates.
         */
        certificates?: string[];
    }
    /**
     * Information about a signed exchange header.
     * https://wicg.github.io/webpackage/draft-yasskin-httpbis-origin-signed-exchanges-impl.html#cbor-representation
     */
    interface SignedExchangeHeader {
        /**
         * Signed exchange request URL.
         */
        requestUrl: string;
        /**
         * Signed exchange response code.
         */
        responseCode: integer;
        /**
         * Signed exchange response headers.
         */
        responseHeaders: Headers;
        /**
         * Signed exchange response signature.
         */
        signatures: SignedExchangeSignature[];
        /**
         * Signed exchange header integrity hash in the form of `sha256-<base64-hash-value>`.
         */
        headerIntegrity: string;
    }
    /**
     * Field type for a signed exchange related error.
     */
    const enum SignedExchangeErrorField {
        SignatureSig = "signatureSig",
        SignatureIntegrity = "signatureIntegrity",
        SignatureCertUrl = "signatureCertUrl",
        SignatureCertSha256 = "signatureCertSha256",
        SignatureValidityUrl = "signatureValidityUrl",
        SignatureTimestamps = "signatureTimestamps"
    }
    /**
     * Information about a signed exchange response.
     */
    interface SignedExchangeError {
        /**
         * Error message.
         */
        message: string;
        /**
         * The index of the signature which caused the error.
         */
        signatureIndex?: integer;
        /**
         * The field which caused the error.
         */
        errorField?: SignedExchangeErrorField;
    }
    /**
     * Information about a signed exchange response.
     */
    interface SignedExchangeInfo {
        /**
         * The outer response of signed HTTP exchange which was received from network.
         */
        outerResponse: Response;
        /**
         * Whether network response for the signed exchange was accompanied by
         * extra headers.
         */
        hasExtraInfo: boolean;
        /**
         * Information about the signed exchange header.
         */
        header?: SignedExchangeHeader;
        /**
         * Security details for the signed exchange header.
         */
        securityDetails?: SecurityDetails;
        /**
         * Errors occurred while handling the signed exchange.
         */
        errors?: SignedExchangeError[];
    }
    interface NetworkConditions {
        /**
         * Only matching requests will be affected by these conditions. Patterns use the URLPattern constructor string
         * syntax (https://urlpattern.spec.whatwg.org/) and must be absolute. If the pattern is empty, all requests are
         * matched (including p2p connections).
         */
        urlPattern: string;
        /**
         * Minimum latency from request sent to response headers received (ms).
         */
        latency: number;
        /**
         * Maximal aggregated download throughput (bytes/sec). -1 disables download throttling.
         */
        downloadThroughput: number;
        /**
         * Maximal aggregated upload throughput (bytes/sec).  -1 disables upload throttling.
         */
        uploadThroughput: number;
        /**
         * Connection type if known.
         */
        connectionType?: ConnectionType;
        /**
         * WebRTC packet loss (percent, 0-100). 0 disables packet loss emulation, 100 drops all the packets.
         */
        packetLoss?: number;
        /**
         * WebRTC packet queue length (packet). 0 removes any queue length limitations.
         */
        packetQueueLength?: integer;
        /**
         * WebRTC packetReordering feature.
         */
        packetReordering?: boolean;
        /**
         * True to emulate internet disconnection.
         */
        offline?: boolean;
    }
    interface BlockPattern {
        /**
         * URL pattern to match. Patterns use the URLPattern constructor string syntax
         * (https://urlpattern.spec.whatwg.org/) and must be absolute. Example: `*://*:*\/*.css`.
         */
        urlPattern: string;
        /**
         * Whether or not to block the pattern. If false, a matching request will not be blocked even if it matches a later
         * `BlockPattern`.
         */
        block: boolean;
    }
    const enum DirectSocketDnsQueryType {
        Ipv4 = "ipv4",
        Ipv6 = "ipv6"
    }
    interface DirectTCPSocketOptions {
        /**
         * TCP_NODELAY option
         */
        noDelay: boolean;
        /**
         * Expected to be unsigned integer.
         */
        keepAliveDelay?: number;
        /**
         * Expected to be unsigned integer.
         */
        sendBufferSize?: number;
        /**
         * Expected to be unsigned integer.
         */
        receiveBufferSize?: number;
        dnsQueryType?: DirectSocketDnsQueryType;
    }
    interface DirectUDPSocketOptions {
        remoteAddr?: string;
        /**
         * Unsigned int 16.
         */
        remotePort?: integer;
        localAddr?: string;
        /**
         * Unsigned int 16.
         */
        localPort?: integer;
        dnsQueryType?: DirectSocketDnsQueryType;
        /**
         * Expected to be unsigned integer.
         */
        sendBufferSize?: number;
        /**
         * Expected to be unsigned integer.
         */
        receiveBufferSize?: number;
        multicastLoopback?: boolean;
        /**
         * Unsigned int 8.
         */
        multicastTimeToLive?: integer;
        multicastAllowAddressSharing?: boolean;
    }
    interface DirectUDPMessage {
        data: binary;
        /**
         * Null for connected mode.
         */
        remoteAddr?: string;
        /**
         * Null for connected mode.
         * Expected to be unsigned integer.
         */
        remotePort?: integer;
    }
    const enum LocalNetworkAccessRequestPolicy {
        Allow = "Allow",
        BlockFromInsecureToMorePrivate = "BlockFromInsecureToMorePrivate",
        WarnFromInsecureToMorePrivate = "WarnFromInsecureToMorePrivate",
        PermissionBlock = "PermissionBlock",
        PermissionWarn = "PermissionWarn"
    }
    const enum IPAddressSpace {
        Loopback = "Loopback",
        Local = "Local",
        Public = "Public",
        Unknown = "Unknown"
    }
    interface ConnectTiming {
        /**
         * Timing's requestTime is a baseline in seconds, while the other numbers are ticks in
         * milliseconds relatively to this requestTime. Matches ResourceTiming's requestTime for
         * the same request (but not for redirected requests).
         */
        requestTime: number;
    }
    interface ClientSecurityState {
        initiatorIsSecureContext: boolean;
        initiatorIPAddressSpace: IPAddressSpace;
        localNetworkAccessRequestPolicy: LocalNetworkAccessRequestPolicy;
    }
    /**
     * Identifies the script on the stack that caused a resource or element to be
     * labeled as an ad. For resources, this indicates the context that triggered
     * the fetch. For elements, this indicates the context that caused the element
     * to be appended to the DOM.
     */
    interface AdScriptIdentifier {
        /**
         * The script's V8 identifier.
         */
        scriptId: Runtime.ScriptId;
        /**
         * V8's debugging ID for the v8::Context.
         */
        debuggerId: Runtime.UniqueDebuggerId;
        /**
         * The script's url (or generated name based on id if inline script).
         */
        name: string;
    }
    /**
     * Encapsulates the script ancestry and the root script filter list rule that
     * caused the resource or element to be labeled as an ad.
     */
    interface AdAncestry {
        /**
         * A chain of `AdScriptIdentifier`s representing the ancestry of an ad
         * script that led to the creation of a resource or element. The chain is
         * ordered from the script itself (lowest level) up to its root ancestor
         * that was flagged by a filter list.
         */
        ancestryChain: AdScriptIdentifier[];
        /**
         * The filter list rule that caused the root (last) script in
         * `ancestryChain` to be tagged as an ad.
         */
        rootScriptFilterlistRule?: string;
    }
    /**
     * Represents the provenance of an ad resource or element. Only one of
     * `filterlistRule` or `adScriptAncestry` can be set. If `filterlistRule`
     * is provided, the resource URL directly matches a filter list rule. If
     * `adScriptAncestry` is provided, an ad script initiated the resource fetch or
     * appended the element to the DOM. If neither is provided, the entity is
     * known to be an ad, but provenance tracking information is unavailable.
     */
    interface AdProvenance {
        /**
         * The filterlist rule that matched, if any.
         */
        filterlistRule?: string;
        /**
         * The script ancestry that created the ad, if any.
         * Note: depending on the context, this may represent the full ancestry up
         * to the root script, or it may contain only one script representing the
         * immediate ancestor.
         */
        adScriptAncestry?: AdAncestry;
    }
    const enum CrossOriginOpenerPolicyValue {
        SameOrigin = "SameOrigin",
        SameOriginAllowPopups = "SameOriginAllowPopups",
        RestrictProperties = "RestrictProperties",
        UnsafeNone = "UnsafeNone",
        SameOriginPlusCoep = "SameOriginPlusCoep",
        RestrictPropertiesPlusCoep = "RestrictPropertiesPlusCoep",
        NoopenerAllowPopups = "NoopenerAllowPopups"
    }
    interface CrossOriginOpenerPolicyStatus {
        value: CrossOriginOpenerPolicyValue;
        reportOnlyValue: CrossOriginOpenerPolicyValue;
        reportingEndpoint?: string;
        reportOnlyReportingEndpoint?: string;
    }
    const enum CrossOriginEmbedderPolicyValue {
        None = "None",
        Credentialless = "Credentialless",
        RequireCorp = "RequireCorp"
    }
    interface CrossOriginEmbedderPolicyStatus {
        value: CrossOriginEmbedderPolicyValue;
        reportOnlyValue: CrossOriginEmbedderPolicyValue;
        reportingEndpoint?: string;
        reportOnlyReportingEndpoint?: string;
    }
    const enum ContentSecurityPolicySource {
        HTTP = "HTTP",
        Meta = "Meta"
    }
    interface ContentSecurityPolicyStatus {
        effectiveDirectives: string;
        isEnforced: boolean;
        source: ContentSecurityPolicySource;
    }
    interface SecurityIsolationStatus {
        coop?: CrossOriginOpenerPolicyStatus;
        coep?: CrossOriginEmbedderPolicyStatus;
        csp?: ContentSecurityPolicyStatus[];
    }
    /**
     * The status of a Reporting API report.
     */
    const enum ReportStatus {
        Queued = "Queued",
        Pending = "Pending",
        MarkedForRemoval = "MarkedForRemoval",
        Success = "Success"
    }
    type ReportId = OpaqueIdentifier<string, 'Protocol.Network.ReportId'>;
    /**
     * An object representing a report generated by the Reporting API.
     */
    interface ReportingApiReport {
        id: ReportId;
        /**
         * The URL of the document that triggered the report.
         */
        initiatorUrl: string;
        /**
         * The name of the endpoint group that should be used to deliver the report.
         */
        destination: string;
        /**
         * The type of the report (specifies the set of data that is contained in the report body).
         */
        type: string;
        /**
         * When the report was generated.
         */
        timestamp: Network.TimeSinceEpoch;
        /**
         * How many uploads deep the related request was.
         */
        depth: integer;
        /**
         * The number of delivery attempts made so far, not including an active attempt.
         */
        completedAttempts: integer;
        body: any;
        status: ReportStatus;
    }
    interface ReportingApiEndpoint {
        /**
         * The URL of the endpoint to which reports may be delivered.
         */
        url: string;
        /**
         * Name of the endpoint group.
         */
        groupName: string;
    }
    /**
     * Unique identifier for a device bound session.
     */
    interface DeviceBoundSessionKey {
        /**
         * The site the session is set up for.
         */
        site: string;
        /**
         * The id of the session.
         */
        id: string;
    }
    const enum DeviceBoundSessionWithUsageUsage {
        NotInScope = "NotInScope",
        InScopeRefreshNotYetNeeded = "InScopeRefreshNotYetNeeded",
        InScopeRefreshNotAllowed = "InScopeRefreshNotAllowed",
        ProactiveRefreshNotPossible = "ProactiveRefreshNotPossible",
        ProactiveRefreshAttempted = "ProactiveRefreshAttempted",
        Deferred = "Deferred"
    }
    /**
     * How a device bound session was used during a request.
     */
    interface DeviceBoundSessionWithUsage {
        /**
         * The key for the session.
         */
        sessionKey: DeviceBoundSessionKey;
        /**
         * How the session was used (or not used).
         */
        usage: DeviceBoundSessionWithUsageUsage;
    }
    /**
     * A device bound session's cookie craving.
     */
    interface DeviceBoundSessionCookieCraving {
        /**
         * The name of the craving.
         */
        name: string;
        /**
         * The domain of the craving.
         */
        domain: string;
        /**
         * The path of the craving.
         */
        path: string;
        /**
         * The `Secure` attribute of the craving attributes.
         */
        secure: boolean;
        /**
         * The `HttpOnly` attribute of the craving attributes.
         */
        httpOnly: boolean;
        /**
         * The `SameSite` attribute of the craving attributes.
         */
        sameSite?: CookieSameSite;
    }
    const enum DeviceBoundSessionUrlRuleRuleType {
        Exclude = "Exclude",
        Include = "Include"
    }
    /**
     * A device bound session's inclusion URL rule.
     */
    interface DeviceBoundSessionUrlRule {
        /**
         * See comments on `net::device_bound_sessions::SessionInclusionRules::UrlRule::rule_type`.
         */
        ruleType: DeviceBoundSessionUrlRuleRuleType;
        /**
         * See comments on `net::device_bound_sessions::SessionInclusionRules::UrlRule::host_pattern`.
         */
        hostPattern: string;
        /**
         * See comments on `net::device_bound_sessions::SessionInclusionRules::UrlRule::path_prefix`.
         */
        pathPrefix: string;
    }
    /**
     * A device bound session's inclusion rules.
     */
    interface DeviceBoundSessionInclusionRules {
        /**
         * See comments on `net::device_bound_sessions::SessionInclusionRules::origin_`.
         */
        origin: string;
        /**
         * Whether the whole site is included. See comments on
         * `net::device_bound_sessions::SessionInclusionRules::include_site_` for more
         * details; this boolean is true if that value is populated.
         */
        includeSite: boolean;
        /**
         * See comments on `net::device_bound_sessions::SessionInclusionRules::url_rules_`.
         */
        urlRules: DeviceBoundSessionUrlRule[];
    }
    /**
     * A device bound session.
     */
    interface DeviceBoundSession {
        /**
         * The site and session ID of the session.
         */
        key: DeviceBoundSessionKey;
        /**
         * See comments on `net::device_bound_sessions::Session::refresh_url_`.
         */
        refreshUrl: string;
        /**
         * See comments on `net::device_bound_sessions::Session::inclusion_rules_`.
         */
        inclusionRules: DeviceBoundSessionInclusionRules;
        /**
         * See comments on `net::device_bound_sessions::Session::cookie_cravings_`.
         */
        cookieCravings: DeviceBoundSessionCookieCraving[];
        /**
         * See comments on `net::device_bound_sessions::Session::expiry_date_`.
         */
        expiryDate: Network.TimeSinceEpoch;
        /**
         * See comments on `net::device_bound_sessions::Session::cached_challenge__`.
         */
        cachedChallenge?: string;
        /**
         * See comments on `net::device_bound_sessions::Session::allowed_refresh_initiators_`.
         */
        allowedRefreshInitiators: string[];
    }
    /**
     * A unique identifier for a device bound session event.
     */
    type DeviceBoundSessionEventId = OpaqueIdentifier<string, 'Protocol.Network.DeviceBoundSessionEventId'>;
    /**
     * A fetch result for a device bound session creation or refresh.
     * LINT_SKIP.IfChange(DeviceBoundSessionFetchResult)
     */
    const enum DeviceBoundSessionFetchResult {
        Success = "Success",
        SigningKeyGenerationError = "SigningKeyGenerationError",
        AttestationKeyGenerationError = "AttestationKeyGenerationError",
        SigningError = "SigningError",
        TransientSigningError = "TransientSigningError",
        ServerRequestedTermination = "ServerRequestedTermination",
        InvalidSessionId = "InvalidSessionId",
        InvalidChallenge = "InvalidChallenge",
        TooManyChallenges = "TooManyChallenges",
        InvalidFetcherUrl = "InvalidFetcherUrl",
        InvalidRefreshUrl = "InvalidRefreshUrl",
        TransientHttpError = "TransientHttpError",
        ScopeOriginSameSiteMismatch = "ScopeOriginSameSiteMismatch",
        RefreshUrlSameSiteMismatch = "RefreshUrlSameSiteMismatch",
        MismatchedSessionId = "MismatchedSessionId",
        MissingScope = "MissingScope",
        NoCredentials = "NoCredentials",
        SubdomainRegistrationWellKnownUnavailable = "SubdomainRegistrationWellKnownUnavailable",
        SubdomainRegistrationUnauthorized = "SubdomainRegistrationUnauthorized",
        SubdomainRegistrationWellKnownMalformed = "SubdomainRegistrationWellKnownMalformed",
        SessionProviderWellKnownUnavailable = "SessionProviderWellKnownUnavailable",
        RelyingPartyWellKnownUnavailable = "RelyingPartyWellKnownUnavailable",
        FederatedKeyThumbprintMismatch = "FederatedKeyThumbprintMismatch",
        InvalidFederatedSessionUrl = "InvalidFederatedSessionUrl",
        InvalidFederatedKey = "InvalidFederatedKey",
        TooManyRelyingOriginLabels = "TooManyRelyingOriginLabels",
        BoundCookieSetForbidden = "BoundCookieSetForbidden",
        NetError = "NetError",
        ProxyError = "ProxyError",
        EmptySessionConfig = "EmptySessionConfig",
        InvalidCredentialsConfig = "InvalidCredentialsConfig",
        InvalidCredentialsType = "InvalidCredentialsType",
        InvalidCredentialsEmptyName = "InvalidCredentialsEmptyName",
        InvalidCredentialsCookie = "InvalidCredentialsCookie",
        PersistentHttpError = "PersistentHttpError",
        RegistrationAttemptedChallenge = "RegistrationAttemptedChallenge",
        InvalidScopeOrigin = "InvalidScopeOrigin",
        ScopeOriginContainsPath = "ScopeOriginContainsPath",
        RefreshInitiatorNotString = "RefreshInitiatorNotString",
        RefreshInitiatorInvalidHostPattern = "RefreshInitiatorInvalidHostPattern",
        InvalidScopeSpecification = "InvalidScopeSpecification",
        MissingScopeSpecificationType = "MissingScopeSpecificationType",
        EmptyScopeSpecificationDomain = "EmptyScopeSpecificationDomain",
        EmptyScopeSpecificationPath = "EmptyScopeSpecificationPath",
        InvalidScopeSpecificationType = "InvalidScopeSpecificationType",
        InvalidScopeIncludeSite = "InvalidScopeIncludeSite",
        MissingScopeIncludeSite = "MissingScopeIncludeSite",
        FederatedNotAuthorizedByProvider = "FederatedNotAuthorizedByProvider",
        FederatedNotAuthorizedByRelyingParty = "FederatedNotAuthorizedByRelyingParty",
        SessionProviderWellKnownMalformed = "SessionProviderWellKnownMalformed",
        SessionProviderWellKnownHasProviderOrigin = "SessionProviderWellKnownHasProviderOrigin",
        RelyingPartyWellKnownMalformed = "RelyingPartyWellKnownMalformed",
        RelyingPartyWellKnownHasRelyingOrigins = "RelyingPartyWellKnownHasRelyingOrigins",
        InvalidFederatedSessionProviderSessionMissing = "InvalidFederatedSessionProviderSessionMissing",
        InvalidFederatedSessionWrongProviderOrigin = "InvalidFederatedSessionWrongProviderOrigin",
        InvalidCredentialsCookieCreationTime = "InvalidCredentialsCookieCreationTime",
        InvalidCredentialsCookieName = "InvalidCredentialsCookieName",
        InvalidCredentialsCookieParsing = "InvalidCredentialsCookieParsing",
        InvalidCredentialsCookieUnpermittedAttribute = "InvalidCredentialsCookieUnpermittedAttribute",
        InvalidCredentialsCookieInvalidDomain = "InvalidCredentialsCookieInvalidDomain",
        InvalidCredentialsCookiePrefix = "InvalidCredentialsCookiePrefix",
        InvalidScopeRulePath = "InvalidScopeRulePath",
        InvalidScopeRuleHostPattern = "InvalidScopeRuleHostPattern",
        ScopeRuleOriginScopedHostPatternMismatch = "ScopeRuleOriginScopedHostPatternMismatch",
        ScopeRuleSiteScopedHostPatternMismatch = "ScopeRuleSiteScopedHostPatternMismatch",
        SigningQuotaExceeded = "SigningQuotaExceeded",
        InvalidConfigJson = "InvalidConfigJson",
        InvalidFederatedSessionProviderFailedToRestoreKey = "InvalidFederatedSessionProviderFailedToRestoreKey",
        FailedToUnwrapKey = "FailedToUnwrapKey",
        SessionDeletedDuringRefresh = "SessionDeletedDuringRefresh",
        CrossOriginRegistrationSiteNotIncluded = "CrossOriginRegistrationSiteNotIncluded",
        InvalidPreProvisionedKeyInitiatorMissing = "InvalidPreProvisionedKeyInitiatorMissing",
        PreProvisionedKeyAccessNotGranted = "PreProvisionedKeyAccessNotGranted",
        PreProvisionedKeyNotFound = "PreProvisionedKeyNotFound",
        AttestationCertificationError = "AttestationCertificationError",
        AttestationSigningError = "AttestationSigningError"
    }
    /**
     * Details about a failed device bound session network request.
     */
    interface DeviceBoundSessionFailedRequest {
        /**
         * The failed request URL.
         */
        requestUrl: string;
        /**
         * The net error of the response if it was not OK.
         */
        netError?: string;
        /**
         * The response code if the net error was OK and the response code was not
         * 200.
         */
        responseError?: integer;
        /**
         * The body of the response if the net error was OK, the response code was
         * not 200, and the response body was not empty.
         */
        responseErrorBody?: string;
    }
    /**
     * Session event details specific to creation.
     */
    interface CreationEventDetails {
        /**
         * The result of the fetch attempt.
         */
        fetchResult: DeviceBoundSessionFetchResult;
        /**
         * The session if there was a newly created session. This is populated for
         * all successful creation events.
         */
        newSession?: DeviceBoundSession;
        /**
         * Details about a failed device bound session network request if there was
         * one.
         */
        failedRequest?: DeviceBoundSessionFailedRequest;
    }
    const enum RefreshEventDetailsRefreshResult {
        Refreshed = "Refreshed",
        InitializedService = "InitializedService",
        Unreachable = "Unreachable",
        ServerError = "ServerError",
        FatalError = "FatalError",
        SigningQuotaExceeded = "SigningQuotaExceeded",
        RefreshedAsWaiter = "RefreshedAsWaiter",
        TransientSigningError = "TransientSigningError",
        InScopeRefreshNotYetNeeded = "InScopeRefreshNotYetNeeded",
        Canceled = "Canceled"
    }
    /**
     * Session event details specific to refresh.
     */
    interface RefreshEventDetails {
        /**
         * The result of a refresh.
         * LINT_SKIP.IfChange(DeviceBoundSessionRefreshResult)
         */
        refreshResult: RefreshEventDetailsRefreshResult;
        /**
         * LINT_SKIP.ThenChange(//net/device_bound_sessions/refresh_result.h:DeviceBoundSessionRefreshResult,//content/browser/devtools/protocol/network_handler.cc:DeviceBoundSessionRefreshResult)
         * If there was a fetch attempt, the result of that.
         */
        fetchResult?: DeviceBoundSessionFetchResult;
        /**
         * The session display if there was a newly created session. This is populated
         * for any refresh event that modifies the session config.
         */
        newSession?: DeviceBoundSession;
        /**
         * See comments on `net::device_bound_sessions::RefreshEventResult::was_fully_proactive_refresh`.
         */
        wasFullyProactiveRefresh: boolean;
        /**
         * Details about a failed device bound session network request if there was
         * one.
         */
        failedRequest?: DeviceBoundSessionFailedRequest;
    }
    const enum TerminationEventDetailsDeletionReason {
        Expired = "Expired",
        FailedToRestoreKey = "FailedToRestoreKey",
        FailedToUnwrapKey = "FailedToUnwrapKey",
        StoragePartitionCleared = "StoragePartitionCleared",
        ClearBrowsingData = "ClearBrowsingData",
        ServerRequested = "ServerRequested",
        InvalidSessionParams = "InvalidSessionParams",
        RefreshFatalError = "RefreshFatalError",
        DevTools = "DevTools",
        Replaced = "Replaced"
    }
    /**
     * Session event details specific to termination.
     */
    interface TerminationEventDetails {
        /**
         * The reason for a session being deleted.
         */
        deletionReason: TerminationEventDetailsDeletionReason;
    }
    const enum ChallengeEventDetailsChallengeResult {
        Success = "Success",
        NoSessionId = "NoSessionId",
        NoSessionMatch = "NoSessionMatch",
        CantSetBoundCookie = "CantSetBoundCookie"
    }
    /**
     * Session event details specific to challenges.
     */
    interface ChallengeEventDetails {
        /**
         * The result of a challenge.
         */
        challengeResult: ChallengeEventDetailsChallengeResult;
        /**
         * The challenge set.
         */
        challenge: string;
    }
    /**
     * An object providing the result of a network resource load.
     */
    interface LoadNetworkResourcePageResult {
        success: boolean;
        /**
         * Optional values used for error reporting.
         */
        netError?: number;
        netErrorName?: string;
        httpStatusCode?: number;
        /**
         * If successful, one of the following two fields holds the result.
         */
        stream?: IO.StreamHandle;
        /**
         * Response headers.
         */
        headers?: Network.Headers;
    }
    /**
     * An options object that may be extended later to better support CORS,
     * CORB and streaming.
     */
    interface LoadNetworkResourceOptions {
        disableCache: boolean;
        includeCredentials: boolean;
    }
    interface CanClearBrowserCacheResponse extends ProtocolResponseWithError {
        /**
         * True if browser cache can be cleared.
         */
        result: boolean;
    }
    interface CanClearBrowserCookiesResponse extends ProtocolResponseWithError {
        /**
         * True if browser cookies can be cleared.
         */
        result: boolean;
    }
    interface CanEmulateNetworkConditionsResponse extends ProtocolResponseWithError {
        /**
         * True if emulation of network conditions is supported.
         */
        result: boolean;
    }
    interface DeleteCookiesRequest {
        /**
         * Name of the cookies to remove.
         */
        name: string;
        /**
         * If specified, deletes all the cookies with the given name where domain and path match
         * provided URL.
         */
        url?: string;
        /**
         * If specified, deletes only cookies with the exact domain.
         */
        domain?: string;
        /**
         * If specified, deletes only cookies with the exact path.
         */
        path?: string;
        /**
         * If specified, deletes only cookies with the the given name and partitionKey where
         * all partition key attributes match the cookie partition key attribute.
         */
        partitionKey?: CookiePartitionKey;
    }
    interface EmulateNetworkConditionsRequest {
        /**
         * True to emulate internet disconnection.
         */
        offline: boolean;
        /**
         * Minimum latency from request sent to response headers received (ms).
         */
        latency: number;
        /**
         * Maximal aggregated download throughput (bytes/sec). -1 disables download throttling.
         */
        downloadThroughput: number;
        /**
         * Maximal aggregated upload throughput (bytes/sec).  -1 disables upload throttling.
         */
        uploadThroughput: number;
        /**
         * Connection type if known.
         */
        connectionType?: ConnectionType;
        /**
         * WebRTC packet loss (percent, 0-100). 0 disables packet loss emulation, 100 drops all the packets.
         */
        packetLoss?: number;
        /**
         * WebRTC packet queue length (packet). 0 removes any queue length limitations.
         */
        packetQueueLength?: integer;
        /**
         * WebRTC packetReordering feature.
         */
        packetReordering?: boolean;
    }
    interface EmulateNetworkConditionsByRuleRequest {
        /**
         * True to emulate internet disconnection. Deprecated, use the offline property in matchedNetworkConditions
         * or emulateOfflineServiceWorker instead.
         * @deprecated
         */
        offline?: boolean;
        /**
         * True to emulate offline service worker.
         */
        emulateOfflineServiceWorker?: boolean;
        /**
         * Configure conditions for matching requests. If multiple entries match a request, the first entry wins.  Global
         * conditions can be configured by leaving the urlPattern for the conditions empty. These global conditions are
         * also applied for throttling of p2p connections.
         */
        matchedNetworkConditions: NetworkConditions[];
    }
    interface EmulateNetworkConditionsByRuleResponse extends ProtocolResponseWithError {
        /**
         * An id for each entry in matchedNetworkConditions. The id will be included in the requestWillBeSentExtraInfo for
         * requests affected by a rule.
         */
        ruleIds: string[];
    }
    interface OverrideNetworkStateRequest {
        /**
         * True to emulate internet disconnection.
         */
        offline: boolean;
        /**
         * Minimum latency from request sent to response headers received (ms).
         */
        latency: number;
        /**
         * Maximal aggregated download throughput (bytes/sec). -1 disables download throttling.
         */
        downloadThroughput: number;
        /**
         * Maximal aggregated upload throughput (bytes/sec).  -1 disables upload throttling.
         */
        uploadThroughput: number;
        /**
         * Connection type if known.
         */
        connectionType?: ConnectionType;
    }
    interface EnableRequest {
        /**
         * Buffer size in bytes to use when preserving network payloads (XHRs, etc).
         * This is the maximum number of bytes that will be collected by this
         * DevTools session.
         */
        maxTotalBufferSize?: integer;
        /**
         * Per-resource buffer size in bytes to use when preserving network payloads (XHRs, etc).
         */
        maxResourceBufferSize?: integer;
        /**
         * Longest post body size (in bytes) that would be included in requestWillBeSent notification
         */
        maxPostDataSize?: integer;
        /**
         * Whether DirectSocket chunk send/receive events should be reported.
         */
        reportDirectSocketTraffic?: boolean;
        /**
         * Enable storing response bodies outside of renderer, so that these survive
         * a cross-process navigation. Requires maxTotalBufferSize to be set.
         * Currently defaults to false. This field is being deprecated in favor of the dedicated
         * configureDurableMessages command, due to the possibility of deadlocks when awaiting
         * Network.enable before issuing Runtime.runIfWaitingForDebugger.
         */
        enableDurableMessages?: boolean;
    }
    interface ConfigureDurableMessagesRequest {
        /**
         * Buffer size in bytes to use when preserving network payloads (XHRs, etc).
         */
        maxTotalBufferSize?: integer;
        /**
         * Per-resource buffer size in bytes to use when preserving network payloads (XHRs, etc).
         */
        maxResourceBufferSize?: integer;
    }
    interface GetAllCookiesResponse extends ProtocolResponseWithError {
        /**
         * Array of cookie objects.
         */
        cookies: Cookie[];
    }
    interface GetCertificateRequest {
        /**
         * Origin to get certificate for.
         */
        origin: string;
    }
    interface GetCertificateResponse extends ProtocolResponseWithError {
        tableNames: string[];
    }
    interface GetCookiesRequest {
        /**
         * The list of URLs for which applicable cookies will be fetched.
         * If not specified, it's assumed to be set to the list containing
         * the URLs of the page and all of its subframes.
         */
        urls?: string[];
    }
    interface GetCookiesResponse extends ProtocolResponseWithError {
        /**
         * Array of cookie objects.
         */
        cookies: Cookie[];
    }
    interface GetResponseBodyRequest {
        /**
         * Identifier of the network request to get content for.
         */
        requestId: RequestId;
    }
    interface GetResponseBodyResponse extends ProtocolResponseWithError {
        /**
         * Response body.
         */
        body: string;
        /**
         * True, if content was sent as base64.
         */
        base64Encoded: boolean;
    }
    interface GetRequestPostDataRequest {
        /**
         * Identifier of the network request to get content for.
         */
        requestId: RequestId;
    }
    interface GetRequestPostDataResponse extends ProtocolResponseWithError {
        /**
         * Request body string, omitting files from multipart requests
         */
        postData: string;
        /**
         * True, if content was sent as base64.
         */
        base64Encoded: boolean;
    }
    interface ReplayXHRRequest {
        /**
         * Identifier of XHR to replay.
         */
        requestId: RequestId;
    }
    interface SearchInResponseBodyRequest {
        /**
         * Identifier of the network response to search.
         */
        requestId: RequestId;
        /**
         * String to search for.
         */
        query: string;
        /**
         * If true, search is case sensitive.
         */
        caseSensitive?: boolean;
        /**
         * If true, treats string parameter as regex.
         */
        isRegex?: boolean;
    }
    interface SearchInResponseBodyResponse extends ProtocolResponseWithError {
        /**
         * List of search matches.
         */
        result: Debugger.SearchMatch[];
    }
    interface SetBlockedURLsRequest {
        /**
         * Patterns to match in the order in which they are given. These patterns
         * also take precedence over any wildcard patterns defined in `urls`.
         */
        urlPatterns?: BlockPattern[];
        /**
         * URL patterns to block. Wildcards ('*') are allowed.
         * @deprecated
         */
        urls?: string[];
    }
    interface SetBypassServiceWorkerRequest {
        /**
         * Bypass service worker and load from network.
         */
        bypass: boolean;
    }
    interface SetCacheDisabledRequest {
        /**
         * Cache disabled state.
         */
        cacheDisabled: boolean;
    }
    interface SetCookieRequest {
        /**
         * Cookie name.
         */
        name: string;
        /**
         * Cookie value.
         */
        value: string;
        /**
         * The request-URI to associate with the setting of the cookie. This value can affect the
         * default domain, path, source port, and source scheme values of the created cookie.
         */
        url?: string;
        /**
         * Cookie domain.
         */
        domain?: string;
        /**
         * Cookie path.
         */
        path?: string;
        /**
         * True if cookie is secure.
         */
        secure?: boolean;
        /**
         * True if cookie is http-only.
         */
        httpOnly?: boolean;
        /**
         * Cookie SameSite type.
         */
        sameSite?: CookieSameSite;
        /**
         * Cookie expiration date, session cookie if not set
         */
        expires?: TimeSinceEpoch;
        /**
         * Cookie Priority type.
         */
        priority?: CookiePriority;
        /**
         * Cookie source scheme type.
         */
        sourceScheme?: CookieSourceScheme;
        /**
         * Cookie source port. Valid values are {-1, [1, 65535]}, -1 indicates an unspecified port.
         * An unspecified port value allows protocol clients to emulate legacy cookie scope for the port.
         * This is a temporary ability and it will be removed in the future.
         */
        sourcePort?: integer;
        /**
         * Cookie partition key. If not set, the cookie will be set as not partitioned.
         */
        partitionKey?: CookiePartitionKey;
    }
    interface SetCookieResponse extends ProtocolResponseWithError {
        /**
         * Always set to true. If an error occurs, the response indicates protocol error.
         * @deprecated
         */
        success: boolean;
    }
    interface SetCookiesRequest {
        /**
         * Cookies to be set.
         */
        cookies: CookieParam[];
    }
    interface SetExtraHTTPHeadersRequest {
        /**
         * Map with extra HTTP headers.
         */
        headers: Headers;
    }
    interface SetAttachDebugStackRequest {
        /**
         * Whether to attach a page script stack for debugging purpose.
         */
        enabled: boolean;
    }
    interface SetUserAgentOverrideRequest {
        /**
         * User agent to use.
         */
        userAgent: string;
        /**
         * Browser language to emulate.
         */
        acceptLanguage?: string;
        /**
         * The platform navigator.platform should return.
         */
        platform?: string;
        /**
         * To be sent in Sec-CH-UA-* headers and returned in navigator.userAgentData
         */
        userAgentMetadata?: Emulation.UserAgentMetadata;
    }
    interface StreamResourceContentRequest {
        /**
         * Identifier of the request to stream.
         */
        requestId: RequestId;
    }
    interface StreamResourceContentResponse extends ProtocolResponseWithError {
        /**
         * Data that has been buffered until streaming is enabled.
         */
        bufferedData: binary;
    }
    interface GetSecurityIsolationStatusRequest {
        /**
         * If no frameId is provided, the status of the target is provided.
         */
        frameId?: Page.FrameId;
    }
    interface GetSecurityIsolationStatusResponse extends ProtocolResponseWithError {
        status: SecurityIsolationStatus;
    }
    interface EnableReportingApiRequest {
        /**
         * Whether to enable or disable events for the Reporting API
         */
        enable: boolean;
    }
    interface EnableDeviceBoundSessionsRequest {
        /**
         * Whether to enable or disable events.
         */
        enable: boolean;
    }
    interface DeleteDeviceBoundSessionRequest {
        key: DeviceBoundSessionKey;
    }
    interface FetchSchemefulSiteRequest {
        /**
         * The URL origin.
         */
        origin: string;
    }
    interface FetchSchemefulSiteResponse extends ProtocolResponseWithError {
        /**
         * The corresponding schemeful site.
         */
        schemefulSite: string;
    }
    interface LoadNetworkResourceRequest {
        /**
         * Frame id to get the resource for. Mandatory for frame targets, and
         * should be omitted for worker targets.
         */
        frameId?: Page.FrameId;
        /**
         * URL of the resource to get content for.
         */
        url: string;
        /**
         * Options for the request.
         */
        options: LoadNetworkResourceOptions;
    }
    interface LoadNetworkResourceResponse extends ProtocolResponseWithError {
        resource: LoadNetworkResourcePageResult;
    }
    interface SetCookieControlsRequest {
        /**
         * Whether 3pc restriction is enabled.
         */
        enableThirdPartyCookieRestriction: boolean;
    }
    /**
     * Fired when data chunk was received over the network.
     */
    interface DataReceivedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * Data chunk length.
         */
        dataLength: integer;
        /**
         * Actual bytes received (might be less than dataLength for compressed encodings).
         */
        encodedDataLength: integer;
        /**
         * Data that was received.
         */
        data?: binary;
    }
    /**
     * Fired when EventSource message is received.
     */
    interface EventSourceMessageReceivedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * Message type.
         */
        eventName: string;
        /**
         * Message identifier.
         */
        eventId: string;
        /**
         * Message content.
         */
        data: string;
    }
    /**
     * Fired when HTTP request has failed to load.
     */
    interface LoadingFailedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * Resource type.
         */
        type: ResourceType;
        /**
         * Error message. List of network errors: https://cs.chromium.org/chromium/src/net/base/net_error_list.h
         */
        errorText: string;
        /**
         * True if loading was canceled.
         */
        canceled?: boolean;
        /**
         * The reason why loading was blocked, if any.
         */
        blockedReason?: BlockedReason;
        /**
         * The reason why loading was blocked by CORS, if any.
         */
        corsErrorStatus?: CorsErrorStatus;
    }
    /**
     * Fired when HTTP request has finished loading.
     */
    interface LoadingFinishedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * Total number of bytes received for this request.
         */
        encodedDataLength: number;
        /**
         * Size of the response body before removing content encodings.
         * Includes cached bodies, but excludes headers and transfer framing.
         */
        encodedBodyLength?: number;
    }
    /**
     * Fired if request ended up loading from cache.
     */
    interface RequestServedFromCacheEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
    }
    /**
     * Fired when page is about to send HTTP request.
     */
    interface RequestWillBeSentEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Loader identifier. Empty string if the request is fetched from worker.
         */
        loaderId: LoaderId;
        /**
         * URL of the document this request is loaded for.
         */
        documentURL: string;
        /**
         * Request data.
         */
        request: Request;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * Timestamp.
         */
        wallTime: TimeSinceEpoch;
        /**
         * Request initiator.
         */
        initiator: Initiator;
        /**
         * In the case that redirectResponse is populated, this flag indicates whether
         * requestWillBeSentExtraInfo and responseReceivedExtraInfo events will be or were emitted
         * for the request which was just redirected.
         */
        redirectHasExtraInfo: boolean;
        /**
         * Redirect response data.
         */
        redirectResponse?: Response;
        /**
         * Type of this resource.
         */
        type?: ResourceType;
        /**
         * Frame identifier.
         */
        frameId?: Page.FrameId;
        /**
         * Whether the request is initiated by a user gesture. Defaults to false.
         */
        hasUserGesture?: boolean;
        /**
         * The render-blocking behavior of the request.
         */
        renderBlockingBehavior?: RenderBlockingBehavior;
    }
    /**
     * Fired when resource loading priority is changed
     */
    interface ResourceChangedPriorityEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * New priority
         */
        newPriority: ResourcePriority;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
    }
    /**
     * Fired when a signed exchange was received over the network
     */
    interface SignedExchangeReceivedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Information about the signed exchange response.
         */
        info: SignedExchangeInfo;
    }
    /**
     * Fired when HTTP response is available.
     */
    interface ResponseReceivedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Loader identifier. Empty string if the request is fetched from worker.
         */
        loaderId: LoaderId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * Resource type.
         */
        type: ResourceType;
        /**
         * Response data.
         */
        response: Response;
        /**
         * Indicates whether requestWillBeSentExtraInfo and responseReceivedExtraInfo events will be
         * or were emitted for this request.
         */
        hasExtraInfo: boolean;
        /**
         * Frame identifier.
         */
        frameId?: Page.FrameId;
    }
    /**
     * Fired when WebSocket is closed.
     */
    interface WebSocketClosedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
    }
    /**
     * Fired upon WebSocket creation.
     */
    interface WebSocketCreatedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * WebSocket request URL.
         */
        url: string;
        /**
         * Request initiator.
         */
        initiator?: Initiator;
    }
    /**
     * Fired when WebSocket message error occurs.
     */
    interface WebSocketFrameErrorEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * WebSocket error message.
         */
        errorMessage: string;
    }
    /**
     * Fired when WebSocket message is received.
     */
    interface WebSocketFrameReceivedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * WebSocket response data.
         */
        response: WebSocketFrame;
    }
    /**
     * Fired when WebSocket message is sent.
     */
    interface WebSocketFrameSentEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * WebSocket response data.
         */
        response: WebSocketFrame;
    }
    /**
     * Fired when WebSocket handshake response becomes available.
     */
    interface WebSocketHandshakeResponseReceivedEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * WebSocket response data.
         */
        response: WebSocketResponse;
    }
    /**
     * Fired when WebSocket is about to initiate handshake.
     */
    interface WebSocketWillSendHandshakeRequestEvent {
        /**
         * Request identifier.
         */
        requestId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * UTC Timestamp.
         */
        wallTime: TimeSinceEpoch;
        /**
         * WebSocket request data.
         */
        request: WebSocketRequest;
    }
    /**
     * Fired upon WebTransport creation.
     */
    interface WebTransportCreatedEvent {
        /**
         * WebTransport identifier.
         */
        transportId: RequestId;
        /**
         * WebTransport request URL.
         */
        url: string;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
        /**
         * Request initiator.
         */
        initiator?: Initiator;
    }
    /**
     * Fired when WebTransport handshake is finished.
     */
    interface WebTransportConnectionEstablishedEvent {
        /**
         * WebTransport identifier.
         */
        transportId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
    }
    /**
     * Fired when WebTransport is disposed.
     */
    interface WebTransportClosedEvent {
        /**
         * WebTransport identifier.
         */
        transportId: RequestId;
        /**
         * Timestamp.
         */
        timestamp: MonotonicTime;
    }
    /**
     * Fired upon direct_socket.TCPSocket creation.
     */
    interface DirectTCPSocketCreatedEvent {
        identifier: RequestId;
        remoteAddr: string;
        /**
         * Unsigned int 16.
         */
        remotePort: integer;
        options: DirectTCPSocketOptions;
        timestamp: MonotonicTime;
        initiator?: Initiator;
    }
    /**
     * Fired when direct_socket.TCPSocket connection is opened.
     */
    interface DirectTCPSocketOpenedEvent {
        identifier: RequestId;
        remoteAddr: string;
        /**
         * Expected to be unsigned integer.
         */
        remotePort: integer;
        timestamp: MonotonicTime;
        localAddr?: string;
        /**
         * Expected to be unsigned integer.
         */
        localPort?: integer;
    }
    /**
     * Fired when direct_socket.TCPSocket is aborted.
     */
    interface DirectTCPSocketAbortedEvent {
        identifier: RequestId;
        errorMessage: ErrorReason;
        timestamp: MonotonicTime;
    }
    /**
     * Fired when direct_socket.TCPSocket is closed.
     */
    interface DirectTCPSocketClosedEvent {
        identifier: RequestId;
        timestamp: MonotonicTime;
    }
    /**
     * Fired when data is sent to tcp direct socket stream.
     */
    interface DirectTCPSocketChunkSentEvent {
        identifier: RequestId;
        data: binary;
        timestamp: MonotonicTime;
    }
    /**
     * Fired when data is received from tcp direct socket stream.
     */
    interface DirectTCPSocketChunkReceivedEvent {
        identifier: RequestId;
        data: binary;
        timestamp: MonotonicTime;
    }
    interface DirectUDPSocketJoinedMulticastGroupEvent {
        identifier: RequestId;
        /**
         * Multicast group address.
         */
        IPAddress: string;
        /**
         * Source address of a source-specific multicast (SSM) membership. Absent
         * for any-source multicast (ASM) memberships.
         */
        sourceAddress?: string;
    }
    interface DirectUDPSocketLeftMulticastGroupEvent {
        identifier: RequestId;
        /**
         * Multicast group address.
         */
        IPAddress: string;
        /**
         * Source address of a source-specific multicast (SSM) membership. Absent
         * for any-source multicast (ASM) memberships.
         */
        sourceAddress?: string;
    }
    /**
     * Fired upon direct_socket.UDPSocket creation.
     */
    interface DirectUDPSocketCreatedEvent {
        identifier: RequestId;
        options: DirectUDPSocketOptions;
        timestamp: MonotonicTime;
        initiator?: Initiator;
    }
    /**
     * Fired when direct_socket.UDPSocket connection is opened.
     */
    interface DirectUDPSocketOpenedEvent {
        identifier: RequestId;
        localAddr: string;
        /**
         * Expected to be unsigned integer.
         */
        localPort: integer;
        timestamp: MonotonicTime;
        remoteAddr?: string;
        /**
         * Expected to be unsigned integer.
         */
        remotePort?: integer;
    }
    /**
     * Fired when direct_socket.UDPSocket is aborted.
     */
    interface DirectUDPSocketAbortedEvent {
        identifier: RequestId;
        errorMessage: ErrorReason;
        timestamp: MonotonicTime;
    }
    /**
     * Fired when direct_socket.UDPSocket is closed.
     */
    interface DirectUDPSocketClosedEvent {
        identifier: RequestId;
        timestamp: MonotonicTime;
    }
    /**
     * Fired when message is sent to udp direct socket stream.
     */
    interface DirectUDPSocketChunkSentEvent {
        identifier: RequestId;
        message: DirectUDPMessage;
        timestamp: MonotonicTime;
    }
    /**
     * Fired when message is received from udp direct socket stream.
     */
    interface DirectUDPSocketChunkReceivedEvent {
        identifier: RequestId;
        message: DirectUDPMessage;
        timestamp: MonotonicTime;
    }
    /**
     * Fired when additional information about a requestWillBeSent event is available from the
     * network stack. Not every requestWillBeSent event will have an additional
     * requestWillBeSentExtraInfo fired for it, and there is no guarantee whether requestWillBeSent
     * or requestWillBeSentExtraInfo will be fired first for the same request.
     */
    interface RequestWillBeSentExtraInfoEvent {
        /**
         * Request identifier. Used to match this information to an existing requestWillBeSent event.
         */
        requestId: RequestId;
        /**
         * A list of cookies potentially associated to the requested URL. This includes both cookies sent with
         * the request and the ones not sent; the latter are distinguished by having blockedReasons field set.
         */
        associatedCookies: AssociatedCookie[];
        /**
         * Raw request headers as they will be sent over the wire.
         */
        headers: Headers;
        /**
         * Connection timing information for the request.
         */
        connectTiming: ConnectTiming;
        /**
         * How the request site's device bound sessions were used during this request.
         */
        deviceBoundSessionUsages?: DeviceBoundSessionWithUsage[];
        /**
         * The client security state set for the request.
         */
        clientSecurityState?: ClientSecurityState;
        /**
         * Whether the site has partitioned cookies stored in a partition different than the current one.
         */
        siteHasCookieInOtherPartition?: boolean;
        /**
         * The network conditions id if this request was affected by network conditions configured via
         * emulateNetworkConditionsByRule.
         */
        appliedNetworkConditionsId?: string;
    }
    /**
     * Fired when additional information about a responseReceived event is available from the network
     * stack. Not every responseReceived event will have an additional responseReceivedExtraInfo for
     * it, and responseReceivedExtraInfo may be fired before or after responseReceived.
     */
    interface ResponseReceivedExtraInfoEvent {
        /**
         * Request identifier. Used to match this information to another responseReceived event.
         */
        requestId: RequestId;
        /**
         * A list of cookies which were not stored from the response along with the corresponding
         * reasons for blocking. The cookies here may not be valid due to syntax errors, which
         * are represented by the invalid cookie line string instead of a proper cookie.
         */
        blockedCookies: BlockedSetCookieWithReason[];
        /**
         * Raw response headers as they were received over the wire.
         * Duplicate headers in the response are represented as a single key with their values
         * concatentated using `\n` as the separator.
         * See also `headersText` that contains verbatim text for HTTP/1.*.
         */
        headers: Headers;
        /**
         * The IP address space of the resource. The address space can only be determined once the transport
         * established the connection, so we can't send it in `requestWillBeSentExtraInfo`.
         */
        resourceIPAddressSpace: IPAddressSpace;
        /**
         * The status code of the response. This is useful in cases the request failed and no responseReceived
         * event is triggered, which is the case for, e.g., CORS errors. This is also the correct status code
         * for cached requests, where the status in responseReceived is a 200 and this will be 304.
         */
        statusCode: integer;
        /**
         * Raw response header text as it was received over the wire. The raw text may not always be
         * available, such as in the case of HTTP/2 or QUIC.
         */
        headersText?: string;
        /**
         * The cookie partition key that will be used to store partitioned cookies set in this response.
         * Only sent when partitioned cookies are enabled.
         */
        cookiePartitionKey?: CookiePartitionKey;
        /**
         * True if partitioned cookies are enabled, but the partition key is not serializable to string.
         */
        cookiePartitionKeyOpaque?: boolean;
        /**
         * A list of cookies which should have been blocked by 3PCD but are exempted and stored from
         * the response with the corresponding reason.
         */
        exemptedCookies?: ExemptedSetCookieWithReason[];
    }
    /**
     * Fired when 103 Early Hints headers is received in addition to the common response.
     * Not every responseReceived event will have an responseReceivedEarlyHints fired.
     * Only one responseReceivedEarlyHints may be fired for eached responseReceived event.
     */
    interface ResponseReceivedEarlyHintsEvent {
        /**
         * Request identifier. Used to match this information to another responseReceived event.
         */
        requestId: RequestId;
        /**
         * Raw response headers as they were received over the wire.
         * Duplicate headers in the response are represented as a single key with their values
         * concatentated using `\n` as the separator.
         * See also `headersText` that contains verbatim text for HTTP/1.*.
         */
        headers: Headers;
    }
    const enum TrustTokenOperationDoneEventStatus {
        Ok = "Ok",
        InvalidArgument = "InvalidArgument",
        MissingIssuerKeys = "MissingIssuerKeys",
        FailedPrecondition = "FailedPrecondition",
        ResourceExhausted = "ResourceExhausted",
        AlreadyExists = "AlreadyExists",
        ResourceLimited = "ResourceLimited",
        Unauthorized = "Unauthorized",
        BadResponse = "BadResponse",
        InternalError = "InternalError",
        UnknownError = "UnknownError",
        FulfilledLocally = "FulfilledLocally",
        SiteIssuerLimit = "SiteIssuerLimit"
    }
    /**
     * Fired exactly once for each Trust Token operation. Depending on
     * the type of the operation and whether the operation succeeded or
     * failed, the event is fired before the corresponding request was sent
     * or after the response was received.
     */
    interface TrustTokenOperationDoneEvent {
        /**
         * Detailed success or error status of the operation.
         * 'AlreadyExists' also signifies a successful operation, as the result
         * of the operation already exists und thus, the operation was abort
         * preemptively (e.g. a cache hit).
         */
        status: TrustTokenOperationDoneEventStatus;
        type: TrustTokenOperationType;
        requestId: RequestId;
        /**
         * Top level origin. The context in which the operation was attempted.
         */
        topLevelOrigin?: string;
        /**
         * Origin of the issuer in case of a "Issuance" or "Redemption" operation.
         */
        issuerOrigin?: string;
        /**
         * The number of obtained Trust Tokens on a successful "Issuance" operation.
         */
        issuedTokenCount?: integer;
    }
    /**
     * Is sent whenever a new report is added.
     * And after 'enableReportingApi' for all existing reports.
     */
    interface ReportingApiReportAddedEvent {
        report: ReportingApiReport;
    }
    interface ReportingApiReportUpdatedEvent {
        report: ReportingApiReport;
    }
    interface ReportingApiEndpointsChangedForOriginEvent {
        /**
         * Origin of the document(s) which configured the endpoints.
         */
        origin: string;
        endpoints: ReportingApiEndpoint[];
    }
    /**
     * Triggered when the initial set of device bound sessions is added.
     */
    interface DeviceBoundSessionsAddedEvent {
        /**
         * The device bound sessions.
         */
        sessions: DeviceBoundSession[];
    }
    /**
     * Triggered when a device bound session event occurs.
     */
    interface DeviceBoundSessionEventOccurredEvent {
        /**
         * A unique identifier for this session event.
         */
        eventId: DeviceBoundSessionEventId;
        /**
         * The site this session event is associated with.
         */
        site: string;
        /**
         * Whether this event was considered successful.
         */
        succeeded: boolean;
        /**
         * The session ID this event is associated with. May not be populated for
         * failed events.
         */
        sessionId?: string;
        /**
         * The below are the different session event type details. Exactly one is populated.
         */
        creationEventDetails?: CreationEventDetails;
        refreshEventDetails?: RefreshEventDetails;
        terminationEventDetails?: TerminationEventDetails;
        challengeEventDetails?: ChallengeEventDetails;
    }
}
/**
 * This domain provides various functionality related to drawing atop the inspected page.
 */
export declare namespace Overlay {
    /**
     * Configuration data for drawing the source order of an elements children.
     */
    interface SourceOrderConfig {
        /**
         * the color to outline the given element in.
         */
        parentOutlineColor: DOM.RGBA;
        /**
         * the color to outline the child elements in.
         */
        childOutlineColor: DOM.RGBA;
    }
    /**
     * Configuration data for the highlighting of Grid elements.
     */
    interface GridHighlightConfig {
        /**
         * Whether the extension lines from grid cells to the rulers should be shown (default: false).
         */
        showGridExtensionLines?: boolean;
        /**
         * Show Positive line number labels (default: false).
         */
        showPositiveLineNumbers?: boolean;
        /**
         * Show Negative line number labels (default: false).
         */
        showNegativeLineNumbers?: boolean;
        /**
         * Show area name labels (default: false).
         */
        showAreaNames?: boolean;
        /**
         * Show line name labels (default: false).
         */
        showLineNames?: boolean;
        /**
         * Show track size labels (default: false).
         */
        showTrackSizes?: boolean;
        /**
         * The grid container border highlight color (default: transparent).
         */
        gridBorderColor?: DOM.RGBA;
        /**
         * The cell border color (default: transparent). Deprecated, please use rowLineColor and columnLineColor instead.
         * @deprecated
         */
        cellBorderColor?: DOM.RGBA;
        /**
         * The row line color (default: transparent).
         */
        rowLineColor?: DOM.RGBA;
        /**
         * The column line color (default: transparent).
         */
        columnLineColor?: DOM.RGBA;
        /**
         * Whether the grid border is dashed (default: false).
         */
        gridBorderDash?: boolean;
        /**
         * Whether the cell border is dashed (default: false). Deprecated, please us rowLineDash and columnLineDash instead.
         * @deprecated
         */
        cellBorderDash?: boolean;
        /**
         * Whether row lines are dashed (default: false).
         */
        rowLineDash?: boolean;
        /**
         * Whether column lines are dashed (default: false).
         */
        columnLineDash?: boolean;
        /**
         * The row gap highlight fill color (default: transparent).
         */
        rowGapColor?: DOM.RGBA;
        /**
         * The row gap hatching fill color (default: transparent).
         */
        rowHatchColor?: DOM.RGBA;
        /**
         * The column gap highlight fill color (default: transparent).
         */
        columnGapColor?: DOM.RGBA;
        /**
         * The column gap hatching fill color (default: transparent).
         */
        columnHatchColor?: DOM.RGBA;
        /**
         * The named grid areas border color (Default: transparent).
         */
        areaBorderColor?: DOM.RGBA;
        /**
         * The grid container background color (Default: transparent).
         */
        gridBackgroundColor?: DOM.RGBA;
    }
    /**
     * Configuration data for the highlighting of Flex container elements.
     */
    interface FlexContainerHighlightConfig {
        /**
         * The style of the container border
         */
        containerBorder?: LineStyle;
        /**
         * The style of the separator between lines
         */
        lineSeparator?: LineStyle;
        /**
         * The style of the separator between items
         */
        itemSeparator?: LineStyle;
        /**
         * Style of content-distribution space on the main axis (justify-content).
         */
        mainDistributedSpace?: BoxStyle;
        /**
         * Style of content-distribution space on the cross axis (align-content).
         */
        crossDistributedSpace?: BoxStyle;
        /**
         * Style of empty space caused by row gaps (gap/row-gap).
         */
        rowGapSpace?: BoxStyle;
        /**
         * Style of empty space caused by columns gaps (gap/column-gap).
         */
        columnGapSpace?: BoxStyle;
        /**
         * Style of the self-alignment line (align-items).
         */
        crossAlignment?: LineStyle;
    }
    /**
     * Configuration data for the highlighting of Flex item elements.
     */
    interface FlexItemHighlightConfig {
        /**
         * Style of the box representing the item's base size
         */
        baseSizeBox?: BoxStyle;
        /**
         * Style of the border around the box representing the item's base size
         */
        baseSizeBorder?: LineStyle;
        /**
         * Style of the arrow representing if the item grew or shrank
         */
        flexibilityArrow?: LineStyle;
    }
    const enum LineStylePattern {
        Dashed = "dashed",
        Dotted = "dotted"
    }
    /**
     * Style information for drawing a line.
     */
    interface LineStyle {
        /**
         * The color of the line (default: transparent)
         */
        color?: DOM.RGBA;
        /**
         * The line pattern (default: solid)
         */
        pattern?: LineStylePattern;
    }
    /**
     * Style information for drawing a box.
     */
    interface BoxStyle {
        /**
         * The background color for the box (default: transparent)
         */
        fillColor?: DOM.RGBA;
        /**
         * The hatching color for the box (default: transparent)
         */
        hatchColor?: DOM.RGBA;
    }
    const enum ContrastAlgorithm {
        Aa = "aa",
        Aaa = "aaa",
        Apca = "apca"
    }
    /**
     * Configuration for Inset-Modified Containing Block (IMCB) and CSS Anchor Positioning highlight.
     */
    interface ImcbHighlightConfig {
        /**
         * Border color for the Inset-Modified Containing Block (default: transparent).
         */
        imcbBorderColor?: DOM.RGBA;
        /**
         * Background fill color for the Inset-Modified Containing Block (default: transparent).
         */
        imcbBackgroundColor?: DOM.RGBA;
        /**
         * Fill color for the inset modifiers area (difference between CB and IMCB).
         */
        insetsBackgroundColor?: DOM.RGBA;
        /**
         * Hatch color for the inset modifiers area.
         */
        insetsHatchColor?: DOM.RGBA;
        /**
         * Border color for the referenced target anchor element(s) (when element is anchor-positioned).
         */
        anchorBorderColor?: DOM.RGBA;
        /**
         * Background fill color for the referenced target anchor element(s) (when element is anchor-positioned).
         */
        anchorBackgroundColor?: DOM.RGBA;
        /**
         * Whether to render the 3x3 position-area grid lines when position-area is used.
         */
        showPositionAreaGrid?: boolean;
        /**
         * Line color for the 3x3 position-area grid lines.
         */
        positionAreaGridLineColor?: DOM.RGBA;
        /**
         * Fill color for the active region within the position-area grid.
         */
        positionAreaActiveRegionColor?: DOM.RGBA;
    }
    /**
     * Configuration data for the highlighting of page elements.
     */
    interface HighlightConfig {
        /**
         * Whether the node info tooltip should be shown (default: false).
         */
        showInfo?: boolean;
        /**
         * Whether the node styles in the tooltip (default: false).
         */
        showStyles?: boolean;
        /**
         * Whether the rulers should be shown (default: false).
         */
        showRulers?: boolean;
        /**
         * Whether the a11y info should be shown (default: true).
         */
        showAccessibilityInfo?: boolean;
        /**
         * Whether the extension lines from node to the rulers should be shown (default: false).
         */
        showExtensionLines?: boolean;
        /**
         * The content box highlight fill color (default: transparent).
         */
        contentColor?: DOM.RGBA;
        /**
         * The padding highlight fill color (default: transparent).
         */
        paddingColor?: DOM.RGBA;
        /**
         * The border highlight fill color (default: transparent).
         */
        borderColor?: DOM.RGBA;
        /**
         * The margin highlight fill color (default: transparent).
         */
        marginColor?: DOM.RGBA;
        /**
         * The event target element highlight fill color (default: transparent).
         */
        eventTargetColor?: DOM.RGBA;
        /**
         * The shape outside fill color (default: transparent).
         */
        shapeColor?: DOM.RGBA;
        /**
         * The shape margin fill color (default: transparent).
         */
        shapeMarginColor?: DOM.RGBA;
        /**
         * The grid layout color (default: transparent).
         */
        cssGridColor?: DOM.RGBA;
        /**
         * The color format used to format color styles (default: hex).
         */
        colorFormat?: ColorFormat;
        /**
         * The grid layout highlight configuration (default: all transparent).
         */
        gridHighlightConfig?: GridHighlightConfig;
        /**
         * The flex container highlight configuration (default: all transparent).
         */
        flexContainerHighlightConfig?: FlexContainerHighlightConfig;
        /**
         * The flex item highlight configuration (default: all transparent).
         */
        flexItemHighlightConfig?: FlexItemHighlightConfig;
        /**
         * The contrast algorithm to use for the contrast ratio (default: aa).
         */
        contrastAlgorithm?: ContrastAlgorithm;
        /**
         * The container query container highlight configuration (default: all transparent).
         */
        containerQueryContainerHighlightConfig?: ContainerQueryContainerHighlightConfig;
        /**
         * The IMCB highlight configuration (default: all transparent).
         */
        imcbHighlightConfig?: ImcbHighlightConfig;
    }
    const enum ColorFormat {
        Rgb = "rgb",
        Hsl = "hsl",
        Hwb = "hwb",
        Hex = "hex"
    }
    /**
     * Configurations for Persistent Grid Highlight
     */
    interface GridNodeHighlightConfig {
        /**
         * A descriptor for the highlight appearance.
         */
        gridHighlightConfig: GridHighlightConfig;
        /**
         * Identifier of the node to highlight.
         */
        nodeId: DOM.NodeId;
    }
    interface FlexNodeHighlightConfig {
        /**
         * A descriptor for the highlight appearance of flex containers.
         */
        flexContainerHighlightConfig: FlexContainerHighlightConfig;
        /**
         * Identifier of the node to highlight.
         */
        nodeId: DOM.NodeId;
    }
    interface ScrollSnapContainerHighlightConfig {
        /**
         * The style of the snapport border (default: transparent)
         */
        snapportBorder?: LineStyle;
        /**
         * The style of the snap area border (default: transparent)
         */
        snapAreaBorder?: LineStyle;
        /**
         * The margin highlight fill color (default: transparent).
         */
        scrollMarginColor?: DOM.RGBA;
        /**
         * The padding highlight fill color (default: transparent).
         */
        scrollPaddingColor?: DOM.RGBA;
    }
    interface ScrollSnapHighlightConfig {
        /**
         * A descriptor for the highlight appearance of scroll snap containers.
         */
        scrollSnapContainerHighlightConfig: ScrollSnapContainerHighlightConfig;
        /**
         * Identifier of the node to highlight.
         */
        nodeId: DOM.NodeId;
    }
    /**
     * Configuration for dual screen hinge
     */
    interface HingeConfig {
        /**
         * A rectangle represent hinge
         */
        rect: DOM.Rect;
        /**
         * The content box highlight fill color (default: a dark color).
         */
        contentColor?: DOM.RGBA;
        /**
         * The content box highlight outline color (default: transparent).
         */
        outlineColor?: DOM.RGBA;
    }
    /**
     * Supported display cutout shapes.
     */
    const enum DisplayCutoutShape {
        Pill = "pill",
        Notch = "notch",
        Circle = "circle",
        Rectangle = "rectangle"
    }
    /**
     * Configuration for a display cutout.
     */
    interface DisplayCutoutConfig {
        /**
         * A rectangle representing the cutout bounds.
         */
        rect: DOM.Rect;
        /**
         * Shape used to draw the cutout.
         */
        shape: DisplayCutoutShape;
        /**
         * Border radius for rounded cutout shapes.
         */
        borderRadius?: integer;
        /**
         * Upper shoulder radius for notch cutout shapes.
         */
        upperRadius?: integer;
        /**
         * Lower transition radius for notch cutout shapes.
         */
        lowerRadius?: integer;
        /**
         * Center x coordinate for circle cutout shapes.
         */
        cx?: integer;
        /**
         * Center y coordinate for circle cutout shapes.
         */
        cy?: integer;
        /**
         * Radius for circle cutout shapes.
         */
        radius?: integer;
        /**
         * The cutout fill color (default: black).
         */
        contentColor?: DOM.RGBA;
    }
    /**
     * Configuration for Window Controls Overlay
     */
    interface WindowControlsOverlayConfig {
        /**
         * Whether the title bar CSS should be shown when emulating the Window Controls Overlay.
         */
        showCSS: boolean;
        /**
         * Selected platforms to show the overlay.
         */
        selectedPlatform: string;
        /**
         * The theme color defined in app manifest.
         */
        themeColor: string;
    }
    interface ContainerQueryHighlightConfig {
        /**
         * A descriptor for the highlight appearance of container query containers.
         */
        containerQueryContainerHighlightConfig: ContainerQueryContainerHighlightConfig;
        /**
         * Identifier of the container node to highlight.
         */
        nodeId: DOM.NodeId;
    }
    interface ContainerQueryContainerHighlightConfig {
        /**
         * The style of the container border.
         */
        containerBorder?: LineStyle;
        /**
         * The style of the descendants' borders.
         */
        descendantBorder?: LineStyle;
    }
    interface IsolatedElementHighlightConfig {
        /**
         * A descriptor for the highlight appearance of an element in isolation mode.
         */
        isolationModeHighlightConfig: IsolationModeHighlightConfig;
        /**
         * Identifier of the isolated element to highlight.
         */
        nodeId: DOM.NodeId;
    }
    interface IsolationModeHighlightConfig {
        /**
         * The fill color of the resizers (default: transparent).
         */
        resizerColor?: DOM.RGBA;
        /**
         * The fill color for resizer handles (default: transparent).
         */
        resizerHandleColor?: DOM.RGBA;
        /**
         * The fill color for the mask covering non-isolated elements (default: transparent).
         */
        maskColor?: DOM.RGBA;
    }
    const enum InspectMode {
        SearchForNode = "searchForNode",
        SearchForUAShadowDOM = "searchForUAShadowDOM",
        CaptureAreaScreenshot = "captureAreaScreenshot",
        None = "none"
    }
    interface InspectedElementAnchorConfig {
        /**
         * Identifier of the node to highlight.
         */
        nodeId?: DOM.NodeId;
        /**
         * Identifier of the backend node to highlight.
         */
        backendNodeId?: DOM.BackendNodeId;
    }
    interface GetHighlightObjectForTestRequest {
        /**
         * Id of the node to get highlight object for.
         */
        nodeId: DOM.NodeId;
        /**
         * Whether to include distance info.
         */
        includeDistance?: boolean;
        /**
         * Whether to include style info.
         */
        includeStyle?: boolean;
        /**
         * The color format to get config with (default: hex).
         */
        colorFormat?: ColorFormat;
        /**
         * Whether to show accessibility info (default: true).
         */
        showAccessibilityInfo?: boolean;
    }
    interface GetHighlightObjectForTestResponse extends ProtocolResponseWithError {
        /**
         * Highlight data for the node.
         */
        highlight: any;
    }
    interface GetGridHighlightObjectsForTestRequest {
        /**
         * Ids of the node to get highlight object for.
         */
        nodeIds: DOM.NodeId[];
    }
    interface GetGridHighlightObjectsForTestResponse extends ProtocolResponseWithError {
        /**
         * Grid Highlight data for the node ids provided.
         */
        highlights: any;
    }
    interface GetSourceOrderHighlightObjectForTestRequest {
        /**
         * Id of the node to highlight.
         */
        nodeId: DOM.NodeId;
    }
    interface GetSourceOrderHighlightObjectForTestResponse extends ProtocolResponseWithError {
        /**
         * Source order highlight data for the node id provided.
         */
        highlight: any;
    }
    interface HighlightFrameRequest {
        /**
         * Identifier of the frame to highlight.
         */
        frameId: Page.FrameId;
        /**
         * The content box highlight fill color (default: transparent).
         */
        contentColor?: DOM.RGBA;
        /**
         * The content box highlight outline color (default: transparent).
         */
        contentOutlineColor?: DOM.RGBA;
    }
    interface HighlightNodeRequest {
        /**
         * A descriptor for the highlight appearance.
         */
        highlightConfig: HighlightConfig;
        /**
         * Identifier of the node to highlight.
         */
        nodeId?: DOM.NodeId;
        /**
         * Identifier of the backend node to highlight.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * JavaScript object id of the node to be highlighted.
         */
        objectId?: Runtime.RemoteObjectId;
        /**
         * Selectors to highlight relevant nodes.
         */
        selector?: string;
    }
    interface HighlightQuadRequest {
        /**
         * Quad to highlight
         */
        quad: DOM.Quad;
        /**
         * The highlight fill color (default: transparent).
         */
        color?: DOM.RGBA;
        /**
         * The highlight outline color (default: transparent).
         */
        outlineColor?: DOM.RGBA;
    }
    interface HighlightRectRequest {
        /**
         * X coordinate
         */
        x: integer;
        /**
         * Y coordinate
         */
        y: integer;
        /**
         * Rectangle width
         */
        width: integer;
        /**
         * Rectangle height
         */
        height: integer;
        /**
         * The highlight fill color (default: transparent).
         */
        color?: DOM.RGBA;
        /**
         * The highlight outline color (default: transparent).
         */
        outlineColor?: DOM.RGBA;
    }
    interface HighlightSourceOrderRequest {
        /**
         * A descriptor for the appearance of the overlay drawing.
         */
        sourceOrderConfig: SourceOrderConfig;
        /**
         * Identifier of the node to highlight.
         */
        nodeId?: DOM.NodeId;
        /**
         * Identifier of the backend node to highlight.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * JavaScript object id of the node to be highlighted.
         */
        objectId?: Runtime.RemoteObjectId;
    }
    interface SetInspectModeRequest {
        /**
         * Set an inspection mode.
         */
        mode: InspectMode;
        /**
         * A descriptor for the highlight appearance of hovered-over nodes. May be omitted if `enabled
         * == false`.
         */
        highlightConfig?: HighlightConfig;
    }
    interface SetShowAdHighlightsRequest {
        /**
         * True for showing ad highlights
         */
        show: boolean;
    }
    interface SetPausedInDebuggerMessageRequest {
        /**
         * The message to display, also triggers resume and step over controls.
         */
        message?: string;
    }
    interface SetShowDebugBordersRequest {
        /**
         * True for showing debug borders
         */
        show: boolean;
    }
    interface SetShowFPSCounterRequest {
        /**
         * True for showing the FPS counter
         */
        show: boolean;
    }
    interface SetShowGridOverlaysRequest {
        /**
         * An array of node identifiers and descriptors for the highlight appearance.
         */
        gridNodeHighlightConfigs: GridNodeHighlightConfig[];
    }
    interface SetShowFlexOverlaysRequest {
        /**
         * An array of node identifiers and descriptors for the highlight appearance.
         */
        flexNodeHighlightConfigs: FlexNodeHighlightConfig[];
    }
    interface SetShowScrollSnapOverlaysRequest {
        /**
         * An array of node identifiers and descriptors for the highlight appearance.
         */
        scrollSnapHighlightConfigs: ScrollSnapHighlightConfig[];
    }
    interface SetShowContainerQueryOverlaysRequest {
        /**
         * An array of node identifiers and descriptors for the highlight appearance.
         */
        containerQueryHighlightConfigs: ContainerQueryHighlightConfig[];
    }
    interface SetShowInspectedElementAnchorRequest {
        /**
         * Node identifier for which to show an anchor for.
         */
        inspectedElementAnchorConfig: InspectedElementAnchorConfig;
    }
    interface SetShowPaintRectsRequest {
        /**
         * True for showing paint rectangles
         */
        result: boolean;
    }
    interface SetShowLayoutShiftRegionsRequest {
        /**
         * True for showing layout shift regions
         */
        result: boolean;
    }
    interface SetShowScrollBottleneckRectsRequest {
        /**
         * True for showing scroll bottleneck rects
         */
        show: boolean;
    }
    interface SetShowHitTestBordersRequest {
        /**
         * True for showing hit-test borders
         */
        show: boolean;
    }
    interface SetShowWebVitalsRequest {
        show: boolean;
    }
    interface SetShowViewportSizeOnResizeRequest {
        /**
         * Whether to paint size or not.
         */
        show: boolean;
    }
    interface SetShowHingeRequest {
        /**
         * hinge data, null means hideHinge
         */
        hingeConfig?: HingeConfig;
    }
    interface SetShowDisplayCutoutRequest {
        /**
         * display cutout data, null means hide display cutout
         */
        displayCutoutConfig?: DisplayCutoutConfig;
    }
    interface SetShowIsolatedElementsRequest {
        /**
         * An array of node identifiers and descriptors for the highlight appearance.
         */
        isolatedElementHighlightConfigs: IsolatedElementHighlightConfig[];
    }
    interface SetShowWindowControlsOverlayRequest {
        /**
         * Window Controls Overlay data, null means hide Window Controls Overlay
         */
        windowControlsOverlayConfig?: WindowControlsOverlayConfig;
    }
    /**
     * Fired when the node should be inspected. This happens after call to `setInspectMode` or when
     * user manually inspects an element.
     */
    interface InspectNodeRequestedEvent {
        /**
         * Id of the node to inspect.
         */
        backendNodeId: DOM.BackendNodeId;
    }
    /**
     * Fired when the node should be highlighted. This happens after call to `setInspectMode`.
     */
    interface NodeHighlightRequestedEvent {
        nodeId: DOM.NodeId;
    }
    /**
     * Fired when user asks to capture screenshot of some area on the page.
     */
    interface ScreenshotRequestedEvent {
        /**
         * Viewport to capture, in device independent pixels (dip).
         */
        viewport: Page.Viewport;
    }
    /**
     * Fired when user asks to show the Inspect panel.
     */
    interface InspectPanelShowRequestedEvent {
        /**
         * Id of the node to show in the panel.
         */
        backendNodeId: DOM.BackendNodeId;
    }
    /**
     * Fired when user asks to restore the Inspected Element floating window.
     */
    interface InspectedElementWindowRestoredEvent {
        /**
         * Id of the node to restore the floating window for.
         */
        backendNodeId: DOM.BackendNodeId;
    }
}
/**
 * This domain allows interacting with the browser to control PWAs.
 */
export declare namespace PWA {
    /**
     * The following types are the replica of
     * https://crsrc.org/c/chrome/browser/web_applications/proto/web_app_os_integration_state.proto;drc=9910d3be894c8f142c977ba1023f30a656bc13fc;l=67
     */
    interface FileHandlerAccept {
        /**
         * New name of the mimetype according to
         * https://www.iana.org/assignments/media-types/media-types.xhtml
         */
        mediaType: string;
        fileExtensions: string[];
    }
    interface FileHandler {
        action: string;
        accepts: FileHandlerAccept[];
        displayName: string;
    }
    /**
     * If user prefers opening the app in browser or an app window.
     */
    const enum DisplayMode {
        Standalone = "standalone",
        Browser = "browser"
    }
    interface GetOsAppStateRequest {
        /**
         * The id from the webapp's manifest file, commonly it's the url of the
         * site installing the webapp. See
         * https://web.dev/learn/pwa/web-app-manifest.
         */
        manifestId: string;
    }
    interface GetOsAppStateResponse extends ProtocolResponseWithError {
        badgeCount: integer;
        fileHandlers: FileHandler[];
    }
    interface InstallRequest {
        manifestId: string;
        /**
         * The location of the app or bundle overriding the one derived from the
         * manifestId.
         */
        installUrlOrBundleUrl?: string;
    }
    interface UninstallRequest {
        manifestId: string;
    }
    interface LaunchRequest {
        manifestId: string;
        url?: string;
    }
    interface LaunchResponse extends ProtocolResponseWithError {
        /**
         * ID of the tab target created as a result.
         */
        targetId: Target.TargetID;
    }
    interface LaunchFilesInAppRequest {
        manifestId: string;
        files: string[];
    }
    interface LaunchFilesInAppResponse extends ProtocolResponseWithError {
        /**
         * IDs of the tab targets created as the result.
         */
        targetIds: Target.TargetID[];
    }
    interface OpenCurrentPageInAppRequest {
        manifestId: string;
    }
    interface ChangeAppUserSettingsRequest {
        manifestId: string;
        /**
         * If user allows the links clicked on by the user in the app's scope, or
         * extended scope if the manifest has scope extensions and the flags
         * `DesktopPWAsLinkCapturingWithScopeExtensions` and
         * `WebAppEnableScopeExtensions` are enabled.
         *
         * Note, the API does not support resetting the linkCapturing to the
         * initial value, uninstalling and installing the web app again will reset
         * it.
         *
         * TODO(crbug.com/339453269): Setting this value on ChromeOS is not
         * supported yet.
         */
        linkCapturing?: boolean;
        displayMode?: DisplayMode;
    }
}
/**
 * Actions and events related to the inspected page belong to the page domain.
 */
export declare namespace Page {
    /**
     * Unique frame identifier.
     */
    type FrameId = OpaqueIdentifier<string, 'Protocol.Page.FrameId'>;
    /**
     * Indicates whether a frame has been identified as an ad.
     */
    const enum AdFrameType {
        None = "none",
        Child = "child",
        Root = "root"
    }
    const enum AdFrameExplanation {
        ParentIsAd = "ParentIsAd",
        CreatedByAdScript = "CreatedByAdScript",
        MatchedBlockingRule = "MatchedBlockingRule"
    }
    /**
     * Indicates whether a frame has been identified as an ad and why.
     */
    interface AdFrameStatus {
        adFrameType: AdFrameType;
        explanations?: AdFrameExplanation[];
    }
    /**
     * Indicates whether the frame is a secure context and why it is the case.
     */
    const enum SecureContextType {
        Secure = "Secure",
        SecureLocalhost = "SecureLocalhost",
        InsecureScheme = "InsecureScheme",
        InsecureAncestor = "InsecureAncestor"
    }
    /**
     * Indicates whether the frame is cross-origin isolated and why it is the case.
     */
    const enum CrossOriginIsolatedContextType {
        Isolated = "Isolated",
        NotIsolated = "NotIsolated",
        NotIsolatedFeatureDisabled = "NotIsolatedFeatureDisabled"
    }
    const enum GatedAPIFeatures {
        SharedArrayBuffers = "SharedArrayBuffers",
        SharedArrayBuffersTransferAllowed = "SharedArrayBuffersTransferAllowed",
        PerformanceMeasureMemory = "PerformanceMeasureMemory",
        PerformanceProfile = "PerformanceProfile"
    }
    /**
     * All Permissions Policy features. This enum should match the one defined
     * in services/network/public/cpp/permissions_policy/permissions_policy_features.json5.
     * LINT_SKIP.IfChange(PermissionsPolicyFeature)
     */
    const enum PermissionsPolicyFeature {
        Accelerometer = "accelerometer",
        AllScreensCapture = "all-screens-capture",
        AmbientLightSensor = "ambient-light-sensor",
        AriaNotify = "aria-notify",
        Autofill = "autofill",
        Autoplay = "autoplay",
        Bluetooth = "bluetooth",
        BrowsingTopics = "browsing-topics",
        Camera = "camera",
        CapturedSurfaceControl = "captured-surface-control",
        ChDpr = "ch-dpr",
        ChDeviceMemory = "ch-device-memory",
        ChDownlink = "ch-downlink",
        ChEct = "ch-ect",
        ChPrefersColorScheme = "ch-prefers-color-scheme",
        ChPrefersReducedMotion = "ch-prefers-reduced-motion",
        ChPrefersReducedTransparency = "ch-prefers-reduced-transparency",
        ChRtt = "ch-rtt",
        ChSaveData = "ch-save-data",
        ChUa = "ch-ua",
        ChUaArch = "ch-ua-arch",
        ChUaBitness = "ch-ua-bitness",
        ChUaHighEntropyValues = "ch-ua-high-entropy-values",
        ChUaPlatform = "ch-ua-platform",
        ChUaModel = "ch-ua-model",
        ChUaMobile = "ch-ua-mobile",
        ChUaFormFactors = "ch-ua-form-factors",
        ChUaFullVersion = "ch-ua-full-version",
        ChUaFullVersionList = "ch-ua-full-version-list",
        ChUaPlatformVersion = "ch-ua-platform-version",
        ChUaWow64 = "ch-ua-wow64",
        ChViewportHeight = "ch-viewport-height",
        ChViewportWidth = "ch-viewport-width",
        ChWidth = "ch-width",
        ClipboardRead = "clipboard-read",
        ClipboardWrite = "clipboard-write",
        ComputePressure = "compute-pressure",
        ControlledFrame = "controlled-frame",
        CrossOriginIsolated = "cross-origin-isolated",
        DeferredFetch = "deferred-fetch",
        DeferredFetchMinimal = "deferred-fetch-minimal",
        DeviceAttributes = "device-attributes",
        DigitalCredentialsCreate = "digital-credentials-create",
        DigitalCredentialsGet = "digital-credentials-get",
        DirectSockets = "direct-sockets",
        DirectSocketsMulticast = "direct-sockets-multicast",
        DisplayCapture = "display-capture",
        DocumentDomain = "document-domain",
        EncryptedMedia = "encrypted-media",
        ExecutionWhileOutOfViewport = "execution-while-out-of-viewport",
        ExecutionWhileNotRendered = "execution-while-not-rendered",
        FocusWithoutUserActivation = "focus-without-user-activation",
        Fullscreen = "fullscreen",
        Frobulate = "frobulate",
        Gamepad = "gamepad",
        Geolocation = "geolocation",
        Gyroscope = "gyroscope",
        Haptics = "haptics",
        Hid = "hid",
        IdentityCredentialsGet = "identity-credentials-get",
        IdleDetection = "idle-detection",
        InterestCohort = "interest-cohort",
        KeyboardMap = "keyboard-map",
        LanguageDetector = "language-detector",
        LanguageModel = "language-model",
        LocalFonts = "local-fonts",
        LocalNetwork = "local-network",
        LocalNetworkAccess = "local-network-access",
        LoopbackNetwork = "loopback-network",
        Magnetometer = "magnetometer",
        ManualText = "manual-text",
        MediaPlaybackWhileNotVisible = "media-playback-while-not-visible",
        Microphone = "microphone",
        Midi = "midi",
        OnDeviceSpeechRecognition = "on-device-speech-recognition",
        OtpCredentials = "otp-credentials",
        Payment = "payment",
        PictureInPicture = "picture-in-picture",
        PrivateStateTokenIssuance = "private-state-token-issuance",
        PrivateStateTokenRedemption = "private-state-token-redemption",
        PublickeyCredentialsCreate = "publickey-credentials-create",
        PublickeyCredentialsGet = "publickey-credentials-get",
        PublickeyCredentialsRemoteClientDataJson = "publickey-credentials-remote-client-data-json",
        Rewriter = "rewriter",
        ScreenWakeLock = "screen-wake-lock",
        Serial = "serial",
        SmartCard = "smart-card",
        SpeakerSelection = "speaker-selection",
        StorageAccess = "storage-access",
        SubApps = "sub-apps",
        Summarizer = "summarizer",
        SyncXhr = "sync-xhr",
        Tools = "tools",
        Translator = "translator",
        UnboundedElement = "unbounded-element",
        Unload = "unload",
        Usb = "usb",
        UsbUnrestricted = "usb-unrestricted",
        VerticalScroll = "vertical-scroll",
        WebAppInstallation = "web-app-installation",
        Webnn = "webnn",
        WebPrinting = "web-printing",
        WebShare = "web-share",
        WindowManagement = "window-management",
        Writer = "writer",
        XrSpatialTracking = "xr-spatial-tracking"
    }
    /**
     * Reason for a permissions policy feature to be disabled.
     */
    const enum PermissionsPolicyBlockReason {
        Header = "Header",
        IframeAttribute = "IframeAttribute",
        InFencedFrameTree = "InFencedFrameTree",
        InIsolatedApp = "InIsolatedApp"
    }
    interface PermissionsPolicyBlockLocator {
        frameId: FrameId;
        blockReason: PermissionsPolicyBlockReason;
    }
    interface PermissionsPolicyFeatureState {
        feature: PermissionsPolicyFeature;
        allowed: boolean;
        locator?: PermissionsPolicyBlockLocator;
    }
    /**
     * Origin Trial(https://www.chromium.org/blink/origin-trials) support.
     * Status for an Origin Trial token.
     */
    const enum OriginTrialTokenStatus {
        Success = "Success",
        NotSupported = "NotSupported",
        Insecure = "Insecure",
        Expired = "Expired",
        WrongOrigin = "WrongOrigin",
        InvalidSignature = "InvalidSignature",
        Malformed = "Malformed",
        WrongVersion = "WrongVersion",
        FeatureDisabled = "FeatureDisabled",
        TokenDisabled = "TokenDisabled",
        FeatureDisabledForUser = "FeatureDisabledForUser",
        UnknownTrial = "UnknownTrial"
    }
    /**
     * Status for an Origin Trial.
     */
    const enum OriginTrialStatus {
        Enabled = "Enabled",
        ValidTokenNotProvided = "ValidTokenNotProvided",
        OSNotSupported = "OSNotSupported",
        TrialNotAllowed = "TrialNotAllowed"
    }
    const enum OriginTrialUsageRestriction {
        None = "None",
        Subset = "Subset"
    }
    interface OriginTrialToken {
        origin: string;
        matchSubDomains: boolean;
        trialName: string;
        expiryTime: Network.TimeSinceEpoch;
        isThirdParty: boolean;
        usageRestriction: OriginTrialUsageRestriction;
    }
    interface OriginTrialTokenWithStatus {
        rawTokenText: string;
        /**
         * `parsedToken` is present only when the token is extractable and
         * parsable.
         */
        parsedToken?: OriginTrialToken;
        status: OriginTrialTokenStatus;
    }
    interface OriginTrial {
        trialName: string;
        status: OriginTrialStatus;
        tokensWithStatus: OriginTrialTokenWithStatus[];
    }
    /**
     * Additional information about the frame document's security origin.
     */
    interface SecurityOriginDetails {
        /**
         * Indicates whether the frame document's security origin is one
         * of the local hostnames (e.g. "localhost") or IP addresses (IPv4
         * 127.0.0.0/8 or IPv6 ::1).
         */
        isLocalhost: boolean;
    }
    /**
     * Information about the Frame on the page.
     */
    interface Frame {
        /**
         * Frame unique identifier.
         */
        id: FrameId;
        /**
         * Parent frame identifier.
         */
        parentId?: FrameId;
        /**
         * Identifier of the loader associated with this frame.
         */
        loaderId: Network.LoaderId;
        /**
         * Frame's name as specified in the tag.
         */
        name?: string;
        /**
         * Frame document's URL without fragment.
         */
        url: string;
        /**
         * Frame document's URL fragment including the '#'.
         */
        urlFragment?: string;
        /**
         * Frame document's registered domain, taking the public suffixes list into account.
         * Extracted from the Frame's url.
         * Example URLs: http://www.google.com/file.html -> "google.com"
         *               http://a.b.co.uk/file.html      -> "b.co.uk"
         */
        domainAndRegistry: string;
        /**
         * Frame document's security origin.
         */
        securityOrigin: string;
        /**
         * Additional details about the frame document's security origin.
         */
        securityOriginDetails?: SecurityOriginDetails;
        /**
         * Frame document's mimeType as determined by the browser.
         */
        mimeType: string;
        /**
         * If the frame failed to load, this contains the URL that could not be loaded. Note that unlike url above, this URL may contain a fragment.
         */
        unreachableUrl?: string;
        /**
         * Indicates whether this frame was tagged as an ad and why.
         */
        adFrameStatus?: AdFrameStatus;
        /**
         * Indicates whether the main document is a secure context and explains why that is the case.
         */
        secureContextType: SecureContextType;
        /**
         * Indicates whether this is a cross origin isolated context.
         */
        crossOriginIsolatedContextType: CrossOriginIsolatedContextType;
        /**
         * Indicated which gated APIs / features are available.
         */
        gatedAPIFeatures: GatedAPIFeatures[];
    }
    /**
     * Information about the Resource on the page.
     */
    interface FrameResource {
        /**
         * Resource URL.
         */
        url: string;
        /**
         * Type of this resource.
         */
        type: Network.ResourceType;
        /**
         * Resource mimeType as determined by the browser.
         */
        mimeType: string;
        /**
         * last-modified timestamp as reported by server.
         */
        lastModified?: Network.TimeSinceEpoch;
        /**
         * Resource content size.
         */
        contentSize?: number;
        /**
         * True if the resource failed to load.
         */
        failed?: boolean;
        /**
         * True if the resource was canceled during loading.
         */
        canceled?: boolean;
    }
    /**
     * Information about the Frame hierarchy along with their cached resources.
     */
    interface FrameResourceTree {
        /**
         * Frame information for this tree item.
         */
        frame: Frame;
        /**
         * Child frames.
         */
        childFrames?: FrameResourceTree[];
        /**
         * Information about frame resources.
         */
        resources: FrameResource[];
    }
    /**
     * Information about the Frame hierarchy.
     */
    interface FrameTree {
        /**
         * Frame information for this tree item.
         */
        frame: Frame;
        /**
         * Child frames.
         */
        childFrames?: FrameTree[];
    }
    /**
     * Unique script identifier.
     */
    type ScriptIdentifier = OpaqueIdentifier<string, 'Protocol.Page.ScriptIdentifier'>;
    /**
     * Transition type.
     */
    const enum TransitionType {
        Link = "link",
        Typed = "typed",
        Address_bar = "address_bar",
        Auto_bookmark = "auto_bookmark",
        Auto_subframe = "auto_subframe",
        Manual_subframe = "manual_subframe",
        Generated = "generated",
        Auto_toplevel = "auto_toplevel",
        Form_submit = "form_submit",
        Reload = "reload",
        Keyword = "keyword",
        Keyword_generated = "keyword_generated",
        Other = "other"
    }
    /**
     * Navigation history entry.
     */
    interface NavigationEntry {
        /**
         * Unique id of the navigation history entry.
         */
        id: integer;
        /**
         * URL of the navigation history entry.
         */
        url: string;
        /**
         * URL that the user typed in the url bar.
         */
        userTypedURL: string;
        /**
         * Title of the navigation history entry.
         */
        title: string;
        /**
         * Transition type.
         */
        transitionType: TransitionType;
    }
    /**
     * Screencast frame metadata.
     */
    interface ScreencastFrameMetadata {
        /**
         * Top offset in DIP.
         */
        offsetTop: number;
        /**
         * Page scale factor.
         */
        pageScaleFactor: number;
        /**
         * Device screen width in DIP.
         */
        deviceWidth: number;
        /**
         * Device screen height in DIP.
         */
        deviceHeight: number;
        /**
         * Position of horizontal scroll in CSS pixels.
         */
        scrollOffsetX: number;
        /**
         * Position of vertical scroll in CSS pixels.
         */
        scrollOffsetY: number;
        /**
         * Frame swap timestamp.
         */
        timestamp?: Network.TimeSinceEpoch;
        /**
         * Frame swap timestamp as monotonic time.
         */
        monotonicTimestamp?: Network.MonotonicTime;
    }
    /**
     * Javascript dialog type.
     */
    const enum DialogType {
        Alert = "alert",
        Confirm = "confirm",
        Prompt = "prompt",
        Beforeunload = "beforeunload"
    }
    /**
     * Error while paring app manifest.
     */
    interface AppManifestError {
        /**
         * Error message.
         */
        message: string;
        /**
         * If critical, this is a non-recoverable parse error.
         */
        critical: integer;
        /**
         * Error line.
         */
        line: integer;
        /**
         * Error column.
         */
        column: integer;
    }
    /**
     * Parsed app manifest properties.
     */
    interface AppManifestParsedProperties {
        /**
         * Computed scope value
         */
        scope: string;
    }
    /**
     * Layout viewport position and dimensions.
     */
    interface LayoutViewport {
        /**
         * Horizontal offset relative to the document (CSS pixels).
         */
        pageX: integer;
        /**
         * Vertical offset relative to the document (CSS pixels).
         */
        pageY: integer;
        /**
         * Width (CSS pixels), excludes scrollbar if present.
         */
        clientWidth: integer;
        /**
         * Height (CSS pixels), excludes scrollbar if present.
         */
        clientHeight: integer;
    }
    /**
     * Visual viewport position, dimensions, and scale.
     */
    interface VisualViewport {
        /**
         * Horizontal offset relative to the layout viewport (CSS pixels).
         */
        offsetX: number;
        /**
         * Vertical offset relative to the layout viewport (CSS pixels).
         */
        offsetY: number;
        /**
         * Horizontal offset relative to the document (CSS pixels).
         */
        pageX: number;
        /**
         * Vertical offset relative to the document (CSS pixels).
         */
        pageY: number;
        /**
         * Width (CSS pixels), excludes scrollbar if present.
         */
        clientWidth: number;
        /**
         * Height (CSS pixels), excludes scrollbar if present.
         */
        clientHeight: number;
        /**
         * Scale relative to the ideal viewport (size at width=device-width).
         */
        scale: number;
        /**
         * Page zoom factor (CSS to device independent pixels ratio).
         */
        zoom?: number;
    }
    /**
     * Viewport for capturing screenshot.
     */
    interface Viewport {
        /**
         * X offset in device independent pixels (dip).
         */
        x: number;
        /**
         * Y offset in device independent pixels (dip).
         */
        y: number;
        /**
         * Rectangle width in device independent pixels (dip).
         */
        width: number;
        /**
         * Rectangle height in device independent pixels (dip).
         */
        height: number;
        /**
         * Page scale factor.
         */
        scale: number;
    }
    /**
     * Generic font families collection.
     */
    interface FontFamilies {
        /**
         * The standard font-family.
         */
        standard?: string;
        /**
         * The fixed font-family.
         */
        fixed?: string;
        /**
         * The serif font-family.
         */
        serif?: string;
        /**
         * The sansSerif font-family.
         */
        sansSerif?: string;
        /**
         * The cursive font-family.
         */
        cursive?: string;
        /**
         * The fantasy font-family.
         */
        fantasy?: string;
        /**
         * The math font-family.
         */
        math?: string;
    }
    /**
     * Font families collection for a script.
     */
    interface ScriptFontFamilies {
        /**
         * Name of the script which these font families are defined for.
         */
        script: string;
        /**
         * Generic font families collection for the script.
         */
        fontFamilies: FontFamilies;
    }
    /**
     * Default font sizes.
     */
    interface FontSizes {
        /**
         * Default standard font size.
         */
        standard?: integer;
        /**
         * Default fixed font size.
         */
        fixed?: integer;
    }
    const enum ClientNavigationReason {
        AnchorClick = "anchorClick",
        FormSubmissionGet = "formSubmissionGet",
        FormSubmissionPost = "formSubmissionPost",
        HttpHeaderRefresh = "httpHeaderRefresh",
        InitialFrameNavigation = "initialFrameNavigation",
        MetaTagRefresh = "metaTagRefresh",
        Other = "other",
        PageBlockInterstitial = "pageBlockInterstitial",
        Reload = "reload",
        ScriptInitiated = "scriptInitiated"
    }
    const enum ClientNavigationDisposition {
        CurrentTab = "currentTab",
        NewTab = "newTab",
        NewWindow = "newWindow",
        Download = "download"
    }
    interface InstallabilityErrorArgument {
        /**
         * Argument name (e.g. name:'minimum-icon-size-in-pixels').
         */
        name: string;
        /**
         * Argument value (e.g. value:'64').
         */
        value: string;
    }
    /**
     * The installability error
     */
    interface InstallabilityError {
        /**
         * The error id (e.g. 'manifest-missing-suitable-icon').
         */
        errorId: string;
        /**
         * The list of error arguments (e.g. {name:'minimum-icon-size-in-pixels', value:'64'}).
         */
        errorArguments: InstallabilityErrorArgument[];
    }
    /**
     * The referring-policy used for the navigation.
     */
    const enum ReferrerPolicy {
        NoReferrer = "noReferrer",
        NoReferrerWhenDowngrade = "noReferrerWhenDowngrade",
        Origin = "origin",
        OriginWhenCrossOrigin = "originWhenCrossOrigin",
        SameOrigin = "sameOrigin",
        StrictOrigin = "strictOrigin",
        StrictOriginWhenCrossOrigin = "strictOriginWhenCrossOrigin",
        UnsafeUrl = "unsafeUrl"
    }
    /**
     * Per-script compilation cache parameters for `Page.produceCompilationCache`
     */
    interface CompilationCacheParams {
        /**
         * The URL of the script to produce a compilation cache entry for.
         */
        url: string;
        /**
         * A hint to the backend whether eager compilation is recommended.
         * (the actual compilation mode used is upon backend discretion).
         */
        eager?: boolean;
    }
    interface FileFilter {
        name?: string;
        accepts?: string[];
    }
    interface FileHandler {
        action: string;
        name: string;
        /**
         * Mimic a map, name is the key, accepts is the value.
         */
        accepts?: FileFilter[];
        /**
         * Won't repeat the enums, using string for easy comparison. Same as the
         * other enums below.
         */
        launchType: string;
    }
    /**
     * The image definition used in both icon and screenshot.
     */
    interface ImageResource {
        /**
         * The src field in the definition, but changing to url in favor of
         * consistency.
         */
        url: string;
        sizes?: string;
        type?: string;
    }
    interface LaunchHandler {
        clientMode: string;
    }
    interface ProtocolHandler {
        protocol: string;
        url: string;
    }
    interface RelatedApplication {
        id?: string;
        url: string;
    }
    interface ScopeExtension {
        /**
         * Instead of using tuple, this field always returns the serialized string
         * for easy understanding and comparison.
         */
        origin: string;
        hasOriginWildcard: boolean;
    }
    interface Screenshot {
        image: ImageResource;
        formFactor: string;
        label?: string;
    }
    interface ShareTarget {
        action: string;
        method: string;
        enctype: string;
        /**
         * Embed the ShareTargetParams
         */
        title?: string;
        text?: string;
        url?: string;
        files?: FileFilter[];
    }
    interface Shortcut {
        name: string;
        url: string;
    }
    interface WebAppManifest {
        backgroundColor?: string;
        /**
         * The extra description provided by the manifest.
         */
        description?: string;
        dir?: string;
        display?: string;
        /**
         * The overrided display mode controlled by the user.
         */
        displayOverrides?: string[];
        /**
         * The handlers to open files.
         */
        fileHandlers?: FileHandler[];
        icons?: ImageResource[];
        id?: string;
        lang?: string;
        /**
         * TODO(crbug.com/1231886): This field is non-standard and part of a Chrome
         * experiment. See:
         * https://github.com/WICG/web-app-launch/blob/main/launch_handler.md
         */
        launchHandler?: LaunchHandler;
        name?: string;
        orientation?: string;
        preferRelatedApplications?: boolean;
        /**
         * The handlers to open protocols.
         */
        protocolHandlers?: ProtocolHandler[];
        relatedApplications?: RelatedApplication[];
        scope?: string;
        /**
         * Non-standard, see
         * https://github.com/WICG/manifest-incubations/blob/gh-pages/scope_extensions-explainer.md
         */
        scopeExtensions?: ScopeExtension[];
        /**
         * The screenshots used by chromium.
         */
        screenshots?: Screenshot[];
        shareTarget?: ShareTarget;
        shortName?: string;
        shortcuts?: Shortcut[];
        startUrl?: string;
        themeColor?: string;
    }
    interface SubApp {
        /**
         * Display name of the sub-app.
         */
        name: string;
        /**
         * Scope of the sub-app.
         */
        scope: string;
        /**
         * Manifest id of the sub-app.
         */
        manifestId: string;
        /**
         * Start URL of the sub-app.
         */
        startUrl: string;
    }
    /**
     * The type of a frameNavigated event.
     */
    const enum NavigationType {
        Navigation = "Navigation",
        BackForwardCacheRestore = "BackForwardCacheRestore"
    }
    /**
     * List of not restored reasons for back-forward cache.
     */
    const enum BackForwardCacheNotRestoredReason {
        NotPrimaryMainFrame = "NotPrimaryMainFrame",
        BackForwardCacheDisabled = "BackForwardCacheDisabled",
        RelatedActiveContentsExist = "RelatedActiveContentsExist",
        HTTPStatusNotOK = "HTTPStatusNotOK",
        SchemeNotHTTPOrHTTPS = "SchemeNotHTTPOrHTTPS",
        Loading = "Loading",
        WasGrantedMediaAccess = "WasGrantedMediaAccess",
        DisableForRenderFrameHostCalled = "DisableForRenderFrameHostCalled",
        DomainNotAllowed = "DomainNotAllowed",
        HTTPMethodNotGET = "HTTPMethodNotGET",
        SubframeIsNavigating = "SubframeIsNavigating",
        Timeout = "Timeout",
        CacheLimit = "CacheLimit",
        JavaScriptExecution = "JavaScriptExecution",
        RendererProcessKilled = "RendererProcessKilled",
        RendererProcessCrashed = "RendererProcessCrashed",
        SchedulerTrackedFeatureUsed = "SchedulerTrackedFeatureUsed",
        ConflictingBrowsingInstance = "ConflictingBrowsingInstance",
        CacheFlushed = "CacheFlushed",
        ServiceWorkerVersionActivation = "ServiceWorkerVersionActivation",
        SessionRestored = "SessionRestored",
        ServiceWorkerPostMessage = "ServiceWorkerPostMessage",
        EnteredBackForwardCacheBeforeServiceWorkerHostAdded = "EnteredBackForwardCacheBeforeServiceWorkerHostAdded",
        RenderFrameHostReused_SameSite = "RenderFrameHostReused_SameSite",
        RenderFrameHostReused_CrossSite = "RenderFrameHostReused_CrossSite",
        ServiceWorkerClaim = "ServiceWorkerClaim",
        IgnoreEventAndEvict = "IgnoreEventAndEvict",
        HaveInnerContents = "HaveInnerContents",
        TimeoutPuttingInCache = "TimeoutPuttingInCache",
        BackForwardCacheDisabledByLowMemory = "BackForwardCacheDisabledByLowMemory",
        BackForwardCacheDisabledByCommandLine = "BackForwardCacheDisabledByCommandLine",
        NetworkRequestDatAPIpeDrainedAsBytesConsumer = "NetworkRequestDatapipeDrainedAsBytesConsumer",
        NetworkRequestRedirected = "NetworkRequestRedirected",
        NetworkRequestTimeout = "NetworkRequestTimeout",
        NetworkExceedsBufferLimit = "NetworkExceedsBufferLimit",
        NavigationCancelledWhileRestoring = "NavigationCancelledWhileRestoring",
        NotMostRecentNavigationEntry = "NotMostRecentNavigationEntry",
        BackForwardCacheDisabledForPrerender = "BackForwardCacheDisabledForPrerender",
        UserAgentOverrideDiffers = "UserAgentOverrideDiffers",
        ForegroundCacheLimit = "ForegroundCacheLimit",
        ForwardCacheDisabled = "ForwardCacheDisabled",
        BrowsingInstanceNotSwapped = "BrowsingInstanceNotSwapped",
        BackForwardCacheDisabledForDelegate = "BackForwardCacheDisabledForDelegate",
        UnloadHandlerExistsInMainFrame = "UnloadHandlerExistsInMainFrame",
        UnloadHandlerExistsInSubFrame = "UnloadHandlerExistsInSubFrame",
        ServiceWorkerUnregistration = "ServiceWorkerUnregistration",
        CacheControlNoStore = "CacheControlNoStore",
        CacheControlNoStoreCookieModified = "CacheControlNoStoreCookieModified",
        CacheControlNoStoreHTTPOnlyCookieModified = "CacheControlNoStoreHTTPOnlyCookieModified",
        NoResponseHead = "NoResponseHead",
        Unknown = "Unknown",
        ActivationNavigationsDisallowedForBug1234857 = "ActivationNavigationsDisallowedForBug1234857",
        ErrorDocument = "ErrorDocument",
        FencedFramesEmbedder = "FencedFramesEmbedder",
        CookieDisabled = "CookieDisabled",
        HTTPAuthRequired = "HTTPAuthRequired",
        CookieFlushed = "CookieFlushed",
        BroadcastChannelOnMessage = "BroadcastChannelOnMessage",
        WebViewSettingsChanged = "WebViewSettingsChanged",
        WebViewJavaScriptObjectChanged = "WebViewJavaScriptObjectChanged",
        WebViewMessageListenerInjected = "WebViewMessageListenerInjected",
        WebViewSafeBrowsingAllowlistChanged = "WebViewSafeBrowsingAllowlistChanged",
        WebViewDocumentStartJavascriptChanged = "WebViewDocumentStartJavascriptChanged",
        WebSocket = "WebSocket",
        WebTransport = "WebTransport",
        WebRTC = "WebRTC",
        MainResourceHasCacheControlNoStore = "MainResourceHasCacheControlNoStore",
        MainResourceHasCacheControlNoCache = "MainResourceHasCacheControlNoCache",
        SubresourceHasCacheControlNoStore = "SubresourceHasCacheControlNoStore",
        SubresourceHasCacheControlNoCache = "SubresourceHasCacheControlNoCache",
        ContainsPlugins = "ContainsPlugins",
        DocumentLoaded = "DocumentLoaded",
        OutstandingNetworkRequestOthers = "OutstandingNetworkRequestOthers",
        RequestedMIDIPermission = "RequestedMIDIPermission",
        RequestedAudioCapturePermission = "RequestedAudioCapturePermission",
        RequestedVideoCapturePermission = "RequestedVideoCapturePermission",
        RequestedBackForwardCacheBlockedSensors = "RequestedBackForwardCacheBlockedSensors",
        RequestedBackgroundWorkPermission = "RequestedBackgroundWorkPermission",
        BroadcastChannel = "BroadcastChannel",
        WebXR = "WebXR",
        SharedWorker = "SharedWorker",
        SharedWorkerMessage = "SharedWorkerMessage",
        SharedWorkerWithNoActiveClient = "SharedWorkerWithNoActiveClient",
        WebLocks = "WebLocks",
        WebLocksContention = "WebLocksContention",
        WebHID = "WebHID",
        WebBluetooth = "WebBluetooth",
        WebShare = "WebShare",
        RequestedStorageAccessGrant = "RequestedStorageAccessGrant",
        WebNfc = "WebNfc",
        OutstandingNetworkRequestFetch = "OutstandingNetworkRequestFetch",
        OutstandingNetworkRequestXHR = "OutstandingNetworkRequestXHR",
        AppBanner = "AppBanner",
        Printing = "Printing",
        WebDatabase = "WebDatabase",
        PictureInPicture = "PictureInPicture",
        SpeechRecognizer = "SpeechRecognizer",
        IdleManager = "IdleManager",
        PaymentManager = "PaymentManager",
        SpeechSynthesis = "SpeechSynthesis",
        KeyboardLock = "KeyboardLock",
        WebOTPService = "WebOTPService",
        OutstandingNetworkRequestDirectSocket = "OutstandingNetworkRequestDirectSocket",
        InjectedJavascript = "InjectedJavascript",
        InjectedStyleSheet = "InjectedStyleSheet",
        KeepaliveRequest = "KeepaliveRequest",
        IndexedDBEvent = "IndexedDBEvent",
        Dummy = "Dummy",
        JsNetworkRequestReceivedCacheControlNoStoreResource = "JsNetworkRequestReceivedCacheControlNoStoreResource",
        WebRTCUsedWithCCNS = "WebRTCUsedWithCCNS",
        WebTransportUsedWithCCNS = "WebTransportUsedWithCCNS",
        WebSocketUsedWithCCNS = "WebSocketUsedWithCCNS",
        SmartCard = "SmartCard",
        LiveMediaStreamTrack = "LiveMediaStreamTrack",
        UnloadHandler = "UnloadHandler",
        ParserAborted = "ParserAborted",
        ContentSecurityHandler = "ContentSecurityHandler",
        ContentWebAuthenticationAPI = "ContentWebAuthenticationAPI",
        ContentFileChooser = "ContentFileChooser",
        ContentSerial = "ContentSerial",
        ContentFileSystemAccess = "ContentFileSystemAccess",
        ContentMediaDevicesDispatcherHost = "ContentMediaDevicesDispatcherHost",
        ContentWebBluetooth = "ContentWebBluetooth",
        ContentWebUSB = "ContentWebUSB",
        ContentMediaSessionService = "ContentMediaSessionService",
        ContentScreenReader = "ContentScreenReader",
        ContentDiscarded = "ContentDiscarded",
        EmbedderPopupBlockerTabHelper = "EmbedderPopupBlockerTabHelper",
        EmbedderSafeBrowsingTriggeredPopupBlocker = "EmbedderSafeBrowsingTriggeredPopupBlocker",
        EmbedderSafeBrowsingThreatDetails = "EmbedderSafeBrowsingThreatDetails",
        EmbedderAppBannerManager = "EmbedderAppBannerManager",
        EmbedderDomDistillerViewerSource = "EmbedderDomDistillerViewerSource",
        EmbedderDomDistillerSelfDeletingRequestDelegate = "EmbedderDomDistillerSelfDeletingRequestDelegate",
        EmbedderOomInterventionTabHelper = "EmbedderOomInterventionTabHelper",
        EmbedderOfflinePage = "EmbedderOfflinePage",
        EmbedderChromePasswordManagerClientBindCredentialManager = "EmbedderChromePasswordManagerClientBindCredentialManager",
        EmbedderPermissionRequestManager = "EmbedderPermissionRequestManager",
        EmbedderModalDialog = "EmbedderModalDialog",
        EmbedderExtensions = "EmbedderExtensions",
        EmbedderExtensionMessaging = "EmbedderExtensionMessaging",
        EmbedderExtensionMessagingForOpenPort = "EmbedderExtensionMessagingForOpenPort",
        EmbedderExtensionSentMessageToCachedFrame = "EmbedderExtensionSentMessageToCachedFrame",
        EmbedderExtensionFrame = "EmbedderExtensionFrame",
        EmbedderPrivilegedWebContents = "EmbedderPrivilegedWebContents",
        RequestedByWebViewClient = "RequestedByWebViewClient",
        PostMessageByWebViewClient = "PostMessageByWebViewClient",
        CacheControlNoStoreDeviceBoundSessionTerminated = "CacheControlNoStoreDeviceBoundSessionTerminated",
        CacheLimitPrunedOnModerateMemoryPressure = "CacheLimitPrunedOnModerateMemoryPressure",
        CacheLimitPrunedOnCriticalMemoryPressure = "CacheLimitPrunedOnCriticalMemoryPressure"
    }
    /**
     * Types of not restored reasons for back-forward cache.
     */
    const enum BackForwardCacheNotRestoredReasonType {
        SupportPending = "SupportPending",
        PageSupportNeeded = "PageSupportNeeded",
        Circumstantial = "Circumstantial"
    }
    interface BackForwardCacheBlockingDetails {
        /**
         * Url of the file where blockage happened. Optional because of tests.
         */
        url?: string;
        /**
         * Function name where blockage happened. Optional because of anonymous functions and tests.
         */
        function?: string;
        /**
         * Line number in the script (0-based).
         */
        lineNumber: integer;
        /**
         * Column number in the script (0-based).
         */
        columnNumber: integer;
    }
    interface BackForwardCacheNotRestoredExplanation {
        /**
         * Type of the reason
         */
        type: BackForwardCacheNotRestoredReasonType;
        /**
         * Not restored reason
         */
        reason: BackForwardCacheNotRestoredReason;
        /**
         * Context associated with the reason. The meaning of this context is
         * dependent on the reason:
         * - EmbedderExtensionSentMessageToCachedFrame: the extension ID.
         */
        context?: string;
        details?: BackForwardCacheBlockingDetails[];
    }
    interface BackForwardCacheNotRestoredExplanationTree {
        /**
         * URL of each frame
         */
        url: string;
        /**
         * Not restored reasons of each frame
         */
        explanations: BackForwardCacheNotRestoredExplanation[];
        /**
         * Array of children frame
         */
        children: BackForwardCacheNotRestoredExplanationTree[];
    }
    interface AddScriptToEvaluateOnLoadRequest {
        scriptSource: string;
    }
    interface AddScriptToEvaluateOnLoadResponse extends ProtocolResponseWithError {
        /**
         * Identifier of the added script.
         */
        identifier: ScriptIdentifier;
    }
    interface AddScriptToEvaluateOnNewDocumentRequest {
        source: string;
        /**
         * If specified, creates an isolated world with the given name and evaluates given script in it.
         * This world name will be used as the ExecutionContextDescription::name when the corresponding
         * event is emitted.
         */
        worldName?: string;
        /**
         * Specifies whether command line API should be available to the script, defaults
         * to false.
         */
        includeCommandLineAPI?: boolean;
        /**
         * If true, runs the script immediately on existing execution contexts or worlds.
         * Default: false.
         */
        runImmediately?: boolean;
    }
    interface AddScriptToEvaluateOnNewDocumentResponse extends ProtocolResponseWithError {
        /**
         * Identifier of the added script.
         */
        identifier: ScriptIdentifier;
    }
    const enum CaptureScreenshotRequestFormat {
        Jpeg = "jpeg",
        Png = "png",
        Webp = "webp"
    }
    interface CaptureScreenshotRequest {
        /**
         * Image compression format (defaults to png).
         */
        format?: CaptureScreenshotRequestFormat;
        /**
         * Compression quality from range [0..100] (jpeg only).
         */
        quality?: integer;
        /**
         * Capture the screenshot of a given region only.
         */
        clip?: Viewport;
        /**
         * Capture the screenshot from the surface, rather than the view. Defaults to true.
         */
        fromSurface?: boolean;
        /**
         * Capture the screenshot beyond the viewport. Defaults to false.
         */
        captureBeyondViewport?: boolean;
        /**
         * Optimize image encoding for speed, not for resulting size (defaults to false)
         */
        optimizeForSpeed?: boolean;
    }
    interface CaptureScreenshotResponse extends ProtocolResponseWithError {
        /**
         * Base64-encoded image data.
         */
        data: binary;
    }
    const enum CaptureSnapshotRequestFormat {
        MHTML = "mhtml"
    }
    interface CaptureSnapshotRequest {
        /**
         * Format (defaults to mhtml).
         */
        format?: CaptureSnapshotRequestFormat;
    }
    interface CaptureSnapshotResponse extends ProtocolResponseWithError {
        /**
         * Serialized page data.
         */
        data: string;
    }
    interface CreateIsolatedWorldRequest {
        /**
         * Id of the frame in which the isolated world should be created.
         */
        frameId: FrameId;
        /**
         * An optional name which is reported in the Execution Context.
         */
        worldName?: string;
        /**
         * Whether or not universal access should be granted to the isolated world. This is a powerful
         * option, use with caution.
         */
        grantUniveralAccess?: boolean;
        /**
         * An optional content security policy to set for the isolated world.
         * If omitted, any existing CSP for the world will be cleared.
         * Note that clearing or updating the CSP does not immediately affect the active
         * context in the same document because LocalDOMWindow caches the
         * ContentSecurityPolicy object. The change takes effect on subsequent
         * navigations when a new window context is created.
         */
        contentSecurityPolicy?: string;
    }
    interface CreateIsolatedWorldResponse extends ProtocolResponseWithError {
        /**
         * Execution context of the isolated world.
         */
        executionContextId: Runtime.ExecutionContextId;
    }
    interface DeleteCookieRequest {
        /**
         * Name of the cookie to remove.
         */
        cookieName: string;
        /**
         * URL to match cooke domain and path.
         */
        url: string;
    }
    interface EnableRequest {
        /**
         * If true, the `Page.fileChooserOpened` event will be emitted regardless of the state set by
         * `Page.setInterceptFileChooserDialog` command (default: false).
         */
        enableFileChooserOpenedEvent?: boolean;
    }
    interface GetAppManifestRequest {
        manifestId?: string;
    }
    interface GetAppManifestResponse extends ProtocolResponseWithError {
        /**
         * Manifest location.
         */
        url: string;
        errors: AppManifestError[];
        /**
         * Manifest content.
         */
        data?: string;
        /**
         * Parsed manifest properties. Deprecated, use manifest instead.
         * @deprecated
         */
        parsed?: AppManifestParsedProperties;
        manifest: WebAppManifest;
    }
    interface GetInstallabilityErrorsResponse extends ProtocolResponseWithError {
        installabilityErrors: InstallabilityError[];
    }
    interface GetManifestIconsResponse extends ProtocolResponseWithError {
        primaryIcon?: binary;
    }
    interface GetAppIdResponse extends ProtocolResponseWithError {
        /**
         * App id, either from manifest's id attribute or computed from start_url
         */
        appId?: string;
        /**
         * Recommendation for manifest's id attribute to match current id computed from start_url
         */
        recommendedId?: string;
        /**
         * The bundle ID for an Isolated Web App (IWA)
         */
        bundleId?: string;
        /**
         * The name of the parent app if this app is a Sub-App
         */
        parentAppName?: string;
    }
    interface GetSubAppsResponse extends ProtocolResponseWithError {
        subApps: SubApp[];
    }
    interface GetSiblingSubAppsResponse extends ProtocolResponseWithError {
        subApps: SubApp[];
    }
    interface GetAdScriptAncestryRequest {
        frameId: FrameId;
    }
    interface GetAdScriptAncestryResponse extends ProtocolResponseWithError {
        /**
         * The ancestry chain of ad script identifiers leading to this frame's
         * creation, along with the root script's filterlist rule. The ancestry
         * chain is ordered from the most immediate script (in the frame creation
         * stack) to more distant ancestors (that created the immediately preceding
         * script). Only sent if frame is labelled as an ad and ids are available.
         */
        adScriptAncestry?: Network.AdAncestry;
    }
    interface GetSpellCheckCustomDictionaryRequest {
        frameId: FrameId;
    }
    interface GetSpellCheckCustomDictionaryResponse extends ProtocolResponseWithError {
        words: string[];
    }
    interface GetFrameTreeResponse extends ProtocolResponseWithError {
        /**
         * Present frame tree structure.
         */
        frameTree: FrameTree;
    }
    interface GetLayoutMetricsResponse extends ProtocolResponseWithError {
        /**
         * Deprecated metrics relating to the layout viewport. Is in device pixels. Use `cssLayoutViewport` instead.
         * @deprecated
         */
        layoutViewport: LayoutViewport;
        /**
         * Deprecated metrics relating to the visual viewport. Is in device pixels. Use `cssVisualViewport` instead.
         * @deprecated
         */
        visualViewport: VisualViewport;
        /**
         * Deprecated size of scrollable area. Is in DP. Use `cssContentSize` instead.
         * @deprecated
         */
        contentSize: DOM.Rect;
        /**
         * Metrics relating to the layout viewport in CSS pixels.
         */
        cssLayoutViewport: LayoutViewport;
        /**
         * Metrics relating to the visual viewport in CSS pixels.
         */
        cssVisualViewport: VisualViewport;
        /**
         * Size of scrollable area in CSS pixels.
         */
        cssContentSize: DOM.Rect;
    }
    interface GetNavigationHistoryResponse extends ProtocolResponseWithError {
        /**
         * Index of the current navigation history entry.
         */
        currentIndex: integer;
        /**
         * Array of navigation history entries.
         */
        entries: NavigationEntry[];
    }
    interface GetResourceContentRequest {
        /**
         * Frame id to get resource for.
         */
        frameId: FrameId;
        /**
         * URL of the resource to get content for.
         */
        url: string;
    }
    interface GetResourceContentResponse extends ProtocolResponseWithError {
        /**
         * Resource content.
         */
        content: string;
        /**
         * True, if content was served as base64.
         */
        base64Encoded: boolean;
    }
    interface GetResourceTreeResponse extends ProtocolResponseWithError {
        /**
         * Present frame / resource tree structure.
         */
        frameTree: FrameResourceTree;
    }
    interface HandleJavaScriptDialogRequest {
        /**
         * Whether to accept or dismiss the dialog.
         */
        accept: boolean;
        /**
         * The text to enter into the dialog prompt before accepting. Used only if this is a prompt
         * dialog.
         */
        promptText?: string;
    }
    interface NavigateRequest {
        /**
         * URL to navigate the page to.
         */
        url: string;
        /**
         * Referrer URL.
         */
        referrer?: string;
        /**
         * Intended transition type.
         */
        transitionType?: TransitionType;
        /**
         * Frame id to navigate, if not specified navigates the top frame.
         */
        frameId?: FrameId;
        /**
         * Referrer-policy used for the navigation.
         */
        referrerPolicy?: ReferrerPolicy;
    }
    interface NavigateResponse extends ProtocolResponseWithError {
        /**
         * Frame id that has navigated (or failed to navigate)
         */
        frameId: FrameId;
        /**
         * Loader identifier. This is omitted in case of same-document navigation,
         * as the previously committed loaderId would not change.
         */
        loaderId?: Network.LoaderId;
        /**
         * User friendly error message, present if and only if navigation has failed.
         */
        errorText?: string;
        /**
         * Whether the navigation resulted in a download.
         */
        isDownload?: boolean;
    }
    interface NavigateToHistoryEntryRequest {
        /**
         * Unique id of the entry to navigate to.
         */
        entryId: integer;
    }
    const enum PrintToPDFRequestTransferMode {
        ReturnAsBase64 = "ReturnAsBase64",
        ReturnAsStream = "ReturnAsStream"
    }
    interface PrintToPDFRequest {
        /**
         * Paper orientation. Defaults to false.
         */
        landscape?: boolean;
        /**
         * Display header and footer. Defaults to false.
         */
        displayHeaderFooter?: boolean;
        /**
         * Print background graphics. Defaults to false.
         */
        printBackground?: boolean;
        /**
         * Scale of the webpage rendering. Defaults to 1.
         */
        scale?: number;
        /**
         * Paper width in inches. Defaults to 8.5 inches.
         */
        paperWidth?: number;
        /**
         * Paper height in inches. Defaults to 11 inches.
         */
        paperHeight?: number;
        /**
         * Top margin in inches. Defaults to 1cm (~0.4 inches).
         */
        marginTop?: number;
        /**
         * Bottom margin in inches. Defaults to 1cm (~0.4 inches).
         */
        marginBottom?: number;
        /**
         * Left margin in inches. Defaults to 1cm (~0.4 inches).
         */
        marginLeft?: number;
        /**
         * Right margin in inches. Defaults to 1cm (~0.4 inches).
         */
        marginRight?: number;
        /**
         * Paper ranges to print, one based, e.g., '1-5, 8, 11-13'. Pages are
         * printed in the document order, not in the order specified, and no
         * more than once.
         * Defaults to empty string, which implies the entire document is printed.
         * The page numbers are quietly capped to actual page count of the
         * document, and ranges beyond the end of the document are ignored.
         * If this results in no pages to print, an error is reported.
         * It is an error to specify a range with start greater than end.
         */
        pageRanges?: string;
        /**
         * HTML template for the print header. Should be valid HTML markup with following
         * classes used to inject printing values into them:
         * - `date`: formatted print date
         * - `title`: document title
         * - `url`: document location
         * - `pageNumber`: current page number
         * - `totalPages`: total pages in the document
         *
         * For example, `<span class=title></span>` would generate span containing the title.
         */
        headerTemplate?: string;
        /**
         * HTML template for the print footer. Should use the same format as the `headerTemplate`.
         */
        footerTemplate?: string;
        /**
         * Whether or not to prefer page size as defined by css. Defaults to false,
         * in which case the content will be scaled to fit the paper size.
         */
        preferCSSPageSize?: boolean;
        /**
         * return as stream
         */
        transferMode?: PrintToPDFRequestTransferMode;
        /**
         * Whether or not to generate tagged (accessible) PDF. Defaults to embedder choice.
         */
        generateTaggedPDF?: boolean;
        /**
         * Whether or not to embed the document outline into the PDF.
         */
        generateDocumentOutline?: boolean;
    }
    interface PrintToPDFResponse extends ProtocolResponseWithError {
        /**
         * Base64-encoded pdf data. Empty if |returnAsStream| is specified.
         */
        data: binary;
        /**
         * A handle of the stream that holds resulting PDF data.
         */
        stream?: IO.StreamHandle;
    }
    interface ReloadRequest {
        /**
         * If true, browser cache is ignored (as if the user pressed Shift+refresh).
         */
        ignoreCache?: boolean;
        /**
         * If set, the script will be injected into all frames of the inspected page after reload.
         * Argument will be ignored if reloading dataURL origin.
         */
        scriptToEvaluateOnLoad?: string;
        /**
         * If set, an error will be thrown if the target page's main frame's
         * loader id does not match the provided id. This prevents accidentally
         * reloading an unintended target in case there's a racing navigation.
         */
        loaderId?: Network.LoaderId;
    }
    interface RemoveScriptToEvaluateOnLoadRequest {
        identifier: ScriptIdentifier;
    }
    interface RemoveScriptToEvaluateOnNewDocumentRequest {
        identifier: ScriptIdentifier;
    }
    interface ScreencastFrameAckRequest {
        /**
         * Frame number.
         */
        sessionId: integer;
    }
    interface SearchInResourceRequest {
        /**
         * Frame id for resource to search in.
         */
        frameId: FrameId;
        /**
         * URL of the resource to search in.
         */
        url: string;
        /**
         * String to search for.
         */
        query: string;
        /**
         * If true, search is case sensitive.
         */
        caseSensitive?: boolean;
        /**
         * If true, treats string parameter as regex.
         */
        isRegex?: boolean;
    }
    interface SearchInResourceResponse extends ProtocolResponseWithError {
        /**
         * List of search matches.
         */
        result: Debugger.SearchMatch[];
    }
    interface SetAdBlockingEnabledRequest {
        /**
         * Whether to block ads.
         */
        enabled: boolean;
    }
    interface SetBypassCSPRequest {
        /**
         * Whether to bypass page CSP.
         */
        enabled: boolean;
    }
    interface GetPermissionsPolicyStateRequest {
        frameId: FrameId;
    }
    interface GetPermissionsPolicyStateResponse extends ProtocolResponseWithError {
        states: PermissionsPolicyFeatureState[];
    }
    interface GetOriginTrialsRequest {
        frameId: FrameId;
    }
    interface GetOriginTrialsResponse extends ProtocolResponseWithError {
        originTrials: OriginTrial[];
    }
    interface SetDeviceMetricsOverrideRequest {
        /**
         * Overriding width value in pixels (minimum 0, maximum 10000000). 0 disables the override.
         */
        width: integer;
        /**
         * Overriding height value in pixels (minimum 0, maximum 10000000). 0 disables the override.
         */
        height: integer;
        /**
         * Overriding device scale factor value. 0 disables the override.
         */
        deviceScaleFactor: number;
        /**
         * Whether to emulate mobile device. This includes viewport meta tag, overlay scrollbars, text
         * autosizing and more.
         */
        mobile: boolean;
        /**
         * Scale to apply to resulting view image.
         */
        scale?: number;
        /**
         * Overriding screen width value in pixels (minimum 0, maximum 10000000).
         */
        screenWidth?: integer;
        /**
         * Overriding screen height value in pixels (minimum 0, maximum 10000000).
         */
        screenHeight?: integer;
        /**
         * Overriding view X position on screen in pixels (minimum 0, maximum 10000000).
         */
        positionX?: integer;
        /**
         * Overriding view Y position on screen in pixels (minimum 0, maximum 10000000).
         */
        positionY?: integer;
        /**
         * Do not set visible view size, rely upon explicit setVisibleSize call.
         */
        dontSetVisibleSize?: boolean;
        /**
         * Screen orientation override.
         */
        screenOrientation?: Emulation.ScreenOrientation;
        /**
         * The viewport dimensions and scale. If not set, the override is cleared.
         */
        viewport?: Viewport;
    }
    interface SetDeviceOrientationOverrideRequest {
        /**
         * Mock alpha
         */
        alpha: number;
        /**
         * Mock beta
         */
        beta: number;
        /**
         * Mock gamma
         */
        gamma: number;
    }
    interface SetFontFamiliesRequest {
        /**
         * Specifies font families to set. If a font family is not specified, it won't be changed.
         */
        fontFamilies: FontFamilies;
        /**
         * Specifies font families to set for individual scripts.
         */
        forScripts?: ScriptFontFamilies[];
    }
    interface SetFontSizesRequest {
        /**
         * Specifies font sizes to set. If a font size is not specified, it won't be changed.
         */
        fontSizes: FontSizes;
    }
    interface SetDocumentContentRequest {
        /**
         * Frame id to set HTML for.
         */
        frameId: FrameId;
        /**
         * HTML content to set.
         */
        html: string;
    }
    const enum SetDownloadBehaviorRequestBehavior {
        Deny = "deny",
        Allow = "allow",
        Default = "default"
    }
    interface SetDownloadBehaviorRequest {
        /**
         * Whether to allow all or deny all download requests, or use default Chrome behavior if
         * available (otherwise deny).
         */
        behavior: SetDownloadBehaviorRequestBehavior;
        /**
         * The default path to save downloaded files to. This is required if behavior is set to 'allow'
         */
        downloadPath?: string;
    }
    interface SetGeolocationOverrideRequest {
        /**
         * Mock latitude
         */
        latitude?: number;
        /**
         * Mock longitude
         */
        longitude?: number;
        /**
         * Mock accuracy
         */
        accuracy?: number;
    }
    interface SetLifecycleEventsEnabledRequest {
        /**
         * If true, starts emitting lifecycle events.
         */
        enabled: boolean;
    }
    const enum SetTouchEmulationEnabledRequestConfiguration {
        Mobile = "mobile",
        Desktop = "desktop"
    }
    interface SetTouchEmulationEnabledRequest {
        /**
         * Whether the touch event emulation should be enabled.
         */
        enabled: boolean;
        /**
         * Touch/gesture events configuration. Default: current platform.
         */
        configuration?: SetTouchEmulationEnabledRequestConfiguration;
    }
    const enum StartScreencastRequestFormat {
        Jpeg = "jpeg",
        Png = "png"
    }
    interface StartScreencastRequest {
        /**
         * Image compression format.
         */
        format?: StartScreencastRequestFormat;
        /**
         * Compression quality from range [0..100].
         */
        quality?: integer;
        /**
         * Maximum screenshot width.
         */
        maxWidth?: integer;
        /**
         * Maximum screenshot height.
         */
        maxHeight?: integer;
        /**
         * Send every n-th frame. Must be a positive integer.
         */
        everyNthFrame?: integer;
        /**
         * Maximum number of frames sent until screencastFrameAck is required.
         * Defaults to 3. Must be a positive integer.
         */
        maxFramesInFlight?: integer;
        /**
         * By default, after screencastFrameAck arrives, the next produced frame is sent.
         * Passing this flag enables storing the last produced frame in memory, which is
         * immediately sent upon screencastFrameAck. This way, overall performance is
         * traded for a better latency.
         */
        sendLastFrame?: boolean;
    }
    interface StartScreenRecordingRequest {
        audio?: boolean;
        /**
         * Maximum frame width in pixels.
         */
        maxWidth?: integer;
        /**
         * Maximum frame height in pixels.
         */
        maxHeight?: integer;
        /**
         * Maximum frame rate in frames per second.
         */
        frameRate?: integer;
    }
    interface StartScreenRecordingResponse extends ProtocolResponseWithError {
        /**
         * A handle of the stream that holds resulting screencast data.
         */
        stream: IO.StreamHandle;
    }
    interface StopScreenRecordingResponse extends ProtocolResponseWithError {
        /**
         * A handle of the stream that holds resulting screencast data.
         */
        stream: IO.StreamHandle;
    }
    const enum SetWebLifecycleStateRequestState {
        Frozen = "frozen",
        Active = "active"
    }
    interface SetWebLifecycleStateRequest {
        /**
         * Target lifecycle state
         */
        state: SetWebLifecycleStateRequestState;
    }
    interface ProduceCompilationCacheRequest {
        scripts: CompilationCacheParams[];
    }
    interface AddCompilationCacheRequest {
        url: string;
        /**
         * Base64-encoded data
         */
        data: binary;
    }
    const enum SetSPCTransactionModeRequestMode {
        None = "none",
        AutoAccept = "autoAccept",
        AutoChooseToAuthAnotherWay = "autoChooseToAuthAnotherWay",
        AutoReject = "autoReject",
        AutoOptOut = "autoOptOut"
    }
    interface SetSPCTransactionModeRequest {
        mode: SetSPCTransactionModeRequestMode;
    }
    const enum SetRPHRegistrationModeRequestMode {
        None = "none",
        AutoAccept = "autoAccept",
        AutoReject = "autoReject"
    }
    interface SetRPHRegistrationModeRequest {
        mode: SetRPHRegistrationModeRequestMode;
    }
    interface GenerateTestReportRequest {
        /**
         * Message to be displayed in the report.
         */
        message: string;
        /**
         * Specifies the endpoint group to deliver the report to.
         */
        group?: string;
    }
    interface SetInterceptFileChooserDialogRequest {
        enabled: boolean;
        /**
         * If true, cancels the dialog by emitting relevant events (if any)
         * in addition to not showing it if the interception is enabled
         * (default: false).
         */
        cancel?: boolean;
    }
    interface SetPrerenderingAllowedRequest {
        isAllowed: boolean;
    }
    interface GetAnnotatedPageContentRequest {
        /**
         * Whether to include actionable information. Defaults to true.
         */
        includeActionableInformation?: boolean;
    }
    interface GetAnnotatedPageContentResponse extends ProtocolResponseWithError {
        /**
         * The annotated page content as a base64 encoded protobuf.
         * The format is defined by the `AnnotatedPageContent` message in
         * components/optimization_guide/proto/features/common_quality_data.proto
         */
        content: binary;
    }
    interface SetInputVisualizationRequest {
        /**
         * Whether to enable click visualization.
         */
        clicks?: boolean;
    }
    interface DomContentEventFiredEvent {
        timestamp: Network.MonotonicTime;
    }
    const enum FileChooserOpenedEventMode {
        SelectSingle = "selectSingle",
        SelectMultiple = "selectMultiple"
    }
    /**
     * Emitted only when `page.interceptFileChooser` is enabled.
     */
    interface FileChooserOpenedEvent {
        /**
         * Id of the frame containing input node.
         */
        frameId: FrameId;
        /**
         * Input mode.
         */
        mode: FileChooserOpenedEventMode;
        /**
         * Input node id. Only present for file choosers opened via an `<input type="file">` element.
         */
        backendNodeId?: DOM.BackendNodeId;
    }
    /**
     * Fired when frame has been attached to its parent.
     */
    interface FrameAttachedEvent {
        /**
         * Id of the frame that has been attached.
         */
        frameId: FrameId;
        /**
         * Parent frame identifier.
         */
        parentFrameId: FrameId;
        /**
         * JavaScript stack trace of when frame was attached, only set if frame initiated from script.
         */
        stack?: Runtime.StackTrace;
    }
    /**
     * Fired when frame no longer has a scheduled navigation.
     * @deprecated
     */
    interface FrameClearedScheduledNavigationEvent {
        /**
         * Id of the frame that has cleared its scheduled navigation.
         */
        frameId: FrameId;
    }
    const enum FrameDetachedEventReason {
        Remove = "remove",
        Swap = "swap"
    }
    /**
     * Fired when frame has been detached from its parent.
     */
    interface FrameDetachedEvent {
        /**
         * Id of the frame that has been detached.
         */
        frameId: FrameId;
        reason: FrameDetachedEventReason;
    }
    /**
     * Fired before frame subtree is detached. Emitted before any frame of the
     * subtree is actually detached.
     */
    interface FrameSubtreeWillBeDetachedEvent {
        /**
         * Id of the frame that is the root of the subtree that will be detached.
         */
        frameId: FrameId;
    }
    /**
     * Fired once navigation of the frame has completed. Frame is now associated with the new loader.
     */
    interface FrameNavigatedEvent {
        /**
         * Frame object.
         */
        frame: Frame;
        type: NavigationType;
    }
    /**
     * Fired when opening document to write to.
     */
    interface DocumentOpenedEvent {
        /**
         * Frame object.
         */
        frame: Frame;
    }
    const enum FrameStartedNavigatingEventNavigationType {
        Reload = "reload",
        ReloadBypassingCache = "reloadBypassingCache",
        Restore = "restore",
        RestoreWithPost = "restoreWithPost",
        HistorySameDocument = "historySameDocument",
        HistoryDifferentDocument = "historyDifferentDocument",
        SameDocument = "sameDocument",
        DifferentDocument = "differentDocument"
    }
    /**
     * Fired when a navigation starts. This event is fired for both
     * renderer-initiated and browser-initiated navigations. For renderer-initiated
     * navigations, the event is fired after `frameRequestedNavigation`.
     * Navigation may still be cancelled after the event is issued. Multiple events
     * can be fired for a single navigation, for example, when a same-document
     * navigation becomes a cross-document navigation (such as in the case of a
     * frameset).
     */
    interface FrameStartedNavigatingEvent {
        /**
         * ID of the frame that is being navigated.
         */
        frameId: FrameId;
        /**
         * The URL the navigation started with. The final URL can be different.
         */
        url: string;
        /**
         * Loader identifier. Even though it is present in case of same-document
         * navigation, the previously committed loaderId would not change unless
         * the navigation changes from a same-document to a cross-document
         * navigation.
         */
        loaderId: Network.LoaderId;
        navigationType: FrameStartedNavigatingEventNavigationType;
    }
    /**
     * Fired when a renderer-initiated navigation is requested.
     * Navigation may still be cancelled after the event is issued.
     */
    interface FrameRequestedNavigationEvent {
        /**
         * Id of the frame that is being navigated.
         */
        frameId: FrameId;
        /**
         * The reason for the navigation.
         */
        reason: ClientNavigationReason;
        /**
         * The destination URL for the requested navigation.
         */
        url: string;
        /**
         * The disposition for the navigation.
         */
        disposition: ClientNavigationDisposition;
    }
    /**
     * Fired when frame schedules a potential navigation.
     * @deprecated
     */
    interface FrameScheduledNavigationEvent {
        /**
         * Id of the frame that has scheduled a navigation.
         */
        frameId: FrameId;
        /**
         * Delay (in seconds) until the navigation is scheduled to begin. The navigation is not
         * guaranteed to start.
         */
        delay: number;
        /**
         * The reason for the navigation.
         */
        reason: ClientNavigationReason;
        /**
         * The destination URL for the scheduled navigation.
         */
        url: string;
    }
    /**
     * Fired when frame has started loading.
     */
    interface FrameStartedLoadingEvent {
        /**
         * Id of the frame that has started loading.
         */
        frameId: FrameId;
    }
    /**
     * Fired when frame has stopped loading.
     */
    interface FrameStoppedLoadingEvent {
        /**
         * Id of the frame that has stopped loading.
         */
        frameId: FrameId;
    }
    /**
     * Fired when page is about to start a download.
     * Deprecated. Use Browser.downloadWillBegin instead.
     * @deprecated
     */
    interface DownloadWillBeginEvent {
        /**
         * Id of the frame that caused download to begin.
         */
        frameId: FrameId;
        /**
         * Global unique identifier of the download.
         */
        guid: string;
        /**
         * URL of the resource being downloaded.
         */
        url: string;
        /**
         * Suggested file name of the resource (the actual name of the file saved on disk may differ).
         */
        suggestedFilename: string;
    }
    const enum DownloadProgressEventState {
        InProgress = "inProgress",
        Completed = "completed",
        Canceled = "canceled"
    }
    /**
     * Fired when download makes progress. Last call has |done| == true.
     * Deprecated. Use Browser.downloadProgress instead.
     * @deprecated
     */
    interface DownloadProgressEvent {
        /**
         * Global unique identifier of the download.
         */
        guid: string;
        /**
         * Total expected bytes to download.
         */
        totalBytes: number;
        /**
         * Total bytes received.
         */
        receivedBytes: number;
        /**
         * Download status.
         */
        state: DownloadProgressEventState;
    }
    /**
     * Fired when a JavaScript initiated dialog (alert, confirm, prompt, or onbeforeunload) has been
     * closed.
     */
    interface JavascriptDialogClosedEvent {
        /**
         * Frame id.
         */
        frameId: FrameId;
        /**
         * Whether dialog was confirmed.
         */
        result: boolean;
        /**
         * User input in case of prompt.
         */
        userInput: string;
    }
    /**
     * Fired when a JavaScript initiated dialog (alert, confirm, prompt, or onbeforeunload) is about to
     * open.
     */
    interface JavascriptDialogOpeningEvent {
        /**
         * Frame url.
         */
        url: string;
        /**
         * Frame id.
         */
        frameId: FrameId;
        /**
         * Message that will be displayed by the dialog.
         */
        message: string;
        /**
         * Dialog type.
         */
        type: DialogType;
        /**
         * True iff browser is capable showing or acting on the given dialog. When browser has no
         * dialog handler for given target, calling alert while Page domain is engaged will stall
         * the page execution. Execution can be resumed via calling Page.handleJavaScriptDialog.
         */
        hasBrowserHandler: boolean;
        /**
         * Default dialog prompt.
         */
        defaultPrompt?: string;
    }
    /**
     * Fired for lifecycle events (navigation, load, paint, etc) in the current
     * target (including local frames).
     */
    interface LifecycleEventEvent {
        /**
         * Id of the frame.
         */
        frameId: FrameId;
        /**
         * Loader identifier. Empty string if the request is fetched from worker.
         */
        loaderId: Network.LoaderId;
        name: string;
        timestamp: Network.MonotonicTime;
    }
    /**
     * Fired for failed bfcache history navigations if BackForwardCache feature is enabled. Do
     * not assume any ordering with the Page.frameNavigated event. This event is fired only for
     * main-frame history navigation where the document changes (non-same-document navigations),
     * when bfcache navigation fails.
     */
    interface BackForwardCacheNotUsedEvent {
        /**
         * The loader id for the associated navigation.
         */
        loaderId: Network.LoaderId;
        /**
         * The frame id of the associated frame.
         */
        frameId: FrameId;
        /**
         * Array of reasons why the page could not be cached. This must not be empty.
         */
        notRestoredExplanations: BackForwardCacheNotRestoredExplanation[];
        /**
         * Tree structure of reasons why the page could not be cached for each frame.
         */
        notRestoredExplanationsTree?: BackForwardCacheNotRestoredExplanationTree;
    }
    interface LoadEventFiredEvent {
        timestamp: Network.MonotonicTime;
    }
    const enum NavigatedWithinDocumentEventNavigationType {
        Fragment = "fragment",
        HistoryAPI = "historyApi",
        Other = "other"
    }
    /**
     * Fired when same-document navigation happens, e.g. due to history API usage or anchor navigation.
     */
    interface NavigatedWithinDocumentEvent {
        /**
         * Id of the frame.
         */
        frameId: FrameId;
        /**
         * Frame's new url.
         */
        url: string;
        /**
         * Navigation type
         */
        navigationType: NavigatedWithinDocumentEventNavigationType;
    }
    /**
     * Compressed image data requested by the `startScreencast`.
     */
    interface ScreencastFrameEvent {
        /**
         * Base64-encoded compressed image.
         */
        data: binary;
        /**
         * Screencast frame metadata.
         */
        metadata: ScreencastFrameMetadata;
        /**
         * Frame number.
         */
        sessionId: integer;
    }
    /**
     * Fired when the page with currently enabled screencast was shown or hidden `.
     */
    interface ScreencastVisibilityChangedEvent {
        /**
         * True if the page is visible.
         */
        visible: boolean;
    }
    /**
     * Fired when a new window is going to be opened, via window.open(), link click, form submission,
     * etc.
     */
    interface WindowOpenEvent {
        /**
         * The URL for the new window.
         */
        url: string;
        /**
         * Window name.
         */
        windowName: string;
        /**
         * An array of enabled window features.
         */
        windowFeatures: string[];
        /**
         * Whether or not it was triggered by user gesture.
         */
        userGesture: boolean;
    }
    /**
     * Issued for every compilation cache generated.
     */
    interface CompilationCacheProducedEvent {
        url: string;
        /**
         * Base64-encoded data
         */
        data: binary;
    }
}
export declare namespace Performance {
    /**
     * Run-time execution metric.
     */
    interface Metric {
        /**
         * Metric name.
         */
        name: string;
        /**
         * Metric value.
         */
        value: number;
    }
    const enum EnableRequestTimeDomain {
        TimeTicks = "timeTicks",
        ThreadTicks = "threadTicks"
    }
    interface EnableRequest {
        /**
         * Time domain to use for collecting and reporting duration metrics.
         */
        timeDomain?: EnableRequestTimeDomain;
    }
    const enum SetTimeDomainRequestTimeDomain {
        TimeTicks = "timeTicks",
        ThreadTicks = "threadTicks"
    }
    interface SetTimeDomainRequest {
        /**
         * Time domain
         */
        timeDomain: SetTimeDomainRequestTimeDomain;
    }
    interface GetMetricsResponse extends ProtocolResponseWithError {
        /**
         * Current values for run-time metrics.
         */
        metrics: Metric[];
    }
    /**
     * Current values of the metrics.
     */
    interface MetricsEvent {
        /**
         * Current values of the metrics.
         */
        metrics: Metric[];
        /**
         * Timestamp title.
         */
        title: string;
    }
}
/**
 * Reporting of performance timeline events, as specified in
 * https://w3c.github.io/performance-timeline/#dom-performanceobserver.
 */
export declare namespace PerformanceTimeline {
    /**
     * See https://github.com/WICG/LargestContentfulPaint and largest_contentful_paint.idl
     */
    interface LargestContentfulPaint {
        renderTime: Network.TimeSinceEpoch;
        loadTime: Network.TimeSinceEpoch;
        /**
         * The number of pixels being painted.
         */
        size: number;
        /**
         * The id attribute of the element, if available.
         */
        elementId?: string;
        /**
         * The URL of the image (may be trimmed).
         */
        url?: string;
        nodeId?: DOM.BackendNodeId;
    }
    interface LayoutShiftAttribution {
        previousRect: DOM.Rect;
        currentRect: DOM.Rect;
        nodeId?: DOM.BackendNodeId;
    }
    /**
     * See https://wicg.github.io/layout-instability/#sec-layout-shift and layout_shift.idl
     */
    interface LayoutShift {
        /**
         * Score increment produced by this event.
         */
        value: number;
        hadRecentInput: boolean;
        lastInputTime: Network.TimeSinceEpoch;
        sources: LayoutShiftAttribution[];
    }
    interface TimelineEvent {
        /**
         * Identifies the frame that this event is related to. Empty for non-frame targets.
         */
        frameId: Page.FrameId;
        /**
         * The event type, as specified in https://w3c.github.io/performance-timeline/#dom-performanceentry-entrytype
         * This determines which of the optional "details" fields is present.
         */
        type: string;
        /**
         * Name may be empty depending on the type.
         */
        name: string;
        /**
         * Time in seconds since Epoch, monotonically increasing within document lifetime.
         */
        time: Network.TimeSinceEpoch;
        /**
         * Event duration, if applicable.
         */
        duration?: number;
        lcpDetails?: LargestContentfulPaint;
        layoutShiftDetails?: LayoutShift;
    }
    interface EnableRequest {
        /**
         * The types of event to report, as specified in
         * https://w3c.github.io/performance-timeline/#dom-performanceentry-entrytype
         * The specified filter overrides any previous filters, passing empty
         * filter disables recording.
         * Note that not all types exposed to the web platform are currently supported.
         */
        eventTypes: string[];
    }
    /**
     * Sent when a performance timeline event is added. See reportPerformanceTimeline method.
     */
    interface TimelineEventAddedEvent {
        event: TimelineEvent;
    }
}
export declare namespace Preload {
    /**
     * Unique id
     */
    type RuleSetId = OpaqueIdentifier<string, 'Protocol.Preload.RuleSetId'>;
    /**
     * Corresponds to SpeculationRuleSet
     */
    interface RuleSet {
        id: RuleSetId;
        /**
         * Identifies a document which the rule set is associated with.
         */
        loaderId: Network.LoaderId;
        /**
         * Source text of JSON representing the rule set. If it comes from
         * `<script>` tag, it is the textContent of the node. Note that it is
         * a JSON for valid case.
         *
         * See also:
         * - https://wicg.github.io/nav-speculation/speculation-rules.html
         * - https://github.com/WICG/nav-speculation/blob/main/triggers.md
         */
        sourceText: string;
        /**
         * A speculation rule set is either added through an inline
         * `<script>` tag or through an external resource via the
         * 'Speculation-Rules' HTTP header. For the first case, we include
         * the BackendNodeId of the relevant `<script>` tag. For the second
         * case, we include the external URL where the rule set was loaded
         * from, and also RequestId if Network domain is enabled.
         *
         * See also:
         * - https://wicg.github.io/nav-speculation/speculation-rules.html#speculation-rules-script
         * - https://wicg.github.io/nav-speculation/speculation-rules.html#speculation-rules-header
         */
        backendNodeId?: DOM.BackendNodeId;
        url?: string;
        requestId?: Network.RequestId;
        /**
         * Error information
         * `errorMessage` is null iff `errorType` is null.
         */
        errorType?: RuleSetErrorType;
        /**
         * TODO(https://crbug.com/1425354): Replace this property with structured error.
         * @deprecated
         */
        errorMessage?: string;
        /**
         * For more details, see:
         * https://github.com/WICG/nav-speculation/blob/main/speculation-rules-tags.md
         */
        tag?: string;
    }
    const enum RuleSetErrorType {
        SourceIsNotJsonObject = "SourceIsNotJsonObject",
        InvalidRulesSkipped = "InvalidRulesSkipped",
        InvalidRulesetLevelTag = "InvalidRulesetLevelTag"
    }
    /**
     * The type of preloading attempted. It corresponds to
     * mojom::SpeculationAction (although PrefetchWithSubresources is omitted as it
     * isn't being used by clients).
     */
    const enum SpeculationAction {
        Prefetch = "Prefetch",
        Prerender = "Prerender",
        PrerenderUntilScript = "PrerenderUntilScript"
    }
    /**
     * Corresponds to mojom::SpeculationTargetHint.
     * See https://github.com/WICG/nav-speculation/blob/main/triggers.md#window-name-targeting-hints
     */
    const enum SpeculationTargetHint {
        Blank = "Blank",
        Self = "Self"
    }
    /**
     * A key that identifies a preloading attempt.
     *
     * The url used is the url specified by the trigger (i.e. the initial URL), and
     * not the final url that is navigated to. For example, prerendering allows
     * same-origin main frame navigations during the attempt, but the attempt is
     * still keyed with the initial URL.
     */
    interface PreloadingAttemptKey {
        loaderId: Network.LoaderId;
        action: SpeculationAction;
        url: string;
        formSubmission?: boolean;
        targetHint?: SpeculationTargetHint;
    }
    /**
     * Lists sources for a preloading attempt, specifically the ids of rule sets
     * that had a speculation rule that triggered the attempt, and the
     * BackendNodeIds of <a href> or <area href> elements that triggered the
     * attempt (in the case of attempts triggered by a document rule). It is
     * possible for multiple rule sets and links to trigger a single attempt.
     */
    interface PreloadingAttemptSource {
        key: PreloadingAttemptKey;
        ruleSetIds: RuleSetId[];
        nodeIds: DOM.BackendNodeId[];
    }
    /**
     * Chrome manages different types of preloads together using a
     * concept of preloading pipeline. For example, if a site uses a
     * SpeculationRules for prerender, Chrome first starts a prefetch and
     * then upgrades it to prerender.
     *
     * CDP events for them are emitted separately but they share
     * `PreloadPipelineId`.
     */
    type PreloadPipelineId = OpaqueIdentifier<string, 'Protocol.Preload.PreloadPipelineId'>;
    /**
     * List of FinalStatus reasons for Prerender2.
     */
    const enum PrerenderFinalStatus {
        Activated = "Activated",
        Destroyed = "Destroyed",
        LowEndDevice = "LowEndDevice",
        InvalidSchemeRedirect = "InvalidSchemeRedirect",
        InvalidSchemeNavigation = "InvalidSchemeNavigation",
        NavigationRequestBlockedByCsp = "NavigationRequestBlockedByCsp",
        MojoBinderPolicy = "MojoBinderPolicy",
        RendererProcessCrashed = "RendererProcessCrashed",
        RendererProcessKilled = "RendererProcessKilled",
        Download = "Download",
        TriggerDestroyed = "TriggerDestroyed",
        NavigationNotCommitted = "NavigationNotCommitted",
        NavigationBadHttpStatus = "NavigationBadHttpStatus",
        ClientCertRequested = "ClientCertRequested",
        NavigationRequestNetworkError = "NavigationRequestNetworkError",
        CancelAllHostsForTesting = "CancelAllHostsForTesting",
        DidFailLoad = "DidFailLoad",
        Stop = "Stop",
        SslCertificateError = "SslCertificateError",
        LoginAuthRequested = "LoginAuthRequested",
        UaChangeRequiresReload = "UaChangeRequiresReload",
        BlockedByClient = "BlockedByClient",
        AudioOutputDeviceRequested = "AudioOutputDeviceRequested",
        MixedContent = "MixedContent",
        TriggerBackgrounded = "TriggerBackgrounded",
        MemoryLimitExceeded = "MemoryLimitExceeded",
        DataSaverEnabled = "DataSaverEnabled",
        TriggerUrlHasEffectiveUrl = "TriggerUrlHasEffectiveUrl",
        ActivatedBeforeStarted = "ActivatedBeforeStarted",
        InactivePageRestriction = "InactivePageRestriction",
        StartFailed = "StartFailed",
        TimeoutBackgrounded = "TimeoutBackgrounded",
        CrossSiteRedirectInInitialNavigation = "CrossSiteRedirectInInitialNavigation",
        CrossSiteNavigationInInitialNavigation = "CrossSiteNavigationInInitialNavigation",
        SameSiteCrossOriginRedirectNotOptInInInitialNavigation = "SameSiteCrossOriginRedirectNotOptInInInitialNavigation",
        SameSiteCrossOriginNavigationNotOptInInInitialNavigation = "SameSiteCrossOriginNavigationNotOptInInInitialNavigation",
        ActivationNavigationParameterMismatch = "ActivationNavigationParameterMismatch",
        ActivatedInBackground = "ActivatedInBackground",
        EmbedderHostDisallowed = "EmbedderHostDisallowed",
        ActivationNavigationDestroyedBeforeSuccess = "ActivationNavigationDestroyedBeforeSuccess",
        TabClosedByUserGesture = "TabClosedByUserGesture",
        TabClosedWithoutUserGesture = "TabClosedWithoutUserGesture",
        PrimaryMainFrameRendererProcessCrashed = "PrimaryMainFrameRendererProcessCrashed",
        PrimaryMainFrameRendererProcessKilled = "PrimaryMainFrameRendererProcessKilled",
        ActivationFramePolicyNotCompatible = "ActivationFramePolicyNotCompatible",
        PreloadingDisabled = "PreloadingDisabled",
        BatterySaverEnabled = "BatterySaverEnabled",
        ActivatedDuringMainFrameNavigation = "ActivatedDuringMainFrameNavigation",
        PreloadingUnsupportedByWebContents = "PreloadingUnsupportedByWebContents",
        CrossSiteRedirectInMainFrameNavigation = "CrossSiteRedirectInMainFrameNavigation",
        CrossSiteNavigationInMainFrameNavigation = "CrossSiteNavigationInMainFrameNavigation",
        SameSiteCrossOriginRedirectNotOptInInMainFrameNavigation = "SameSiteCrossOriginRedirectNotOptInInMainFrameNavigation",
        SameSiteCrossOriginNavigationNotOptInInMainFrameNavigation = "SameSiteCrossOriginNavigationNotOptInInMainFrameNavigation",
        MemoryPressureOnTrigger = "MemoryPressureOnTrigger",
        MemoryPressureAfterTriggered = "MemoryPressureAfterTriggered",
        PrerenderingDisabledByDevTools = "PrerenderingDisabledByDevTools",
        SpeculationRuleRemoved = "SpeculationRuleRemoved",
        ActivatedWithAuxiliaryBrowsingContexts = "ActivatedWithAuxiliaryBrowsingContexts",
        MaxNumOfRunningEagerPrerendersExceeded = "MaxNumOfRunningEagerPrerendersExceeded",
        MaxNumOfRunningNonEagerPrerendersExceeded = "MaxNumOfRunningNonEagerPrerendersExceeded",
        MaxNumOfRunningEmbedderPrerendersExceeded = "MaxNumOfRunningEmbedderPrerendersExceeded",
        PrerenderingUrlHasEffectiveUrl = "PrerenderingUrlHasEffectiveUrl",
        RedirectedPrerenderingUrlHasEffectiveUrl = "RedirectedPrerenderingUrlHasEffectiveUrl",
        ActivationUrlHasEffectiveUrl = "ActivationUrlHasEffectiveUrl",
        JavaScriptInterfaceAdded = "JavaScriptInterfaceAdded",
        JavaScriptInterfaceRemoved = "JavaScriptInterfaceRemoved",
        AllPrerenderingCanceled = "AllPrerenderingCanceled",
        WindowClosed = "WindowClosed",
        SlowNetwork = "SlowNetwork",
        OtherPrerenderedPageActivated = "OtherPrerenderedPageActivated",
        V8OptimizerDisabled = "V8OptimizerDisabled",
        PrerenderFailedDuringPrefetch = "PrerenderFailedDuringPrefetch",
        BrowsingDataRemoved = "BrowsingDataRemoved",
        PrerenderHostReused = "PrerenderHostReused",
        FormSubmitWhenPrerendering = "FormSubmitWhenPrerendering",
        CrossDocumentRestart = "CrossDocumentRestart"
    }
    /**
     * Preloading status values, see also PreloadingTriggeringOutcome. This
     * status is shared by prefetchStatusUpdated and prerenderStatusUpdated.
     */
    const enum PreloadingStatus {
        Pending = "Pending",
        Running = "Running",
        Ready = "Ready",
        Success = "Success",
        Failure = "Failure",
        NotSupported = "NotSupported"
    }
    /**
     * TODO(https://crbug.com/1384419): revisit the list of PrefetchStatus and
     * filter out the ones that aren't necessary to the developers.
     */
    const enum PrefetchStatus {
        PrefetchAllowed = "PrefetchAllowed",
        PrefetchFailedIneligibleRedirect = "PrefetchFailedIneligibleRedirect",
        PrefetchFailedInvalidRedirect = "PrefetchFailedInvalidRedirect",
        PrefetchFailedMIMENotSupported = "PrefetchFailedMIMENotSupported",
        PrefetchFailedNetError = "PrefetchFailedNetError",
        PrefetchFailedNon2XX = "PrefetchFailedNon2XX",
        PrefetchEvictedAfterBrowsingDataRemoved = "PrefetchEvictedAfterBrowsingDataRemoved",
        PrefetchEvictedAfterCandidateRemoved = "PrefetchEvictedAfterCandidateRemoved",
        PrefetchEvictedForNewerPrefetch = "PrefetchEvictedForNewerPrefetch",
        PrefetchHeldback = "PrefetchHeldback",
        PrefetchIneligibleRetryAfter = "PrefetchIneligibleRetryAfter",
        PrefetchIsPrivacyDecoy = "PrefetchIsPrivacyDecoy",
        PrefetchIsStale = "PrefetchIsStale",
        PrefetchNotEligibleBlockedByConnectionAllowlist = "PrefetchNotEligibleBlockedByConnectionAllowlist",
        PrefetchNotEligibleBrowserContextOffTheRecord = "PrefetchNotEligibleBrowserContextOffTheRecord",
        PrefetchNotEligibleCrossOrigin = "PrefetchNotEligibleCrossOrigin",
        PrefetchNotEligibleDataSaverEnabled = "PrefetchNotEligibleDataSaverEnabled",
        PrefetchNotEligibleExistingProxy = "PrefetchNotEligibleExistingProxy",
        PrefetchNotEligibleHostIsNonUnique = "PrefetchNotEligibleHostIsNonUnique",
        PrefetchNotEligibleNonDefaultStoragePartition = "PrefetchNotEligibleNonDefaultStoragePartition",
        PrefetchNotEligibleSameSiteCrossOriginPrefetchRequiredProxy = "PrefetchNotEligibleSameSiteCrossOriginPrefetchRequiredProxy",
        PrefetchNotEligibleSchemeIsNotHttps = "PrefetchNotEligibleSchemeIsNotHttps",
        PrefetchNotEligibleUserHasCookies = "PrefetchNotEligibleUserHasCookies",
        PrefetchNotEligibleUserHasServiceWorker = "PrefetchNotEligibleUserHasServiceWorker",
        PrefetchNotEligibleUserHasServiceWorkerNoFetchHandler = "PrefetchNotEligibleUserHasServiceWorkerNoFetchHandler",
        PrefetchNotEligibleRedirectFromServiceWorker = "PrefetchNotEligibleRedirectFromServiceWorker",
        PrefetchNotEligibleRedirectToServiceWorker = "PrefetchNotEligibleRedirectToServiceWorker",
        PrefetchNotEligibleBatterySaverEnabled = "PrefetchNotEligibleBatterySaverEnabled",
        PrefetchNotEligiblePreloadingDisabled = "PrefetchNotEligiblePreloadingDisabled",
        PrefetchNotFinishedInTime = "PrefetchNotFinishedInTime",
        PrefetchNotStarted = "PrefetchNotStarted",
        PrefetchNotUsedCookiesChanged = "PrefetchNotUsedCookiesChanged",
        PrefetchProxyNotAvailable = "PrefetchProxyNotAvailable",
        PrefetchResponseUsed = "PrefetchResponseUsed",
        PrefetchSuccessfulButNotUsed = "PrefetchSuccessfulButNotUsed",
        PrefetchNotUsedProbeFailed = "PrefetchNotUsedProbeFailed",
        PrefetchCancelledOnUserNavigation = "PrefetchCancelledOnUserNavigation"
    }
    /**
     * Information of headers to be displayed when the header mismatch occurred.
     */
    interface PrerenderMismatchedHeaders {
        headerName: string;
        initialValue?: string;
        activationValue?: string;
    }
    /**
     * Upsert. Currently, it is only emitted when a rule set added.
     */
    interface RuleSetUpdatedEvent {
        ruleSet: RuleSet;
    }
    interface RuleSetRemovedEvent {
        id: RuleSetId;
    }
    /**
     * Fired when a preload enabled state is updated.
     */
    interface PreloadEnabledStateUpdatedEvent {
        disabledByPreference: boolean;
        disabledByDataSaver: boolean;
        disabledByBatterySaver: boolean;
        disabledByHoldbackPrefetchSpeculationRules: boolean;
        disabledByHoldbackPrerenderSpeculationRules: boolean;
    }
    /**
     * Fired when a prefetch attempt is updated.
     */
    interface PrefetchStatusUpdatedEvent {
        key: PreloadingAttemptKey;
        pipelineId: PreloadPipelineId;
        /**
         * The frame id of the frame initiating prefetch.
         */
        initiatingFrameId: Page.FrameId;
        prefetchUrl: string;
        status: PreloadingStatus;
        prefetchStatus: PrefetchStatus;
        requestId: Network.RequestId;
    }
    /**
     * Fired when a prerender attempt is updated.
     */
    interface PrerenderStatusUpdatedEvent {
        key: PreloadingAttemptKey;
        pipelineId: PreloadPipelineId;
        status: PreloadingStatus;
        /**
         * The action currently performed by this attempt. This differs from
         * `key.action` after a prerender-until-script attempt is upgraded in place
         * to a full prerender.
         */
        effectiveAction?: SpeculationAction;
        prerenderStatus?: PrerenderFinalStatus;
        /**
         * This is used to give users more information about the name of Mojo interface
         * that is incompatible with prerender and has caused the cancellation of the attempt.
         */
        disallowedMojoInterface?: string;
        mismatchedHeaders?: PrerenderMismatchedHeaders[];
    }
    /**
     * Send a list of sources for all preloading attempts in a document.
     */
    interface PreloadingAttemptSourcesUpdatedEvent {
        loaderId: Network.LoaderId;
        preloadingAttemptSources: PreloadingAttemptSource[];
    }
}
export declare namespace Security {
    /**
     * An internal certificate ID value.
     */
    type CertificateId = OpaqueIdentifier<integer, 'Protocol.Security.CertificateId'>;
    /**
     * A description of mixed content (HTTP resources on HTTPS pages), as defined by
     * https://www.w3.org/TR/mixed-content/#categories
     */
    const enum MixedContentType {
        Blockable = "blockable",
        OptionallyBlockable = "optionally-blockable",
        None = "none"
    }
    /**
     * The security level of a page or resource.
     */
    const enum SecurityState {
        Unknown = "unknown",
        Neutral = "neutral",
        Insecure = "insecure",
        Secure = "secure",
        Info = "info",
        InsecureBroken = "insecure-broken"
    }
    /**
     * Details about the security state of the page certificate.
     */
    interface CertificateSecurityState {
        /**
         * Protocol name (e.g. "TLS 1.2" or "QUIC").
         */
        protocol: string;
        /**
         * Key Exchange used by the connection, or the empty string if not applicable.
         */
        keyExchange: string;
        /**
         * (EC)DH group used by the connection, if applicable.
         */
        keyExchangeGroup?: string;
        /**
         * Cipher name.
         */
        cipher: string;
        /**
         * TLS MAC. Note that AEAD ciphers do not have separate MACs.
         */
        mac?: string;
        /**
         * Page certificate.
         */
        certificate: string[];
        /**
         * Certificate subject name.
         */
        subjectName: string;
        /**
         * Name of the issuing CA.
         */
        issuer: string;
        /**
         * Certificate valid from date.
         */
        validFrom: Network.TimeSinceEpoch;
        /**
         * Certificate valid to (expiration) date
         */
        validTo: Network.TimeSinceEpoch;
        /**
         * The highest priority network error code, if the certificate has an error.
         */
        certificateNetworkError?: string;
        /**
         * True if the certificate uses a weak signature algorithm.
         */
        certificateHasWeakSignature: boolean;
        /**
         * True if the certificate has a SHA1 signature in the chain.
         */
        certificateHasSha1Signature: boolean;
        /**
         * True if modern SSL
         */
        modernSSL: boolean;
        /**
         * True if the connection is using an obsolete SSL protocol.
         */
        obsoleteSslProtocol: boolean;
        /**
         * True if the connection is using an obsolete SSL key exchange.
         */
        obsoleteSslKeyExchange: boolean;
        /**
         * True if the connection is using an obsolete SSL cipher.
         */
        obsoleteSslCipher: boolean;
        /**
         * True if the connection is using an obsolete SSL signature.
         */
        obsoleteSslSignature: boolean;
    }
    const enum SafetyTipStatus {
        BadReputation = "badReputation",
        Lookalike = "lookalike"
    }
    interface SafetyTipInfo {
        /**
         * Describes whether the page triggers any safety tips or reputation warnings. Default is unknown.
         */
        safetyTipStatus: SafetyTipStatus;
        /**
         * The URL the safety tip suggested ("Did you mean?"). Only filled in for lookalike matches.
         */
        safeUrl?: string;
    }
    /**
     * Security state information about the page.
     */
    interface VisibleSecurityState {
        /**
         * The security level of the page.
         */
        securityState: SecurityState;
        /**
         * Security state details about the page certificate.
         */
        certificateSecurityState?: CertificateSecurityState;
        /**
         * The type of Safety Tip triggered on the page. Note that this field will be set even if the Safety Tip UI was not actually shown.
         */
        safetyTipInfo?: SafetyTipInfo;
        /**
         * Array of security state issues ids.
         */
        securityStateIssueIds: string[];
    }
    /**
     * An explanation of an factor contributing to the security state.
     */
    interface SecurityStateExplanation {
        /**
         * Security state representing the severity of the factor being explained.
         */
        securityState: SecurityState;
        /**
         * Title describing the type of factor.
         */
        title: string;
        /**
         * Short phrase describing the type of factor.
         */
        summary: string;
        /**
         * Full text explanation of the factor.
         */
        description: string;
        /**
         * The type of mixed content described by the explanation.
         */
        mixedContentType: MixedContentType;
        /**
         * Page certificate.
         */
        certificate: string[];
        /**
         * Recommendations to fix any issues.
         */
        recommendations?: string[];
    }
    /**
     * Information about insecure content on the page.
     * @deprecated
     */
    interface InsecureContentStatus {
        /**
         * Always false.
         */
        ranMixedContent: boolean;
        /**
         * Always false.
         */
        displayedMixedContent: boolean;
        /**
         * Always false.
         */
        containedMixedForm: boolean;
        /**
         * Always false.
         */
        ranContentWithCertErrors: boolean;
        /**
         * Always false.
         */
        displayedContentWithCertErrors: boolean;
        /**
         * Always set to unknown.
         */
        ranInsecureContentStyle: SecurityState;
        /**
         * Always set to unknown.
         */
        displayedInsecureContentStyle: SecurityState;
    }
    /**
     * The action to take when a certificate error occurs. continue will continue processing the
     * request and cancel will cancel the request.
     */
    const enum CertificateErrorAction {
        Continue = "continue",
        Cancel = "cancel"
    }
    interface SetIgnoreCertificateErrorsRequest {
        /**
         * If true, all certificate errors will be ignored.
         */
        ignore: boolean;
    }
    interface HandleCertificateErrorRequest {
        /**
         * The ID of the event.
         */
        eventId: integer;
        /**
         * The action to take on the certificate error.
         */
        action: CertificateErrorAction;
    }
    interface SetOverrideCertificateErrorsRequest {
        /**
         * If true, certificate errors will be overridden.
         */
        override: boolean;
    }
    /**
     * There is a certificate error. If overriding certificate errors is enabled, then it should be
     * handled with the `handleCertificateError` command. Note: this event does not fire if the
     * certificate error has been allowed internally. Only one client per target should override
     * certificate errors at the same time.
     * @deprecated
     */
    interface CertificateErrorEvent {
        /**
         * The ID of the event.
         */
        eventId: integer;
        /**
         * The type of the error.
         */
        errorType: string;
        /**
         * The url that was requested.
         */
        requestURL: string;
    }
    /**
     * The security state of the page changed.
     */
    interface VisibleSecurityStateChangedEvent {
        /**
         * Security state information about the page.
         */
        visibleSecurityState: VisibleSecurityState;
    }
    /**
     * The security state of the page changed. No longer being sent.
     * @deprecated
     */
    interface SecurityStateChangedEvent {
        /**
         * Security state.
         */
        securityState: SecurityState;
        /**
         * True if the page was loaded over cryptographic transport such as HTTPS.
         * @deprecated
         */
        schemeIsCryptographic: boolean;
        /**
         * Previously a list of explanations for the security state. Now always
         * empty.
         * @deprecated
         */
        explanations: SecurityStateExplanation[];
        /**
         * Information about insecure content on the page.
         * @deprecated
         */
        insecureContentStatus: InsecureContentStatus;
        /**
         * Overrides user-visible description of the state. Always omitted.
         * @deprecated
         */
        summary?: string;
    }
}
export declare namespace ServiceWorker {
    type RegistrationID = OpaqueIdentifier<string, 'Protocol.ServiceWorker.RegistrationID'>;
    /**
     * ServiceWorker registration.
     */
    interface ServiceWorkerRegistration {
        registrationId: RegistrationID;
        scopeURL: string;
        isDeleted: boolean;
    }
    const enum ServiceWorkerVersionRunningStatus {
        Stopped = "stopped",
        Starting = "starting",
        Running = "running",
        Stopping = "stopping"
    }
    const enum ServiceWorkerVersionStatus {
        New = "new",
        Installing = "installing",
        Installed = "installed",
        Activating = "activating",
        Activated = "activated",
        Redundant = "redundant"
    }
    /**
     * Mostly corresponds to `RouterCondition` in ServiceWorker spec
     * (https://www.w3.org/TR/service-workers/#dictdef-routercondition)
     */
    interface ServiceWorkerRouterCondition {
        /**
         * Plain text, or JSON serialization of URLPatternInit or URLPattern
         */
        urlPattern?: string;
        requestMethod?: string;
        requestMode?: string;
        requestDestination?: string;
        runningStatus?: ServiceWorkerVersionRunningStatus;
        or?: ServiceWorkerRouterCondition[];
        not?: ServiceWorkerRouterCondition;
    }
    const enum ServiceWorkerRouterSourceType {
        Cache = "cache",
        FetchEvent = "fetchEvent",
        Network = "network",
        RaceNetworkAndFetchHandler = "raceNetworkAndFetchHandler",
        RaceNetworkAndCache = "raceNetworkAndCache",
        SourceDict = "sourceDict"
    }
    /**
     * https://www.w3.org/TR/service-workers/#dictdef-routersourcedict
     */
    interface ServiceWorkerRouterSourceDict {
        cacheName: string;
    }
    /**
     * Corresponds to `RouterSource` in the spec while the representation is different as follows.
     * (https://www.w3.org/TR/service-workers/#typedefdef-routersource)
     * - `RouterSourceEnum`: `type` equals `cache`, `sourceDict` is null.
     * - `RouterSourceDict`: `type` equals `sourceDict`, `sourceDict` has valid value.
     */
    interface ServiceWorkerRouterSource {
        type: ServiceWorkerRouterSourceType;
        /**
         * Non-empty iff `type` equals "sourceDict".
         */
        sourceDict?: ServiceWorkerRouterSourceDict;
    }
    interface ServiceWorkerRouterRule {
        condition: ServiceWorkerRouterCondition;
        source: ServiceWorkerRouterSource;
        /**
         * Rule ID assigned by the browser. Unique within each ServiceWorkerVersion.
         */
        id: integer;
    }
    /**
     * ServiceWorker version.
     */
    interface ServiceWorkerVersion {
        versionId: string;
        registrationId: RegistrationID;
        scriptURL: string;
        runningStatus: ServiceWorkerVersionRunningStatus;
        status: ServiceWorkerVersionStatus;
        /**
         * The Last-Modified header value of the main script.
         */
        scriptLastModified?: number;
        /**
         * The time at which the response headers of the main script were received from the server.
         * For cached script it is the last time the cache entry was validated.
         */
        scriptResponseTime?: number;
        controlledClients?: Target.TargetID[];
        targetId?: Target.TargetID;
        /**
         * Migration to `typedRouterRules` is in progress. The browser sends either
         * `routerRules` or `typedRouterRules`.
         * TODO(crbug.com/540469610): Remove `routerRules` after the migration.
         */
        routerRules?: string;
        typedRouterRules?: ServiceWorkerRouterRule[];
    }
    /**
     * ServiceWorker error message.
     */
    interface ServiceWorkerErrorMessage {
        errorMessage: string;
        registrationId: RegistrationID;
        versionId: string;
        sourceURL: string;
        lineNumber: integer;
        columnNumber: integer;
    }
    interface DeliverPushMessageRequest {
        origin: string;
        registrationId: RegistrationID;
        data: string;
    }
    interface DispatchSyncEventRequest {
        origin: string;
        registrationId: RegistrationID;
        tag: string;
        lastChance: boolean;
    }
    interface DispatchPeriodicSyncEventRequest {
        origin: string;
        registrationId: RegistrationID;
        tag: string;
    }
    interface SetForceUpdateOnPageLoadRequest {
        forceUpdateOnPageLoad: boolean;
    }
    interface SkipWaitingRequest {
        scopeURL: string;
    }
    interface StartWorkerRequest {
        scopeURL: string;
    }
    interface StopWorkerRequest {
        versionId: string;
    }
    interface UnregisterRequest {
        scopeURL: string;
    }
    interface UpdateRegistrationRequest {
        scopeURL: string;
    }
    interface WorkerErrorReportedEvent {
        errorMessage: ServiceWorkerErrorMessage;
    }
    interface WorkerRegistrationUpdatedEvent {
        registrations: ServiceWorkerRegistration[];
    }
    interface WorkerVersionUpdatedEvent {
        versions: ServiceWorkerVersion[];
    }
}
export declare namespace SmartCardEmulation {
    /**
     * Indicates the PC/SC error code.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__ErrorCodes.html
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/secauthn/authentication-return-values
     */
    const enum ResultCode {
        Success = "success",
        RemovedCard = "removed-card",
        ResetCard = "reset-card",
        UnpoweredCard = "unpowered-card",
        UnresponsiveCard = "unresponsive-card",
        UnsupportedCard = "unsupported-card",
        ReaderUnavailable = "reader-unavailable",
        SharingViolation = "sharing-violation",
        NotTransacted = "not-transacted",
        NoSmartcard = "no-smartcard",
        ProtoMismatch = "proto-mismatch",
        SystemCancelled = "system-cancelled",
        NotReady = "not-ready",
        Cancelled = "cancelled",
        InsufficientBuffer = "insufficient-buffer",
        InvalidHandle = "invalid-handle",
        InvalidParameter = "invalid-parameter",
        InvalidValue = "invalid-value",
        NoMemory = "no-memory",
        Timeout = "timeout",
        UnknownReader = "unknown-reader",
        UnsupportedFeature = "unsupported-feature",
        NoReadersAvailable = "no-readers-available",
        ServiceStopped = "service-stopped",
        NoService = "no-service",
        CommError = "comm-error",
        InternalError = "internal-error",
        ServerTooBusy = "server-too-busy",
        Unexpected = "unexpected",
        Shutdown = "shutdown",
        UnknownCard = "unknown-card",
        Unknown = "unknown"
    }
    /**
     * Maps to the |SCARD_SHARE_*| values.
     */
    const enum ShareMode {
        Shared = "shared",
        Exclusive = "exclusive",
        Direct = "direct"
    }
    /**
     * Indicates what the reader should do with the card.
     */
    const enum Disposition {
        LeaveCard = "leave-card",
        ResetCard = "reset-card",
        UnpowerCard = "unpower-card",
        EjectCard = "eject-card"
    }
    /**
     * Maps to |SCARD_*| connection state values.
     */
    const enum ConnectionState {
        Absent = "absent",
        Present = "present",
        Swallowed = "swallowed",
        Powered = "powered",
        Negotiable = "negotiable",
        Specific = "specific"
    }
    /**
     * Maps to the |SCARD_STATE_*| flags.
     */
    interface ReaderStateFlags {
        unaware?: boolean;
        ignore?: boolean;
        changed?: boolean;
        unknown?: boolean;
        unavailable?: boolean;
        empty?: boolean;
        present?: boolean;
        exclusive?: boolean;
        inuse?: boolean;
        mute?: boolean;
        unpowered?: boolean;
    }
    /**
     * Maps to the |SCARD_PROTOCOL_*| flags.
     */
    interface ProtocolSet {
        t0?: boolean;
        t1?: boolean;
        raw?: boolean;
    }
    /**
     * Maps to the |SCARD_PROTOCOL_*| values.
     */
    const enum Protocol {
        T0 = "t0",
        T1 = "t1",
        Raw = "raw"
    }
    interface ReaderStateIn {
        reader: string;
        currentState: ReaderStateFlags;
        currentInsertionCount: integer;
    }
    interface ReaderStateOut {
        reader: string;
        eventState: ReaderStateFlags;
        eventCount: integer;
        atr: binary;
    }
    interface ReportEstablishContextResultRequest {
        requestId: string;
        contextId: integer;
    }
    interface ReportReleaseContextResultRequest {
        requestId: string;
    }
    interface ReportListReadersResultRequest {
        requestId: string;
        readers: string[];
    }
    interface ReportGetStatusChangeResultRequest {
        requestId: string;
        readerStates: ReaderStateOut[];
    }
    interface ReportBeginTransactionResultRequest {
        requestId: string;
        handle: integer;
    }
    interface ReportPlainResultRequest {
        requestId: string;
    }
    interface ReportConnectResultRequest {
        requestId: string;
        handle: integer;
        activeProtocol?: Protocol;
    }
    interface ReportDataResultRequest {
        requestId: string;
        data: binary;
    }
    interface ReportStatusResultRequest {
        requestId: string;
        readerName: string;
        state: ConnectionState;
        atr: binary;
        protocol?: Protocol;
    }
    interface ReportErrorRequest {
        requestId: string;
        resultCode: ResultCode;
    }
    /**
     * Fired when |SCardEstablishContext| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#gaa1b8970169fd4883a6dc4a8f43f19b67
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardestablishcontext
     */
    interface EstablishContextRequestedEvent {
        requestId: string;
    }
    /**
     * Fired when |SCardReleaseContext| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#ga6aabcba7744c5c9419fdd6404f73a934
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardreleasecontext
     */
    interface ReleaseContextRequestedEvent {
        requestId: string;
        contextId: integer;
    }
    /**
     * Fired when |SCardListReaders| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#ga93b07815789b3cf2629d439ecf20f0d9
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardlistreadersa
     */
    interface ListReadersRequestedEvent {
        requestId: string;
        contextId: integer;
    }
    /**
     * Fired when |SCardGetStatusChange| is called. Timeout is specified in milliseconds.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#ga33247d5d1257d59e55647c3bb717db24
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardgetstatuschangea
     */
    interface GetStatusChangeRequestedEvent {
        requestId: string;
        contextId: integer;
        readerStates: ReaderStateIn[];
        /**
         * in milliseconds, if absent, it means "infinite"
         */
        timeout?: integer;
    }
    /**
     * Fired when |SCardCancel| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#gaacbbc0c6d6c0cbbeb4f4debf6fbeeee6
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardcancel
     */
    interface CancelRequestedEvent {
        requestId: string;
        contextId: integer;
    }
    /**
     * Fired when |SCardConnect| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#ga4e515829752e0a8dbc4d630696a8d6a5
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardconnecta
     */
    interface ConnectRequestedEvent {
        requestId: string;
        contextId: integer;
        reader: string;
        shareMode: ShareMode;
        preferredProtocols: ProtocolSet;
    }
    /**
     * Fired when |SCardDisconnect| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#ga4be198045c73ec0deb79e66c0ca1738a
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scarddisconnect
     */
    interface DisconnectRequestedEvent {
        requestId: string;
        handle: integer;
        disposition: Disposition;
    }
    /**
     * Fired when |SCardTransmit| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#ga9a2d77242a271310269065e64633ab99
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardtransmit
     */
    interface TransmitRequestedEvent {
        requestId: string;
        handle: integer;
        data: binary;
        protocol?: Protocol;
    }
    /**
     * Fired when |SCardControl| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#gac3454d4657110fd7f753b2d3d8f4e32f
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardcontrol
     */
    interface ControlRequestedEvent {
        requestId: string;
        handle: integer;
        controlCode: integer;
        data: binary;
    }
    /**
     * Fired when |SCardGetAttrib| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#gaacfec51917255b7a25b94c5104961602
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardgetattrib
     */
    interface GetAttribRequestedEvent {
        requestId: string;
        handle: integer;
        attribId: integer;
    }
    /**
     * Fired when |SCardSetAttrib| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#ga060f0038a4ddfd5dd2b8fadf3c3a2e4f
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardsetattrib
     */
    interface SetAttribRequestedEvent {
        requestId: string;
        handle: integer;
        attribId: integer;
        data: binary;
    }
    /**
     * Fired when |SCardStatus| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#gae49c3c894ad7ac12a5b896bde70d0382
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardstatusa
     */
    interface StatusRequestedEvent {
        requestId: string;
        handle: integer;
    }
    /**
     * Fired when |SCardBeginTransaction| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#gaddb835dce01a0da1d6ca02d33ee7d861
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardbegintransaction
     */
    interface BeginTransactionRequestedEvent {
        requestId: string;
        handle: integer;
    }
    /**
     * Fired when |SCardEndTransaction| is called.
     *
     * This maps to:
     * PC/SC Lite: https://pcsclite.apdu.fr/api/group__API.html#gae8742473b404363e5c587f570d7e2f3b
     * Microsoft: https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardendtransaction
     */
    interface EndTransactionRequestedEvent {
        requestId: string;
        handle: integer;
        disposition: Disposition;
    }
}
export declare namespace Storage {
    type SerializedStorageKey = string;
    /**
     * Enum of possible storage types.
     */
    const enum StorageType {
        Cookies = "cookies",
        File_systems = "file_systems",
        Indexeddb = "indexeddb",
        Local_storage = "local_storage",
        Shader_cache = "shader_cache",
        Websql = "websql",
        Service_workers = "service_workers",
        Cache_storage = "cache_storage",
        Storage_buckets = "storage_buckets",
        All = "all",
        Other = "other"
    }
    /**
     * Usage for a storage type.
     */
    interface UsageForType {
        /**
         * Name of storage type.
         */
        storageType: StorageType;
        /**
         * Storage usage (bytes).
         */
        usage: number;
    }
    /**
     * Pair of issuer origin and number of available (signed, but not used) Trust
     * Tokens from that issuer.
     */
    interface TrustTokens {
        issuerOrigin: string;
        count: number;
    }
    /**
     * Details of a stored Private Verification Token.
     */
    interface PrivateVerificationToken {
        /**
         * Unique identifier of the token in the database.
         */
        id: string;
        /**
         * Origin of the token issuer.
         */
        issuerOrigin: string;
        /**
         * Public key ID used to issue the token.
         */
        keyId: integer;
        /**
         * Expiration timestamp in seconds since the epoch.
         */
        expiration: Network.TimeSinceEpoch;
        /**
         * Token creation timestamp in seconds since the epoch.
         */
        creationTime: Network.TimeSinceEpoch;
        /**
         * Token protocol version.
         */
        version: integer;
        /**
         * Base64-encoded serialized token.
         */
        token: string;
    }
    /**
     * Configuration for a Private Verification Tokens issuer.
     */
    interface PrivateVerificationTokensIssuerConfig {
        /**
         * Origin of the token issuer.
         */
        issuerOrigin: string;
        /**
         * Origins authorized to redeem tokens from this issuer.
         */
        redeemerOrigins: string[];
    }
    const enum StorageBucketsDurability {
        Relaxed = "relaxed",
        Strict = "strict"
    }
    interface StorageBucket {
        storageKey: SerializedStorageKey;
        /**
         * If not specified, it is the default bucket of the storageKey.
         */
        name?: string;
    }
    interface StorageBucketInfo {
        bucket: StorageBucket;
        id: string;
        expiration: Network.TimeSinceEpoch;
        /**
         * Storage quota (bytes).
         */
        quota: number;
        persistent: boolean;
        durability: StorageBucketsDurability;
    }
    interface GetStorageKeyForFrameRequest {
        frameId: Page.FrameId;
    }
    interface GetStorageKeyForFrameResponse extends ProtocolResponseWithError {
        storageKey: SerializedStorageKey;
    }
    interface GetStorageKeyRequest {
        frameId?: Page.FrameId;
    }
    interface GetStorageKeyResponse extends ProtocolResponseWithError {
        storageKey: SerializedStorageKey;
    }
    interface ClearDataForOriginRequest {
        /**
         * Security origin.
         */
        origin: string;
        /**
         * Comma separated list of StorageType to clear.
         */
        storageTypes: string;
    }
    interface ClearDataForStorageKeyRequest {
        /**
         * Storage key.
         */
        storageKey: string;
        /**
         * Comma separated list of StorageType to clear.
         */
        storageTypes: string;
    }
    interface GetCookiesRequest {
        /**
         * Browser context to use when called on the browser endpoint.
         */
        browserContextId?: Browser.BrowserContextID;
    }
    interface GetCookiesResponse extends ProtocolResponseWithError {
        /**
         * Array of cookie objects.
         */
        cookies: Network.Cookie[];
    }
    interface SetCookiesRequest {
        /**
         * Cookies to be set.
         */
        cookies: Network.CookieParam[];
        /**
         * Browser context to use when called on the browser endpoint.
         */
        browserContextId?: Browser.BrowserContextID;
    }
    interface ClearCookiesRequest {
        /**
         * Browser context to use when called on the browser endpoint.
         */
        browserContextId?: Browser.BrowserContextID;
    }
    interface GetUsageAndQuotaRequest {
        /**
         * Security origin.
         */
        origin: string;
    }
    interface GetUsageAndQuotaResponse extends ProtocolResponseWithError {
        /**
         * Storage usage (bytes).
         */
        usage: number;
        /**
         * Storage quota (bytes).
         */
        quota: number;
        /**
         * Whether or not the origin has an active storage quota override
         */
        overrideActive: boolean;
        /**
         * Storage usage per type (bytes).
         */
        usageBreakdown: UsageForType[];
    }
    interface OverrideQuotaForOriginRequest {
        /**
         * Security origin.
         */
        origin: string;
        /**
         * The quota size (in bytes) to override the original quota with.
         * If this is called multiple times, the overridden quota will be equal to
         * the quotaSize provided in the final call. If this is called without
         * specifying a quotaSize, the quota will be reset to the default value for
         * the specified origin. If this is called multiple times with different
         * origins, the override will be maintained for each origin until it is
         * disabled (called without a quotaSize).
         */
        quotaSize?: number;
    }
    interface TrackCacheStorageForOriginRequest {
        /**
         * Security origin.
         */
        origin: string;
    }
    interface TrackCacheStorageForStorageKeyRequest {
        /**
         * Storage key.
         */
        storageKey: string;
    }
    interface TrackIndexedDBForOriginRequest {
        /**
         * Security origin.
         */
        origin: string;
    }
    interface TrackIndexedDBForStorageKeyRequest {
        /**
         * Storage key.
         */
        storageKey: string;
    }
    interface UntrackCacheStorageForOriginRequest {
        /**
         * Security origin.
         */
        origin: string;
    }
    interface UntrackCacheStorageForStorageKeyRequest {
        /**
         * Storage key.
         */
        storageKey: string;
    }
    interface UntrackIndexedDBForOriginRequest {
        /**
         * Security origin.
         */
        origin: string;
    }
    interface UntrackIndexedDBForStorageKeyRequest {
        /**
         * Storage key.
         */
        storageKey: string;
    }
    interface GetTrustTokensResponse extends ProtocolResponseWithError {
        tokens: TrustTokens[];
    }
    interface ClearTrustTokensRequest {
        issuerOrigin: string;
    }
    interface ClearTrustTokensResponse extends ProtocolResponseWithError {
        /**
         * True if any tokens were deleted, false otherwise.
         */
        didDeleteTokens: boolean;
    }
    interface GetPrivateVerificationTokensResponse extends ProtocolResponseWithError {
        tokens: PrivateVerificationToken[];
    }
    interface GetPrivateVerificationTokensIssuerConfigsResponse extends ProtocolResponseWithError {
        configs: PrivateVerificationTokensIssuerConfig[];
    }
    interface ClearPrivateVerificationTokensRequest {
        issuerOrigin: string;
    }
    interface DeletePrivateVerificationTokenRequest {
        tokenId: string;
    }
    interface SetPrivateVerificationTokensTrackingRequest {
        enable: boolean;
    }
    interface SetStorageBucketTrackingRequest {
        storageKey: string;
        enable: boolean;
    }
    interface DeleteStorageBucketRequest {
        bucket: StorageBucket;
    }
    interface RunBounceTrackingMitigationsResponse extends ProtocolResponseWithError {
        deletedSites: string[];
    }
    /**
     * A cache's contents have been modified.
     */
    interface CacheStorageContentUpdatedEvent {
        /**
         * Origin to update.
         */
        origin: string;
        /**
         * Storage key to update.
         */
        storageKey: string;
        /**
         * Storage bucket to update.
         */
        bucketId: string;
        /**
         * Name of cache in origin.
         */
        cacheName: string;
    }
    /**
     * A cache has been added/deleted.
     */
    interface CacheStorageListUpdatedEvent {
        /**
         * Origin to update.
         */
        origin: string;
        /**
         * Storage key to update.
         */
        storageKey: string;
        /**
         * Storage bucket to update.
         */
        bucketId: string;
    }
    /**
     * The origin's IndexedDB object store has been modified.
     */
    interface IndexedDBContentUpdatedEvent {
        /**
         * Origin to update.
         */
        origin: string;
        /**
         * Storage key to update.
         */
        storageKey: string;
        /**
         * Storage bucket to update.
         */
        bucketId: string;
        /**
         * Database to update.
         */
        databaseName: string;
        /**
         * ObjectStore to update.
         */
        objectStoreName: string;
    }
    /**
     * The origin's IndexedDB database list has been modified.
     */
    interface IndexedDBListUpdatedEvent {
        /**
         * Origin to update.
         */
        origin: string;
        /**
         * Storage key to update.
         */
        storageKey: string;
        /**
         * Storage bucket to update.
         */
        bucketId: string;
    }
    interface StorageBucketCreatedOrUpdatedEvent {
        bucketInfo: StorageBucketInfo;
    }
    interface StorageBucketDeletedEvent {
        bucketId: string;
    }
}
/**
 * The SystemInfo domain defines methods and events for querying low-level system information.
 */
export declare namespace SystemInfo {
    /**
     * Describes a single graphics processor (GPU).
     */
    interface GPUDevice {
        /**
         * PCI ID of the GPU vendor, if available; 0 otherwise.
         */
        vendorId: number;
        /**
         * PCI ID of the GPU device, if available; 0 otherwise.
         */
        deviceId: number;
        /**
         * Sub sys ID of the GPU, only available on Windows.
         */
        subSysId?: number;
        /**
         * Revision of the GPU, only available on Windows.
         */
        revision?: number;
        /**
         * String description of the GPU vendor, if the PCI ID is not available.
         */
        vendorString: string;
        /**
         * String description of the GPU device, if the PCI ID is not available.
         */
        deviceString: string;
        /**
         * String description of the GPU driver vendor.
         */
        driverVendor: string;
        /**
         * String description of the GPU driver version.
         */
        driverVersion: string;
    }
    /**
     * Describes the width and height dimensions of an entity.
     */
    interface Size {
        /**
         * Width in pixels.
         */
        width: integer;
        /**
         * Height in pixels.
         */
        height: integer;
    }
    /**
     * Describes a supported video decoding profile with its associated minimum and
     * maximum resolutions.
     */
    interface VideoDecodeAcceleratorCapability {
        /**
         * Video codec profile that is supported, e.g. VP9 Profile 2.
         */
        profile: string;
        /**
         * Maximum video dimensions in pixels supported for this |profile|.
         */
        maxResolution: Size;
        /**
         * Minimum video dimensions in pixels supported for this |profile|.
         */
        minResolution: Size;
    }
    /**
     * Describes a supported video encoding profile with its associated maximum
     * resolution and maximum framerate.
     */
    interface VideoEncodeAcceleratorCapability {
        /**
         * Video codec profile that is supported, e.g H264 Main.
         */
        profile: string;
        /**
         * Maximum video dimensions in pixels supported for this |profile|.
         */
        maxResolution: Size;
        /**
         * Maximum encoding framerate in frames per second supported for this
         * |profile|, as fraction's numerator and denominator, e.g. 24/1 fps,
         * 24000/1001 fps, etc.
         */
        maxFramerateNumerator: integer;
        maxFramerateDenominator: integer;
    }
    /**
     * YUV subsampling type of the pixels of a given image.
     */
    const enum SubsamplingFormat {
        Yuv420 = "yuv420",
        Yuv422 = "yuv422",
        Yuv444 = "yuv444"
    }
    /**
     * Image format of a given image.
     */
    const enum ImageType {
        Jpeg = "jpeg",
        Webp = "webp",
        Unknown = "unknown"
    }
    /**
     * Provides information about the GPU(s) on the system.
     */
    interface GPUInfo {
        /**
         * The graphics devices on the system. Element 0 is the primary GPU.
         */
        devices: GPUDevice[];
        /**
         * An optional dictionary of additional GPU related attributes.
         */
        auxAttributes?: any;
        /**
         * An optional dictionary of graphics features and their status.
         */
        featureStatus?: any;
        /**
         * An optional array of GPU driver bug workarounds.
         */
        driverBugWorkarounds: string[];
        /**
         * Supported accelerated video decoding capabilities.
         */
        videoDecoding: VideoDecodeAcceleratorCapability[];
        /**
         * Supported accelerated video encoding capabilities.
         */
        videoEncoding: VideoEncodeAcceleratorCapability[];
    }
    /**
     * Represents process info.
     */
    interface ProcessInfo {
        /**
         * Specifies process type.
         */
        type: string;
        /**
         * Specifies process id.
         */
        id: integer;
        /**
         * Specifies cumulative CPU usage in seconds across all threads of the
         * process since the process start.
         */
        cpuTime: number;
    }
    interface GetInfoResponse extends ProtocolResponseWithError {
        /**
         * Information about the GPUs on the system.
         */
        gpu: GPUInfo;
        /**
         * A platform-dependent description of the model of the machine. On Mac OS, this is, for
         * example, 'MacBookPro'. Will be the empty string if not supported.
         */
        modelName: string;
        /**
         * A platform-dependent description of the version of the machine. On Mac OS, this is, for
         * example, '10.1'. Will be the empty string if not supported.
         */
        modelVersion: string;
        /**
         * The command line string used to launch the browser. Will be the empty string if not
         * supported.
         */
        commandLine: string;
    }
    interface GetFeatureStateRequest {
        featureState: string;
    }
    interface GetFeatureStateResponse extends ProtocolResponseWithError {
        featureEnabled: boolean;
    }
    interface GetProcessInfoResponse extends ProtocolResponseWithError {
        /**
         * An array of process info blocks.
         */
        processInfo: ProcessInfo[];
    }
}
/**
 * Supports additional targets discovery and allows to attach to them.
 */
export declare namespace Target {
    type TargetID = OpaqueIdentifier<string, 'Protocol.Target.TargetID'>;
    /**
     * Unique identifier of attached debugging session.
     */
    type SessionID = OpaqueIdentifier<string, 'Protocol.Target.SessionID'>;
    interface TargetInfo {
        targetId: TargetID;
        /**
         * List of types: https://source.chromium.org/chromium/chromium/src/+/main:content/browser/devtools/devtools_agent_host_impl.cc?ss=chromium&q=f:devtools%20-f:out%20%22::kTypeTab%5B%5D%22
         */
        type: string;
        title: string;
        url: string;
        /**
         * Whether the target has an attached client.
         */
        attached: boolean;
        /**
         * Id of the parent target, if any. For example, "iframe" target may have a "page" parent.
         */
        parentId?: TargetID;
        /**
         * Opener target Id
         */
        openerId?: TargetID;
        /**
         * Whether the target has access to the originating window.
         */
        canAccessOpener: boolean;
        /**
         * Frame id of originating window (is only set if target has an opener).
         */
        openerFrameId?: Page.FrameId;
        /**
         * Id of the parent frame, present for "iframe" and "worker" targets. For nested workers,
         * this is the "ancestor" frame that created the first worker in the nested chain.
         */
        parentFrameId?: Page.FrameId;
        browserContextId?: Browser.BrowserContextID;
        /**
         * Provides additional details for specific target types. For example, for
         * the type of "page", this may be set to "prerender".
         */
        subtype?: string;
        /**
         * Embedder-specific target metadata. This is only set for targets of
         * type "tab".
         */
        embedderData?: any;
    }
    /**
     * A filter used by target query/discovery/auto-attach operations.
     */
    interface FilterEntry {
        /**
         * If set, causes exclusion of matching targets from the list.
         */
        exclude?: boolean;
        /**
         * If not present, matches any type.
         */
        type?: string;
    }
    /**
     * The entries in TargetFilter are matched sequentially against targets and
     * the first entry that matches determines if the target is included or not,
     * depending on the value of `exclude` field in the entry.
     * If filter is not specified, the one assumed is
     * [{type: "browser", exclude: true}, {type: "tab", exclude: true}, {}]
     * (i.e. include everything but `browser` and `tab`).
     */
    type TargetFilter = FilterEntry[];
    interface RemoteLocation {
        host: string;
        port: integer;
    }
    /**
     * The state of the target window.
     */
    const enum WindowState {
        Normal = "normal",
        Minimized = "minimized",
        Maximized = "maximized",
        Fullscreen = "fullscreen"
    }
    interface ActivateTargetRequest {
        targetId: TargetID;
    }
    interface AttachToTargetRequest {
        targetId: TargetID;
        /**
         * Enables "flat" access to the session via specifying sessionId attribute in the commands.
         * We plan to make this the default, deprecate non-flattened mode,
         * and eventually retire it. See crbug.com/991325.
         */
        flatten?: boolean;
    }
    interface AttachToTargetResponse extends ProtocolResponseWithError {
        /**
         * Id assigned to the session.
         */
        sessionId: SessionID;
    }
    interface AttachToBrowserTargetResponse extends ProtocolResponseWithError {
        /**
         * Id assigned to the session.
         */
        sessionId: SessionID;
    }
    interface CloseTargetRequest {
        targetId: TargetID;
    }
    interface CloseTargetResponse extends ProtocolResponseWithError {
        /**
         * Always set to true. If an error occurs, the response indicates protocol error.
         * @deprecated
         */
        success: boolean;
    }
    interface ExposeDevToolsProtocolRequest {
        targetId: TargetID;
        /**
         * Binding name, 'cdp' if not specified.
         */
        bindingName?: string;
        /**
         * If true, inherits the current root session's permissions (default: false).
         */
        inheritPermissions?: boolean;
    }
    interface CreateBrowserContextRequest {
        /**
         * If specified, disposes this context when debugging session disconnects.
         */
        disposeOnDetach?: boolean;
        /**
         * Proxy server, similar to the one passed to --proxy-server
         */
        proxyServer?: string;
        /**
         * Proxy bypass list, similar to the one passed to --proxy-bypass-list
         */
        proxyBypassList?: string;
        /**
         * An optional list of origins to grant unlimited cross-origin access to.
         * Parts of the URL other than those constituting origin are ignored.
         */
        originsWithUniversalNetworkAccess?: string[];
    }
    interface CreateBrowserContextResponse extends ProtocolResponseWithError {
        /**
         * The id of the context created.
         */
        browserContextId: Browser.BrowserContextID;
    }
    interface GetBrowserContextsResponse extends ProtocolResponseWithError {
        /**
         * An array of browser context ids.
         */
        browserContextIds: Browser.BrowserContextID[];
        /**
         * The id of the default browser context if available.
         */
        defaultBrowserContextId?: Browser.BrowserContextID;
    }
    interface CreateTargetRequest {
        /**
         * The initial URL the page will be navigated to. An empty string indicates about:blank.
         */
        url: string;
        /**
         * Frame left origin in DIP (requires newWindow to be true or headless shell).
         */
        left?: integer;
        /**
         * Frame top origin in DIP (requires newWindow to be true or headless shell).
         */
        top?: integer;
        /**
         * Frame width in DIP (requires newWindow to be true or headless shell).
         */
        width?: integer;
        /**
         * Frame height in DIP (requires newWindow to be true or headless shell).
         */
        height?: integer;
        /**
         * Frame window state (requires newWindow to be true or headless shell).
         * Default is normal.
         */
        windowState?: WindowState;
        /**
         * The browser context to create the page in.
         */
        browserContextId?: Browser.BrowserContextID;
        /**
         * Whether BeginFrames for this target will be controlled via DevTools (headless shell only,
         * not supported on MacOS yet, false by default).
         */
        enableBeginFrameControl?: boolean;
        /**
         * Whether to create a new Window or Tab (false by default, not supported by headless shell).
         */
        newWindow?: boolean;
        /**
         * Whether to create the target in background or foreground (false by default, not supported
         * by headless shell).
         */
        background?: boolean;
        /**
         * Whether to create the target of type "tab".
         */
        forTab?: boolean;
        /**
         * Whether to create a hidden target. The hidden target is observable via protocol, but not
         * present in the tab UI strip. Cannot be created with `forTab: true`, `newWindow: true` or
         * `background: false`. The life-time of the tab is limited to the life-time of the session.
         */
        hidden?: boolean;
        /**
         * If specified, determines whether the new target should be focused.
         * By default, the focus behavior depends on the `background` parameter:
         * - If `background` is false (default) and `focus` is omitted, the new target is focused and the browser window is brought to the foreground.
         * - If `background` is false and `focus` is false, the target is opened but the browser window's focus remains unchanged (e.g., if the window was in the background, it stays there).
         * - If `background` is true, setting `focus` to true is not supported and will result in an error.
         */
        focus?: boolean;
    }
    interface CreateTargetResponse extends ProtocolResponseWithError {
        /**
         * The id of the page opened.
         */
        targetId: TargetID;
    }
    interface DetachFromTargetRequest {
        /**
         * Session to detach.
         */
        sessionId?: SessionID;
        /**
         * Deprecated.
         * @deprecated
         */
        targetId?: TargetID;
    }
    interface DisposeBrowserContextRequest {
        browserContextId: Browser.BrowserContextID;
    }
    interface GetTargetInfoRequest {
        targetId?: TargetID;
    }
    interface GetTargetInfoResponse extends ProtocolResponseWithError {
        targetInfo: TargetInfo;
    }
    interface GetTargetsRequest {
        /**
         * Only targets matching filter will be reported. If filter is not specified
         * and target discovery is currently enabled, a filter used for target discovery
         * is used for consistency.
         */
        filter?: TargetFilter;
    }
    interface GetTargetsResponse extends ProtocolResponseWithError {
        /**
         * The list of targets.
         */
        targetInfos: TargetInfo[];
    }
    interface SendMessageToTargetRequest {
        message: string;
        /**
         * Identifier of the session.
         */
        sessionId?: SessionID;
        /**
         * Deprecated.
         * @deprecated
         */
        targetId?: TargetID;
    }
    interface SetAutoAttachRequest {
        /**
         * Whether to auto-attach to related targets.
         */
        autoAttach: boolean;
        /**
         * Whether to pause new targets when attaching to them. Use `Runtime.runIfWaitingForDebugger`
         * to run paused targets.
         */
        waitForDebuggerOnStart: boolean;
        /**
         * Enables "flat" access to the session via specifying sessionId attribute in the commands.
         * We plan to make this the default, deprecate non-flattened mode,
         * and eventually retire it. See crbug.com/991325.
         */
        flatten?: boolean;
        /**
         * Only targets matching filter will be attached.
         */
        filter?: TargetFilter;
    }
    interface AutoAttachRelatedRequest {
        targetId: TargetID;
        /**
         * Whether to pause new targets when attaching to them. Use `Runtime.runIfWaitingForDebugger`
         * to run paused targets.
         */
        waitForDebuggerOnStart: boolean;
        /**
         * Only targets matching filter will be attached.
         */
        filter?: TargetFilter;
    }
    interface SetDiscoverTargetsRequest {
        /**
         * Whether to discover available targets.
         */
        discover: boolean;
        /**
         * Only targets matching filter will be attached. If `discover` is false,
         * `filter` must be omitted or empty.
         */
        filter?: TargetFilter;
    }
    interface SetRemoteLocationsRequest {
        /**
         * List of remote locations.
         */
        locations: RemoteLocation[];
    }
    interface GetDevToolsTargetRequest {
        /**
         * Page or tab target ID.
         */
        targetId: TargetID;
    }
    interface GetDevToolsTargetResponse extends ProtocolResponseWithError {
        /**
         * The targetId of DevTools page target if exists.
         */
        targetId?: TargetID;
    }
    interface OpenDevToolsRequest {
        /**
         * This can be the page or tab target ID.
         */
        targetId: TargetID;
        /**
         * The id of the panel we want DevTools to open initially. Currently
         * supported panels are elements, console, network, sources, resources,
         * timeline, chrome-recorder, heap-profiler, lighthouse, and security.
         */
        panelId?: string;
    }
    interface OpenDevToolsResponse extends ProtocolResponseWithError {
        /**
         * The targetId of DevTools page target.
         */
        targetId: TargetID;
    }
    /**
     * Issued when attached to target because of auto-attach or `attachToTarget` command.
     */
    interface AttachedToTargetEvent {
        /**
         * Identifier assigned to the session used to send/receive messages.
         */
        sessionId: SessionID;
        targetInfo: TargetInfo;
        waitingForDebugger: boolean;
    }
    /**
     * Issued when detached from target for any reason (including `detachFromTarget` command). Can be
     * issued multiple times per target if multiple sessions have been attached to it.
     */
    interface DetachedFromTargetEvent {
        /**
         * Detached session identifier.
         */
        sessionId: SessionID;
        /**
         * Deprecated.
         * @deprecated
         */
        targetId?: TargetID;
    }
    /**
     * Notifies about a new protocol message received from the session (as reported in
     * `attachedToTarget` event).
     */
    interface ReceivedMessageFromTargetEvent {
        /**
         * Identifier of a session which sends a message.
         */
        sessionId: SessionID;
        message: string;
        /**
         * Deprecated.
         * @deprecated
         */
        targetId?: TargetID;
    }
    /**
     * Issued when a possible inspection target is created.
     */
    interface TargetCreatedEvent {
        targetInfo: TargetInfo;
    }
    /**
     * Issued when a target is destroyed.
     */
    interface TargetDestroyedEvent {
        targetId: TargetID;
    }
    /**
     * Issued when a target has crashed.
     */
    interface TargetCrashedEvent {
        targetId: TargetID;
        /**
         * Termination status type.
         */
        status: string;
        /**
         * Termination error code.
         */
        errorCode: integer;
    }
    /**
     * Issued when some information about a target has changed. This only happens between
     * `targetCreated` and `targetDestroyed`.
     */
    interface TargetInfoChangedEvent {
        targetInfo: TargetInfo;
    }
}
/**
 * The Tethering domain defines methods and events for browser port binding.
 */
export declare namespace Tethering {
    interface BindRequest {
        /**
         * Port number to bind.
         */
        port: integer;
    }
    interface UnbindRequest {
        /**
         * Port number to unbind.
         */
        port: integer;
    }
    /**
     * Informs that port was successfully bound and got a specified connection id.
     */
    interface AcceptedEvent {
        /**
         * Port number that was successfully bound.
         */
        port: integer;
        /**
         * Connection id to be used.
         */
        connectionId: string;
    }
}
export declare namespace Tracing {
    /**
     * Configuration for memory dump. Used only when "memory-infra" category is enabled.
     */
    interface MemoryDumpConfig {
        [key: string]: string;
    }
    const enum TraceConfigRecordMode {
        RecordUntilFull = "recordUntilFull",
        RecordContinuously = "recordContinuously",
        RecordAsMuchAsPossible = "recordAsMuchAsPossible",
        EchoToConsole = "echoToConsole"
    }
    interface TraceConfig {
        /**
         * Controls how the trace buffer stores data. The default is `recordUntilFull`.
         */
        recordMode?: TraceConfigRecordMode;
        /**
         * Size of the trace buffer in kilobytes. If not specified or zero is passed, a default value
         * of 200 MB would be used.
         */
        traceBufferSizeInKb?: number;
        /**
         * Turns on JavaScript stack sampling.
         */
        enableSampling?: boolean;
        /**
         * Turns on system tracing.
         */
        enableSystrace?: boolean;
        /**
         * Turns on argument filter.
         */
        enableArgumentFilter?: boolean;
        /**
         * Included category filters.
         */
        includedCategories?: string[];
        /**
         * Excluded category filters.
         */
        excludedCategories?: string[];
        /**
         * Configuration to synthesize the delays in tracing.
         */
        syntheticDelays?: string[];
        /**
         * Configuration for memory dump triggers. Used only when "memory-infra" category is enabled.
         */
        memoryDumpConfig?: MemoryDumpConfig;
    }
    /**
     * Data format of a trace. Can be either the legacy JSON format or the
     * protocol buffer format. Note that the JSON format will be deprecated soon.
     */
    const enum StreamFormat {
        Json = "json",
        Proto = "proto"
    }
    /**
     * Compression type to use for traces returned via streams.
     */
    const enum StreamCompression {
        None = "none",
        Gzip = "gzip"
    }
    /**
     * Details exposed when memory request explicitly declared.
     * Keep consistent with memory_dump_request_args.h and
     * memory_instrumentation.mojom
     */
    const enum MemoryDumpLevelOfDetail {
        Background = "background",
        Light = "light",
        Detailed = "detailed"
    }
    /**
     * Backend type to use for tracing. `chrome` uses the Chrome-integrated
     * tracing service and is supported on all platforms. `system` is only
     * supported on Chrome OS and uses the Perfetto system tracing service.
     * `auto` chooses `system` when the perfettoConfig provided to Tracing.start
     * specifies at least one non-Chrome data source; otherwise uses `chrome`.
     */
    const enum TracingBackend {
        Auto = "auto",
        Chrome = "chrome",
        System = "system"
    }
    interface GetCategoriesResponse extends ProtocolResponseWithError {
        /**
         * A list of supported tracing categories.
         */
        categories: string[];
    }
    interface GetTrackEventDescriptorResponse extends ProtocolResponseWithError {
        /**
         * Base64-encoded serialized perfetto.protos.TrackEventDescriptor protobuf message.
         */
        descriptor: binary;
    }
    interface RecordClockSyncMarkerRequest {
        /**
         * The ID of this clock sync marker
         */
        syncId: string;
    }
    interface RequestMemoryDumpRequest {
        /**
         * Enables more deterministic results by forcing garbage collection
         */
        deterministic?: boolean;
        /**
         * Specifies level of details in memory dump. Defaults to "detailed".
         */
        levelOfDetail?: MemoryDumpLevelOfDetail;
    }
    interface RequestMemoryDumpResponse extends ProtocolResponseWithError {
        /**
         * GUID of the resulting global memory dump.
         */
        dumpGuid: string;
        /**
         * True iff the global memory dump succeeded.
         */
        success: boolean;
    }
    const enum StartRequestTransferMode {
        ReportEvents = "ReportEvents",
        ReturnAsStream = "ReturnAsStream"
    }
    interface StartRequest {
        /**
         * Category/tag filter
         * @deprecated
         */
        categories?: string;
        /**
         * Tracing options
         * @deprecated
         */
        options?: string;
        /**
         * If set, the agent will issue bufferUsage events at this interval, specified in milliseconds
         */
        bufferUsageReportingInterval?: number;
        /**
         * Whether to report trace events as series of dataCollected events or to save trace to a
         * stream (defaults to `ReportEvents`).
         */
        transferMode?: StartRequestTransferMode;
        /**
         * Trace data format to use. This only applies when using `ReturnAsStream`
         * transfer mode (defaults to `json`).
         */
        streamFormat?: StreamFormat;
        /**
         * Compression format to use. This only applies when using `ReturnAsStream`
         * transfer mode (defaults to `none`)
         */
        streamCompression?: StreamCompression;
        traceConfig?: TraceConfig;
        /**
         * Base64-encoded serialized perfetto.protos.TraceConfig protobuf message
         * When specified, the parameters `categories`, `options`, `traceConfig`
         * are ignored.
         */
        perfettoConfig?: binary;
        /**
         * Backend type (defaults to `auto`)
         */
        tracingBackend?: TracingBackend;
        /**
         * Maximum width and height (in pixels) of each captured screenshot.
         * Only used when the `disabled-by-default-devtools.screenshot` category is
         * enabled. Defaults to 500. The combined memory footprint of screenshots
         * (`screenshotMaxSize` * `screenshotMaxSize` * 4 * `screenshotMaxCount`)
         * is clamped to the existing per-session budget.
         */
        screenshotMaxSize?: integer;
        /**
         * Maximum number of screenshots captured during a single tracing session.
         * Only used when the `disabled-by-default-devtools.screenshot` category is
         * enabled. Defaults to 450. Clamped together with `screenshotMaxSize` to
         * stay within the per-session screenshot memory budget.
         */
        screenshotMaxCount?: integer;
    }
    interface BufferUsageEvent {
        /**
         * A number in range [0..1] that indicates the used size of event buffer as a fraction of its
         * total size.
         */
        percentFull?: number;
        /**
         * An approximate number of events in the trace log.
         */
        eventCount?: number;
        /**
         * A number in range [0..1] that indicates the used size of event buffer as a fraction of its
         * total size.
         */
        value?: number;
    }
    /**
     * Contains a bucket of collected trace events. When tracing is stopped collected events will be
     * sent as a sequence of dataCollected events followed by tracingComplete event.
     */
    interface DataCollectedEvent {
        value: any[];
    }
    /**
     * Signals that tracing is stopped and there is no trace buffers pending flush, all data were
     * delivered via dataCollected events.
     */
    interface TracingCompleteEvent {
        /**
         * Indicates whether some trace data is known to have been lost, e.g. because the trace ring
         * buffer wrapped around.
         */
        dataLossOccurred: boolean;
        /**
         * A handle of the stream that holds resulting trace data.
         */
        stream?: IO.StreamHandle;
        /**
         * Trace data format of returned stream.
         */
        traceFormat?: StreamFormat;
        /**
         * Compression format of returned stream.
         */
        streamCompression?: StreamCompression;
    }
}
/**
 * This domain allows inspection of Web Audio API.
 * https://webaudio.github.io/web-audio-api/
 */
export declare namespace WebAudio {
    /**
     * An unique ID for a graph object (AudioContext, AudioNode, AudioParam) in Web Audio API
     */
    type GraphObjectId = OpaqueIdentifier<string, 'Protocol.WebAudio.GraphObjectId'>;
    /**
     * Enum of BaseAudioContext types
     */
    const enum ContextType {
        Realtime = "realtime",
        Offline = "offline"
    }
    /**
     * Enum of AudioContextState from the spec
     */
    const enum ContextState {
        Suspended = "suspended",
        Running = "running",
        Closed = "closed",
        Interrupted = "interrupted"
    }
    /**
     * Enum of AudioNode types
     */
    type NodeType = string;
    /**
     * Enum of AudioNode::ChannelCountMode from the spec
     */
    const enum ChannelCountMode {
        ClampedMax = "clamped-max",
        Explicit = "explicit",
        Max = "max"
    }
    /**
     * Enum of AudioNode::ChannelInterpretation from the spec
     */
    const enum ChannelInterpretation {
        Discrete = "discrete",
        Speakers = "speakers"
    }
    /**
     * Enum of AudioParam types
     */
    type ParamType = string;
    /**
     * Enum of AudioParam::AutomationRate from the spec
     */
    const enum AutomationRate {
        ARate = "a-rate",
        KRate = "k-rate"
    }
    /**
     * Fields in AudioContext that change in real-time.
     */
    interface ContextRealtimeData {
        /**
         * The current context time in second in BaseAudioContext.
         */
        currentTime: number;
        /**
         * The time spent on rendering graph divided by render quantum duration,
         * and multiplied by 100. 100 means the audio renderer reached the full
         * capacity and glitch may occur.
         */
        renderCapacity: number;
        /**
         * A running mean of callback interval.
         */
        callbackIntervalMean: number;
        /**
         * A running variance of callback interval.
         */
        callbackIntervalVariance: number;
    }
    /**
     * Protocol object for BaseAudioContext
     */
    interface BaseAudioContext {
        contextId: GraphObjectId;
        contextType: ContextType;
        contextState: ContextState;
        realtimeData?: ContextRealtimeData;
        /**
         * Platform-dependent callback buffer size.
         */
        callbackBufferSize: number;
        /**
         * Number of output channels supported by audio hardware in use.
         */
        maxOutputChannelCount: number;
        /**
         * Context sample rate.
         */
        sampleRate: number;
        renderQuantumSize: number;
    }
    /**
     * Protocol object for AudioListener
     */
    interface AudioListener {
        listenerId: GraphObjectId;
        contextId: GraphObjectId;
    }
    /**
     * Protocol object for AudioNode
     */
    interface AudioNode {
        nodeId: GraphObjectId;
        contextId: GraphObjectId;
        nodeType: NodeType;
        numberOfInputs: number;
        numberOfOutputs: number;
        channelCount: number;
        channelCountMode: ChannelCountMode;
        channelInterpretation: ChannelInterpretation;
    }
    /**
     * Protocol object for AudioParam
     */
    interface AudioParam {
        paramId: GraphObjectId;
        nodeId: GraphObjectId;
        contextId: GraphObjectId;
        paramType: ParamType;
        rate: AutomationRate;
        defaultValue: number;
        minValue: number;
        maxValue: number;
    }
    interface GetRealtimeDataRequest {
        contextId: GraphObjectId;
    }
    interface GetRealtimeDataResponse extends ProtocolResponseWithError {
        realtimeData: ContextRealtimeData;
    }
    /**
     * Notifies that a new BaseAudioContext has been created.
     */
    interface ContextCreatedEvent {
        context: BaseAudioContext;
    }
    /**
     * Notifies that an existing BaseAudioContext will be destroyed.
     */
    interface ContextWillBeDestroyedEvent {
        contextId: GraphObjectId;
    }
    /**
     * Notifies that existing BaseAudioContext has changed some properties (id stays the same)..
     */
    interface ContextChangedEvent {
        context: BaseAudioContext;
    }
    /**
     * Notifies that the construction of an AudioListener has finished.
     */
    interface AudioListenerCreatedEvent {
        listener: AudioListener;
    }
    /**
     * Notifies that a new AudioListener has been created.
     */
    interface AudioListenerWillBeDestroyedEvent {
        contextId: GraphObjectId;
        listenerId: GraphObjectId;
    }
    /**
     * Notifies that a new AudioNode has been created.
     */
    interface AudioNodeCreatedEvent {
        node: AudioNode;
    }
    /**
     * Notifies that an existing AudioNode has been destroyed.
     */
    interface AudioNodeWillBeDestroyedEvent {
        contextId: GraphObjectId;
        nodeId: GraphObjectId;
    }
    /**
     * Notifies that a new AudioParam has been created.
     */
    interface AudioParamCreatedEvent {
        param: AudioParam;
    }
    /**
     * Notifies that an existing AudioParam has been destroyed.
     */
    interface AudioParamWillBeDestroyedEvent {
        contextId: GraphObjectId;
        nodeId: GraphObjectId;
        paramId: GraphObjectId;
    }
    /**
     * Notifies that two AudioNodes are connected.
     */
    interface NodesConnectedEvent {
        contextId: GraphObjectId;
        sourceId: GraphObjectId;
        destinationId: GraphObjectId;
        sourceOutputIndex?: number;
        destinationInputIndex?: number;
    }
    /**
     * Notifies that AudioNodes are disconnected. The destination can be null, and it means all the outgoing connections from the source are disconnected.
     */
    interface NodesDisconnectedEvent {
        contextId: GraphObjectId;
        sourceId: GraphObjectId;
        destinationId: GraphObjectId;
        sourceOutputIndex?: number;
        destinationInputIndex?: number;
    }
    /**
     * Notifies that an AudioNode is connected to an AudioParam.
     */
    interface NodeParamConnectedEvent {
        contextId: GraphObjectId;
        sourceId: GraphObjectId;
        destinationId: GraphObjectId;
        sourceOutputIndex?: number;
    }
    /**
     * Notifies that an AudioNode is disconnected to an AudioParam.
     */
    interface NodeParamDisconnectedEvent {
        contextId: GraphObjectId;
        sourceId: GraphObjectId;
        destinationId: GraphObjectId;
        sourceOutputIndex?: number;
    }
}
/**
 * This domain allows configuring virtual authenticators to test the WebAuthn
 * API.
 */
export declare namespace WebAuthn {
    type AuthenticatorId = OpaqueIdentifier<string, 'Protocol.WebAuthn.AuthenticatorId'>;
    const enum AuthenticatorProtocol {
        U2f = "u2f",
        Ctap2 = "ctap2"
    }
    const enum Ctap2Version {
        Ctap2_0 = "ctap2_0",
        Ctap2_1 = "ctap2_1",
        Ctap2_2 = "ctap2_2"
    }
    /**
     * LINT_SKIP.IfChange(AuthenticatorTransport)
     */
    const enum AuthenticatorTransport {
        Usb = "usb",
        Nfc = "nfc",
        Ble = "ble",
        Cable = "cable",
        Hybrid = "hybrid",
        SmartCard = "smart-card",
        Internal = "internal"
    }
    interface VirtualAuthenticatorOptions {
        protocol: AuthenticatorProtocol;
        /**
         * Defaults to ctap2_0. Ignored if |protocol| == u2f.
         */
        ctap2Version?: Ctap2Version;
        transport: AuthenticatorTransport;
        /**
         * Defaults to false.
         */
        hasResidentKey?: boolean;
        /**
         * Defaults to false.
         */
        hasUserVerification?: boolean;
        /**
         * If set to true, the authenticator will support the largeBlob extension.
         * https://w3c.github.io/webauthn#largeBlob
         * Defaults to false.
         */
        hasLargeBlob?: boolean;
        /**
         * If set to true, the authenticator will support the credBlob extension.
         * https://fidoalliance.org/specs/fido-v2.1-rd-20201208/fido-client-to-authenticator-protocol-v2.1-rd-20201208.html#sctn-credBlob-extension
         * Defaults to false.
         */
        hasCredBlob?: boolean;
        /**
         * If set to true, the authenticator will support the minPinLength extension.
         * https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-20210615.html#sctn-minpinlength-extension
         * Defaults to false.
         */
        hasMinPinLength?: boolean;
        /**
         * If set to true, the authenticator will support the prf extension.
         * https://w3c.github.io/webauthn/#prf-extension
         * Defaults to false.
         */
        hasPrf?: boolean;
        /**
         * If set to true, the authenticator will support the hmac-secret extension.
         * https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-20210615.html#sctn-hmac-secret-extension
         * Defaults to false.
         */
        hasHmacSecret?: boolean;
        /**
         * If set to true, the authenticator will support the hmac-secret-mc extension.
         * https://fidoalliance.org/specs/fido-v2.2-rd-20241003/fido-client-to-authenticator-protocol-v2.2-rd-20241003.html#sctn-hmac-secret-make-cred-extension
         * Defaults to false.
         */
        hasHmacSecretMc?: boolean;
        /**
         * If set to true, the authenticator will support the cmtgKey (Credential
         * Manager Trust Group Key) extension.
         * https://github.com/w3c/webauthn/pull/2377
         * Defaults to false.
         */
        hasCmtgKey?: boolean;
        /**
         * If set to true, tests of user presence will succeed immediately.
         * Otherwise, they will not be resolved. Defaults to true.
         */
        automaticPresenceSimulation?: boolean;
        /**
         * Sets whether User Verification succeeds or fails for an authenticator.
         * Defaults to false.
         */
        isUserVerified?: boolean;
        /**
         * Credentials created by this authenticator will have the backup
         * eligibility (BE) flag set to this value. Defaults to false.
         * https://w3c.github.io/webauthn/#sctn-credential-backup
         */
        defaultBackupEligibility?: boolean;
        /**
         * Credentials created by this authenticator will have the backup state
         * (BS) flag set to this value. Defaults to false.
         * https://w3c.github.io/webauthn/#sctn-credential-backup
         */
        defaultBackupState?: boolean;
    }
    interface Credential {
        credentialId: binary;
        isResidentCredential: boolean;
        /**
         * Relying Party ID the credential is scoped to. Must be set when adding a
         * credential.
         */
        rpId?: string;
        /**
         * The ECDSA P-256 private key in PKCS#8 format.
         */
        privateKey: binary;
        /**
         * An opaque byte sequence with a maximum size of 64 bytes mapping the
         * credential to a specific user.
         */
        userHandle?: binary;
        /**
         * Signature counter. Must be equal to or greater than -1.
         * If -1, the credential won't have an associated signature counter, and
         * every assertion operation will report a value of 0.
         * See https://w3c.github.io/webauthn/#signature-counter
         */
        signCount: number;
        /**
         * The large blob associated with the credential.
         * See https://w3c.github.io/webauthn/#sctn-large-blob-extension
         */
        largeBlob?: binary;
        /**
         * Assertions returned by this credential will have the backup eligibility
         * (BE) flag set to this value. Defaults to the authenticator's
         * defaultBackupEligibility value.
         */
        backupEligibility?: boolean;
        /**
         * Assertions returned by this credential will have the backup state (BS)
         * flag set to this value. Defaults to the authenticator's
         * defaultBackupState value.
         */
        backupState?: boolean;
        /**
         * The credential's user.name property. Equivalent to empty if not set.
         * https://w3c.github.io/webauthn/#dom-publickeycredentialentity-name
         */
        userName?: string;
        /**
         * The credential's user.displayName property. Equivalent to empty if
         * not set.
         * https://w3c.github.io/webauthn/#dom-publickeycredentialuserentity-displayname
         */
        userDisplayName?: string;
        /**
         * The CMTG keys associated with the credential.
         */
        cmtgKeys?: binary[];
        /**
         * The 0-based index of the active key in cmtgKeys.
         */
        activeCmtgKeyIndex?: integer;
        /**
         * If true, the authenticator will generate a new CMTG key on the next operation.
         */
        generateCmtgKeyOnNextOperation?: boolean;
    }
    interface EnableRequest {
        /**
         * Whether to enable the WebAuthn user interface. Enabling the UI is
         * recommended for debugging and demo purposes, as it is closer to the real
         * experience. Disabling the UI is recommended for automated testing.
         * Supported at the embedder's discretion if UI is available.
         * Defaults to false.
         */
        enableUI?: boolean;
    }
    interface AddVirtualAuthenticatorRequest {
        options: VirtualAuthenticatorOptions;
    }
    interface AddVirtualAuthenticatorResponse extends ProtocolResponseWithError {
        authenticatorId: AuthenticatorId;
    }
    interface SetResponseOverrideBitsRequest {
        authenticatorId: AuthenticatorId;
        /**
         * If isBogusSignature is set, overrides the signature in the authenticator response to be zero.
         * Defaults to false.
         */
        isBogusSignature?: boolean;
        /**
         * If isBadUV is set, overrides the UV bit in the flags in the authenticator response to
         * be zero. Defaults to false.
         */
        isBadUV?: boolean;
        /**
         * If isBadUP is set, overrides the UP bit in the flags in the authenticator response to
         * be zero. Defaults to false.
         */
        isBadUP?: boolean;
    }
    interface RemoveVirtualAuthenticatorRequest {
        authenticatorId: AuthenticatorId;
    }
    interface AddCredentialRequest {
        authenticatorId: AuthenticatorId;
        credential: Credential;
    }
    interface GetCredentialRequest {
        authenticatorId: AuthenticatorId;
        credentialId: binary;
    }
    interface GetCredentialResponse extends ProtocolResponseWithError {
        credential: Credential;
    }
    interface GetCredentialsRequest {
        authenticatorId: AuthenticatorId;
    }
    interface GetCredentialsResponse extends ProtocolResponseWithError {
        credentials: Credential[];
    }
    interface RemoveCredentialRequest {
        authenticatorId: AuthenticatorId;
        credentialId: binary;
    }
    interface ClearCredentialsRequest {
        authenticatorId: AuthenticatorId;
    }
    interface SetUserVerifiedRequest {
        authenticatorId: AuthenticatorId;
        isUserVerified: boolean;
    }
    interface SetAutomaticPresenceSimulationRequest {
        authenticatorId: AuthenticatorId;
        enabled: boolean;
    }
    interface SetCredentialPropertiesRequest {
        authenticatorId: AuthenticatorId;
        credentialId: binary;
        backupEligibility?: boolean;
        backupState?: boolean;
        activeCmtgKeyIndex?: integer;
        generateCmtgKeyOnNextOperation?: boolean;
        /**
         * Must be equal to or greater than -1.
         * If -1, the signature counter is removed from the credential, and every
         * assertion operation will report a value of 0.
         * See https://w3c.github.io/webauthn/#signature-counter
         */
        signCount?: number;
    }
    /**
     * Triggered when a credential is added to an authenticator.
     */
    interface CredentialAddedEvent {
        authenticatorId: AuthenticatorId;
        credential: Credential;
    }
    /**
     * Triggered when a credential is deleted, e.g. through
     * PublicKeyCredential.signalUnknownCredential().
     */
    interface CredentialDeletedEvent {
        authenticatorId: AuthenticatorId;
        credentialId: binary;
    }
    /**
     * Triggered when a credential is updated, e.g. through
     * PublicKeyCredential.signalCurrentUserDetails().
     */
    interface CredentialUpdatedEvent {
        authenticatorId: AuthenticatorId;
        credential: Credential;
    }
    /**
     * Triggered when a credential is used in a webauthn assertion.
     */
    interface CredentialAssertedEvent {
        authenticatorId: AuthenticatorId;
        credential: Credential;
    }
}
export declare namespace WebMCP {
    /**
     * Tool annotations
     */
    interface Annotation {
        /**
         * A hint indicating that the tool does not modify any state.
         */
        readOnly?: boolean;
        /**
         * A hint indicating that the tool output may contain untrusted content, ex: UGC, 3rd party data.
         */
        untrustedContent?: boolean;
        /**
         * A hint indicating that executing the tool will result in consequential actions, ex: booking a flight, transferring money.
         */
        consequential?: boolean;
        /**
         * If true, indicates that the tool is intended for debugging and developer tooling rather than end-user interactions.
         */
        debugging?: boolean;
        /**
         * If the declarative tool was declared with the autosubmit attribute.
         */
        autosubmit?: boolean;
    }
    /**
     * Represents the status of a tool invocation.
     */
    const enum InvocationStatus {
        Completed = "Completed",
        Canceled = "Canceled",
        Error = "Error"
    }
    /**
     * Definition of a tool that can be invoked.
     */
    interface Tool {
        /**
         * Tool name.
         */
        name: string;
        /**
         * Tool description.
         */
        description: string;
        /**
         * Schema for the tool's input parameters.
         */
        inputSchema?: any;
        /**
         * Optional annotations for the tool.
         */
        annotations?: Annotation;
        /**
         * Frame identifier associated with the tool registration.
         */
        frameId: Page.FrameId;
        /**
         * Optional node ID for declarative tools.
         */
        backendNodeId?: DOM.BackendNodeId;
        /**
         * The stack trace at the time of the registration.
         */
        stackTrace?: Runtime.StackTrace;
    }
    /**
     * Definition of a tool that was removed.
     */
    interface RemovedTool {
        /**
         * Tool name.
         */
        name: string;
        /**
         * Frame identifier associated with the tool registration.
         */
        frameId: Page.FrameId;
    }
    interface InvokeToolRequest {
        /**
         * Frame in which to invoke the tool.
         */
        frameId: Page.FrameId;
        /**
         * Name of the tool to invoke.
         */
        toolName: string;
        /**
         * Input parameters for the tool, matching the tool's inputSchema.
         */
        input: any;
    }
    interface InvokeToolResponse extends ProtocolResponseWithError {
        /**
         * Unique identifier for this invocation. Response is sent before tool events.
         */
        invocationId: string;
    }
    interface CancelInvocationRequest {
        /**
         * Invocation identifier to cancel.
         */
        invocationId: string;
    }
    /**
     * Event fired when new tools are added.
     */
    interface ToolsAddedEvent {
        /**
         * Array of tools that were added.
         */
        tools: Tool[];
    }
    /**
     * Event fired when tools are removed.
     */
    interface ToolsRemovedEvent {
        /**
         * Array of tools that were removed.
         */
        tools: RemovedTool[];
    }
    /**
     * Event fired when a tool invocation starts.
     */
    interface ToolInvokedEvent {
        /**
         * Name of the tool to invoke.
         */
        toolName: string;
        /**
         * Frame id
         */
        frameId: Page.FrameId;
        /**
         * Invocation identifier.
         */
        invocationId: string;
        /**
         * The input parameters used for the invocation.
         */
        input: string;
    }
    /**
     * Event fired when a tool invocation completes or fails.
     */
    interface ToolRespondedEvent {
        /**
         * Invocation identifier.
         */
        invocationId: string;
        /**
         * Status of the invocation.
         */
        status: InvocationStatus;
        /**
         * Output or error delivered as delivered to the agent. Missing if `status` is anything other than Completed.
         * Note: The output is untrusted and poses a prompt injection risk. Clients should treat this as potentially malicious user input.
         */
        output?: any;
        /**
         * Error text for protocol users.
         */
        errorText?: string;
        /**
         * The exception object, if the javascript tool threw an error>
         */
        exception?: Runtime.RemoteObject;
    }
}
/**
 * Debugger domain exposes JavaScript debugging capabilities. It allows setting and removing
 * breakpoints, stepping through execution, exploring stack traces, etc.
 */
export declare namespace Debugger {
    /**
     * Breakpoint identifier.
     */
    type BreakpointId = OpaqueIdentifier<string, 'Protocol.Debugger.BreakpointId'>;
    /**
     * Call frame identifier.
     */
    type CallFrameId = OpaqueIdentifier<string, 'Protocol.Debugger.CallFrameId'>;
    /**
     * Location in the source code.
     */
    interface Location {
        /**
         * Script identifier as reported in the `Debugger.scriptParsed`.
         */
        scriptId: Runtime.ScriptId;
        /**
         * Line number in the script (0-based).
         */
        lineNumber: integer;
        /**
         * Column number in the script (0-based).
         */
        columnNumber?: integer;
    }
    /**
     * Location in the source code.
     */
    interface ScriptPosition {
        lineNumber: integer;
        columnNumber: integer;
    }
    /**
     * Location range within one script.
     */
    interface LocationRange {
        scriptId: Runtime.ScriptId;
        start: ScriptPosition;
        end: ScriptPosition;
    }
    /**
     * JavaScript call frame. Array of call frames form the call stack.
     */
    interface CallFrame {
        /**
         * Call frame identifier. This identifier is only valid while the virtual machine is paused.
         */
        callFrameId: CallFrameId;
        /**
         * Name of the JavaScript function called on this call frame.
         */
        functionName: string;
        /**
         * Location in the source code.
         */
        functionLocation?: Location;
        /**
         * Location in the source code.
         */
        location: Location;
        /**
         * JavaScript script name or url.
         * Deprecated in favor of using the `location.scriptId` to resolve the URL via a previously
         * sent `Debugger.scriptParsed` event.
         * @deprecated
         */
        url: string;
        /**
         * Scope chain for this call frame.
         */
        scopeChain: Scope[];
        /**
         * `this` object for this call frame.
         */
        this: Runtime.RemoteObject;
        /**
         * The value being returned, if the function is at return point.
         */
        returnValue?: Runtime.RemoteObject;
        /**
         * Valid only while the VM is paused and indicates whether this frame
         * can be restarted or not. Note that a `true` value here does not
         * guarantee that Debugger#restartFrame with this CallFrameId will be
         * successful, but it is very likely.
         */
        canBeRestarted?: boolean;
    }
    const enum ScopeType {
        Global = "global",
        Local = "local",
        With = "with",
        Closure = "closure",
        Catch = "catch",
        Block = "block",
        Script = "script",
        Eval = "eval",
        Module = "module",
        WasmExpressionStack = "wasm-expression-stack"
    }
    const enum ScopeEmptyReason {
        NoVariables = "no-variables",
        AllUnavailable = "all-unavailable"
    }
    /**
     * Scope description.
     */
    interface Scope {
        /**
         * Scope type.
         */
        type: ScopeType;
        /**
         * Object representing the scope. For `global` and `with` scopes it represents the actual
         * object; for the rest of the scopes, it is artificial transient object enumerating scope
         * variables as its properties.
         */
        object: Runtime.RemoteObject;
        name?: string;
        /**
         * Location in the source code where scope starts
         */
        startLocation?: Location;
        /**
         * Location in the source code where scope ends
         */
        endLocation?: Location;
        /**
         * Present if the scope has no variable values to show. Absent means that
         * the scope declares at least one variable with an available value.
         * Empty scopes are retained in the scope chain because
         * they can be targeted via `evaluateOnCallFrame` (using `scopeNumber`) or
         * matched against scopes in source maps.
         */
        emptyReason?: ScopeEmptyReason;
    }
    /**
     * Search match for resource.
     */
    interface SearchMatch {
        /**
         * Line number in resource content.
         */
        lineNumber: number;
        /**
         * Line with match content.
         */
        lineContent: string;
    }
    const enum BreakLocationType {
        DebuggerStatement = "debuggerStatement",
        Call = "call",
        Return = "return"
    }
    interface BreakLocation {
        /**
         * Script identifier as reported in the `Debugger.scriptParsed`.
         */
        scriptId: Runtime.ScriptId;
        /**
         * Line number in the script (0-based).
         */
        lineNumber: integer;
        /**
         * Column number in the script (0-based).
         */
        columnNumber?: integer;
        type?: BreakLocationType;
    }
    interface WasmDisassemblyChunk {
        /**
         * The next chunk of disassembled lines.
         */
        lines: string[];
        /**
         * The bytecode offsets describing the start of each line.
         */
        bytecodeOffsets: integer[];
    }
    /**
     * Enum of possible script languages.
     */
    const enum ScriptLanguage {
        JavaScript = "JavaScript",
        WebAssembly = "WebAssembly"
    }
    const enum DebugSymbolsType {
        SourceMap = "SourceMap",
        EmbeddedDWARF = "EmbeddedDWARF",
        ExternalDWARF = "ExternalDWARF"
    }
    /**
     * Debug symbols available for a wasm script.
     */
    interface DebugSymbols {
        /**
         * Type of the debug symbols.
         */
        type: DebugSymbolsType;
        /**
         * URL of the external symbol source.
         */
        externalURL?: string;
    }
    interface ResolvedBreakpoint {
        /**
         * Breakpoint unique identifier.
         */
        breakpointId: BreakpointId;
        /**
         * Actual breakpoint location.
         */
        location: Location;
    }
    const enum ContinueToLocationRequestTargetCallFrames {
        Any = "any",
        Current = "current"
    }
    interface ContinueToLocationRequest {
        /**
         * Location to continue to.
         */
        location: Location;
        targetCallFrames?: ContinueToLocationRequestTargetCallFrames;
    }
    interface EnableRequest {
        /**
         * The maximum size in bytes of collected scripts (not referenced by other heap objects)
         * the debugger can hold. Puts no limit if parameter is omitted.
         */
        maxScriptsCacheSize?: number;
    }
    interface EnableResponse extends ProtocolResponseWithError {
        /**
         * Unique identifier of the debugger.
         */
        debuggerId: Runtime.UniqueDebuggerId;
    }
    interface EvaluateOnCallFrameRequest {
        /**
         * Call frame identifier to evaluate on.
         */
        callFrameId: CallFrameId;
        /**
         * Expression to evaluate.
         */
        expression: string;
        /**
         * String object group name to put result into (allows rapid releasing resulting object handles
         * using `releaseObjectGroup`).
         */
        objectGroup?: string;
        /**
         * Specifies whether command line API should be available to the evaluated expression, defaults
         * to false.
         */
        includeCommandLineAPI?: boolean;
        /**
         * In silent mode exceptions thrown during evaluation are not reported and do not pause
         * execution. Overrides `setPauseOnException` state.
         */
        silent?: boolean;
        /**
         * Whether the result is expected to be a JSON object that should be sent by value.
         */
        returnByValue?: boolean;
        /**
         * Whether preview should be generated for the result.
         */
        generatePreview?: boolean;
        /**
         * Whether to throw an exception if side effect cannot be ruled out during evaluation.
         */
        throwOnSideEffect?: boolean;
        /**
         * Terminate execution after timing out (number of milliseconds).
         */
        timeout?: Runtime.TimeDelta;
        /**
         * Specifies the scope number to evaluate the expression in (default: 0, innermost scope).
         */
        scopeNumber?: integer;
    }
    interface EvaluateOnCallFrameResponse extends ProtocolResponseWithError {
        /**
         * Object wrapper for the evaluation result.
         */
        result: Runtime.RemoteObject;
        /**
         * Exception details.
         */
        exceptionDetails?: Runtime.ExceptionDetails;
    }
    interface GetPossibleBreakpointsRequest {
        /**
         * Start of range to search possible breakpoint locations in.
         */
        start: Location;
        /**
         * End of range to search possible breakpoint locations in (excluding). When not specified, end
         * of scripts is used as end of range.
         */
        end?: Location;
        /**
         * Only consider locations which are in the same (non-nested) function as start.
         */
        restrictToFunction?: boolean;
    }
    interface GetPossibleBreakpointsResponse extends ProtocolResponseWithError {
        /**
         * List of the possible breakpoint locations.
         */
        locations: BreakLocation[];
    }
    interface GetScriptSourceRequest {
        /**
         * Id of the script to get source for.
         */
        scriptId: Runtime.ScriptId;
    }
    interface GetScriptSourceResponse extends ProtocolResponseWithError {
        /**
         * Script source (empty in case of Wasm bytecode).
         */
        scriptSource: string;
        /**
         * Wasm bytecode.
         */
        bytecode?: binary;
    }
    interface DisassembleWasmModuleRequest {
        /**
         * Id of the script to disassemble
         */
        scriptId: Runtime.ScriptId;
    }
    interface DisassembleWasmModuleResponse extends ProtocolResponseWithError {
        /**
         * For large modules, return a stream from which additional chunks of
         * disassembly can be read successively.
         */
        streamId?: string;
        /**
         * The total number of lines in the disassembly text.
         */
        totalNumberOfLines: integer;
        /**
         * The offsets of all function bodies, in the format [start1, end1,
         * start2, end2, ...] where all ends are exclusive.
         */
        functionBodyOffsets: integer[];
        /**
         * The first chunk of disassembly.
         */
        chunk: WasmDisassemblyChunk;
    }
    interface NextWasmDisassemblyChunkRequest {
        streamId: string;
    }
    interface NextWasmDisassemblyChunkResponse extends ProtocolResponseWithError {
        /**
         * The next chunk of disassembly.
         */
        chunk: WasmDisassemblyChunk;
    }
    interface GetWasmBytecodeRequest {
        /**
         * Id of the Wasm script to get source for.
         */
        scriptId: Runtime.ScriptId;
    }
    interface GetWasmBytecodeResponse extends ProtocolResponseWithError {
        /**
         * Script source.
         */
        bytecode: binary;
    }
    interface GetStackTraceRequest {
        stackTraceId: Runtime.StackTraceId;
    }
    interface GetStackTraceResponse extends ProtocolResponseWithError {
        stackTrace: Runtime.StackTrace;
    }
    interface PauseOnAsyncCallRequest {
        /**
         * Debugger will pause when async call with given stack trace is started.
         */
        parentStackTraceId: Runtime.StackTraceId;
    }
    interface RemoveBreakpointRequest {
        breakpointId: BreakpointId;
    }
    const enum RestartFrameRequestMode {
        StepInto = "StepInto"
    }
    interface RestartFrameRequest {
        /**
         * Call frame identifier to evaluate on.
         */
        callFrameId: CallFrameId;
        /**
         * The `mode` parameter must be present and set to 'StepInto', otherwise
         * `restartFrame` will error out.
         */
        mode?: RestartFrameRequestMode;
    }
    interface RestartFrameResponse extends ProtocolResponseWithError {
        /**
         * New stack trace.
         * @deprecated
         */
        callFrames: CallFrame[];
        /**
         * Async stack trace, if any.
         * @deprecated
         */
        asyncStackTrace?: Runtime.StackTrace;
        /**
         * Async stack trace, if any.
         * @deprecated
         */
        asyncStackTraceId?: Runtime.StackTraceId;
    }
    interface ResumeRequest {
        /**
         * Set to true to terminate execution upon resuming execution. In contrast
         * to Runtime.terminateExecution, this will allows to execute further
         * JavaScript (i.e. via evaluation) until execution of the paused code
         * is actually resumed, at which point termination is triggered.
         * If execution is currently not paused, this parameter has no effect.
         */
        terminateOnResume?: boolean;
    }
    interface SearchInContentRequest {
        /**
         * Id of the script to search in.
         */
        scriptId: Runtime.ScriptId;
        /**
         * String to search for.
         */
        query: string;
        /**
         * If true, search is case sensitive.
         */
        caseSensitive?: boolean;
        /**
         * If true, treats string parameter as regex.
         */
        isRegex?: boolean;
    }
    interface SearchInContentResponse extends ProtocolResponseWithError {
        /**
         * List of search matches.
         */
        result: SearchMatch[];
    }
    interface SetAsyncCallStackDepthRequest {
        /**
         * Maximum depth of async call stacks. Setting to `0` will effectively disable collecting async
         * call stacks (default).
         */
        maxDepth: integer;
    }
    interface SetBlackboxExecutionContextsRequest {
        /**
         * Array of execution context unique ids for the debugger to ignore.
         */
        uniqueIds: string[];
    }
    interface SetBlackboxPatternsRequest {
        /**
         * Array of regexps that will be used to check script url for blackbox state.
         */
        patterns: string[];
        /**
         * If true, also ignore scripts with no source url.
         */
        skipAnonymous?: boolean;
    }
    interface SetBlackboxedRangesRequest {
        /**
         * Id of the script.
         */
        scriptId: Runtime.ScriptId;
        positions: ScriptPosition[];
    }
    interface SetBreakpointRequest {
        /**
         * Location to set breakpoint in.
         */
        location: Location;
        /**
         * Expression to use as a breakpoint condition. When specified, debugger will only stop on the
         * breakpoint if this expression evaluates to true.
         */
        condition?: string;
    }
    interface SetBreakpointResponse extends ProtocolResponseWithError {
        /**
         * Id of the created breakpoint for further reference.
         */
        breakpointId: BreakpointId;
        /**
         * Location this breakpoint resolved into.
         */
        actualLocation: Location;
    }
    const enum SetInstrumentationBreakpointRequestInstrumentation {
        BeforeScriptExecution = "beforeScriptExecution",
        BeforeScriptWithSourceMapExecution = "beforeScriptWithSourceMapExecution"
    }
    interface SetInstrumentationBreakpointRequest {
        /**
         * Instrumentation name.
         */
        instrumentation: SetInstrumentationBreakpointRequestInstrumentation;
    }
    interface SetInstrumentationBreakpointResponse extends ProtocolResponseWithError {
        /**
         * Id of the created breakpoint for further reference.
         */
        breakpointId: BreakpointId;
    }
    interface SetBreakpointByUrlRequest {
        /**
         * Line number to set breakpoint at.
         */
        lineNumber: integer;
        /**
         * URL of the resources to set breakpoint on.
         */
        url?: string;
        /**
         * Regex pattern for the URLs of the resources to set breakpoints on. Either `url` or
         * `urlRegex` must be specified.
         */
        urlRegex?: string;
        /**
         * Script hash of the resources to set breakpoint on.
         */
        scriptHash?: string;
        /**
         * Offset in the line to set breakpoint at.
         */
        columnNumber?: integer;
        /**
         * Expression to use as a breakpoint condition. When specified, debugger will only stop on the
         * breakpoint if this expression evaluates to true.
         */
        condition?: string;
    }
    interface SetBreakpointByUrlResponse extends ProtocolResponseWithError {
        /**
         * Id of the created breakpoint for further reference.
         */
        breakpointId: BreakpointId;
        /**
         * List of the locations this breakpoint resolved into upon addition.
         */
        locations: Location[];
    }
    interface SetBreakpointOnFunctionCallRequest {
        /**
         * Function object id.
         */
        objectId: Runtime.RemoteObjectId;
        /**
         * Expression to use as a breakpoint condition. When specified, debugger will
         * stop on the breakpoint if this expression evaluates to true.
         */
        condition?: string;
    }
    interface SetBreakpointOnFunctionCallResponse extends ProtocolResponseWithError {
        /**
         * Id of the created breakpoint for further reference.
         */
        breakpointId: BreakpointId;
    }
    interface SetBreakpointsActiveRequest {
        /**
         * New value for breakpoints active state.
         */
        active: boolean;
    }
    const enum SetPauseOnExceptionsRequestState {
        None = "none",
        Caught = "caught",
        Uncaught = "uncaught",
        All = "all"
    }
    interface SetPauseOnExceptionsRequest {
        /**
         * Pause on exceptions mode.
         */
        state: SetPauseOnExceptionsRequestState;
    }
    interface SetReturnValueRequest {
        /**
         * New return value.
         */
        newValue: Runtime.CallArgument;
    }
    const enum SetScriptSourceResponseStatus {
        Ok = "Ok",
        CompileError = "CompileError",
        BlockedByActiveGenerator = "BlockedByActiveGenerator",
        BlockedByActiveFunction = "BlockedByActiveFunction",
        BlockedByTopLevelEsModuleChange = "BlockedByTopLevelEsModuleChange"
    }
    interface SetScriptSourceRequest {
        /**
         * Id of the script to edit.
         */
        scriptId: Runtime.ScriptId;
        /**
         * New content of the script.
         */
        scriptSource: string;
        /**
         * If true the change will not actually be applied. Dry run may be used to get result
         * description without actually modifying the code.
         */
        dryRun?: boolean;
        /**
         * If true, then `scriptSource` is allowed to change the function on top of the stack
         * as long as the top-most stack frame is the only activation of that function.
         */
        allowTopFrameEditing?: boolean;
    }
    interface SetScriptSourceResponse extends ProtocolResponseWithError {
        /**
         * New stack trace in case editing has happened while VM was stopped.
         * @deprecated
         */
        callFrames?: CallFrame[];
        /**
         * Whether current call stack  was modified after applying the changes.
         * @deprecated
         */
        stackChanged?: boolean;
        /**
         * Async stack trace, if any.
         * @deprecated
         */
        asyncStackTrace?: Runtime.StackTrace;
        /**
         * Async stack trace, if any.
         * @deprecated
         */
        asyncStackTraceId?: Runtime.StackTraceId;
        /**
         * Whether the operation was successful or not. Only `Ok` denotes a
         * successful live edit while the other enum variants denote why
         * the live edit failed.
         */
        status: SetScriptSourceResponseStatus;
        /**
         * Exception details if any. Only present when `status` is `CompileError`.
         */
        exceptionDetails?: Runtime.ExceptionDetails;
    }
    interface SetSkipAllPausesRequest {
        /**
         * New value for skip pauses state.
         */
        skip: boolean;
    }
    interface SetVariableValueRequest {
        /**
         * 0-based number of scope as was listed in scope chain. Only 'local', 'closure' and 'catch'
         * scope types are allowed. Other scopes could be manipulated manually.
         */
        scopeNumber: integer;
        /**
         * Variable name.
         */
        variableName: string;
        /**
         * New variable value.
         */
        newValue: Runtime.CallArgument;
        /**
         * Id of callframe that holds variable.
         */
        callFrameId: CallFrameId;
    }
    interface StepIntoRequest {
        /**
         * Debugger will pause on the execution of the first async task which was scheduled
         * before next pause.
         */
        breakOnAsyncCall?: boolean;
        /**
         * The skipList specifies location ranges that should be skipped on step into.
         */
        skipList?: LocationRange[];
    }
    interface StepOverRequest {
        /**
         * The skipList specifies location ranges that should be skipped on step over.
         */
        skipList?: LocationRange[];
        /**
         * Functions whose source range lies within one of the enterRanges are
         * entered as if by stepInto, even when they are called (directly or
         * indirectly) from a call that is stepped over.
         */
        enterRanges?: LocationRange[];
    }
    /**
     * Fired when breakpoint is resolved to an actual script and location.
     * Deprecated in favor of `resolvedBreakpoints` in the `scriptParsed` event.
     * @deprecated
     */
    interface BreakpointResolvedEvent {
        /**
         * Breakpoint unique identifier.
         */
        breakpointId: BreakpointId;
        /**
         * Actual breakpoint location.
         */
        location: Location;
    }
    const enum PausedEventReason {
        Ambiguous = "ambiguous",
        Assert = "assert",
        CSPViolation = "CSPViolation",
        DebugCommand = "debugCommand",
        DOM = "DOM",
        EventListener = "EventListener",
        Exception = "exception",
        Instrumentation = "instrumentation",
        OOM = "OOM",
        Other = "other",
        PromiseRejection = "promiseRejection",
        XHR = "XHR",
        Step = "step"
    }
    /**
     * Fired when the virtual machine stopped on breakpoint or exception or any other stop criteria.
     */
    interface PausedEvent {
        /**
         * Call stack the virtual machine stopped on.
         */
        callFrames: CallFrame[];
        /**
         * Pause reason.
         */
        reason: PausedEventReason;
        /**
         * Object containing break-specific auxiliary properties.
         */
        data?: any;
        /**
         * Hit breakpoints IDs
         */
        hitBreakpoints?: string[];
        /**
         * Async stack trace, if any.
         */
        asyncStackTrace?: Runtime.StackTrace;
        /**
         * Async stack trace, if any.
         */
        asyncStackTraceId?: Runtime.StackTraceId;
        /**
         * Never present, will be removed.
         * @deprecated
         */
        asyncCallStackTraceId?: Runtime.StackTraceId;
    }
    /**
     * Fired when virtual machine fails to parse the script.
     */
    interface ScriptFailedToParseEvent {
        /**
         * Identifier of the script parsed.
         */
        scriptId: Runtime.ScriptId;
        /**
         * URL or name of the script parsed (if any).
         */
        url: string;
        /**
         * Line offset of the script within the resource with given URL (for script tags).
         */
        startLine: integer;
        /**
         * Column offset of the script within the resource with given URL.
         */
        startColumn: integer;
        /**
         * Last line of the script.
         */
        endLine: integer;
        /**
         * Length of the last line of the script.
         */
        endColumn: integer;
        /**
         * Specifies script creation context.
         */
        executionContextId: Runtime.ExecutionContextId;
        /**
         * Content hash of the script, SHA-256.
         */
        hash: string;
        /**
         * For Wasm modules, the content of the `build_id` custom section. For JavaScript the `debugId` magic comment.
         */
        buildId: string;
        /**
         * Embedder-specific auxiliary data likely matching {isDefault: boolean, type: 'default'|'isolated'|'worker', frameId: string}
         */
        executionContextAuxData?: any;
        /**
         * URL of source map associated with script (if any).
         */
        sourceMapURL?: string;
        /**
         * True, if this script has sourceURL.
         */
        hasSourceURL?: boolean;
        /**
         * True, if this script is ES6 module.
         */
        isModule?: boolean;
        /**
         * This script length.
         */
        length?: integer;
        /**
         * JavaScript top stack frame of where the script parsed event was triggered if available.
         */
        stackTrace?: Runtime.StackTrace;
        /**
         * If the scriptLanguage is WebAssembly, the code section offset in the module.
         */
        codeOffset?: integer;
        /**
         * The language of the script.
         */
        scriptLanguage?: Debugger.ScriptLanguage;
        /**
         * The name the embedder supplied for this script.
         */
        embedderName?: string;
    }
    /**
     * Fired when virtual machine parses script. This event is also fired for all known and uncollected
     * scripts upon enabling debugger.
     */
    interface ScriptParsedEvent {
        /**
         * Identifier of the script parsed.
         */
        scriptId: Runtime.ScriptId;
        /**
         * URL or name of the script parsed (if any).
         */
        url: string;
        /**
         * Line offset of the script within the resource with given URL (for script tags).
         */
        startLine: integer;
        /**
         * Column offset of the script within the resource with given URL.
         */
        startColumn: integer;
        /**
         * Last line of the script.
         */
        endLine: integer;
        /**
         * Length of the last line of the script.
         */
        endColumn: integer;
        /**
         * Specifies script creation context.
         */
        executionContextId: Runtime.ExecutionContextId;
        /**
         * Content hash of the script, SHA-256.
         */
        hash: string;
        /**
         * For Wasm modules, the content of the `build_id` custom section. For JavaScript the `debugId` magic comment.
         */
        buildId: string;
        /**
         * Embedder-specific auxiliary data likely matching {isDefault: boolean, type: 'default'|'isolated'|'worker', frameId: string}
         */
        executionContextAuxData?: any;
        /**
         * True, if this script is generated as a result of the live edit operation.
         */
        isLiveEdit?: boolean;
        /**
         * URL of source map associated with script (if any).
         */
        sourceMapURL?: string;
        /**
         * True, if this script has sourceURL.
         */
        hasSourceURL?: boolean;
        /**
         * True, if this script is ES6 module.
         */
        isModule?: boolean;
        /**
         * This script length.
         */
        length?: integer;
        /**
         * JavaScript top stack frame of where the script parsed event was triggered if available.
         */
        stackTrace?: Runtime.StackTrace;
        /**
         * If the scriptLanguage is WebAssembly, the code section offset in the module.
         */
        codeOffset?: integer;
        /**
         * The language of the script.
         */
        scriptLanguage?: Debugger.ScriptLanguage;
        /**
         * If the scriptLanguage is WebAssembly, the source of debug symbols for the module.
         */
        debugSymbols?: Debugger.DebugSymbols[];
        /**
         * The name the embedder supplied for this script.
         */
        embedderName?: string;
        /**
         * The list of set breakpoints in this script if calls to `setBreakpointByUrl`
         * matches this script's URL or hash. Clients that use this list can ignore the
         * `breakpointResolved` event. They are equivalent.
         */
        resolvedBreakpoints?: ResolvedBreakpoint[];
    }
}
export declare namespace HeapProfiler {
    /**
     * Heap snapshot object id.
     */
    type HeapSnapshotObjectId = OpaqueIdentifier<string, 'Protocol.HeapProfiler.HeapSnapshotObjectId'>;
    /**
     * Sampling Heap Profile node. Holds callsite information, allocation statistics and child nodes.
     */
    interface SamplingHeapProfileNode {
        /**
         * Function location.
         */
        callFrame: Runtime.CallFrame;
        /**
         * Allocations size in bytes for the node excluding children.
         */
        selfSize: number;
        /**
         * Node id. Ids are unique across all profiles collected between startSampling and stopSampling.
         */
        id: integer;
        /**
         * Child nodes.
         */
        children: SamplingHeapProfileNode[];
    }
    /**
     * A single sample from a sampling profile.
     */
    interface SamplingHeapProfileSample {
        /**
         * Allocation size in bytes attributed to the sample.
         */
        size: number;
        /**
         * Id of the corresponding profile tree node.
         */
        nodeId: integer;
        /**
         * Time-ordered sample ordinal number. It is unique across all profiles retrieved
         * between startSampling and stopSampling.
         */
        ordinal: number;
    }
    /**
     * Sampling profile.
     */
    interface SamplingHeapProfile {
        head: SamplingHeapProfileNode;
        samples: SamplingHeapProfileSample[];
    }
    interface AddInspectedHeapObjectRequest {
        /**
         * Heap snapshot object id to be accessible by means of $x command line API.
         */
        heapObjectId: HeapSnapshotObjectId;
    }
    interface GetHeapObjectIdRequest {
        /**
         * Identifier of the object to get heap object id for.
         */
        objectId: Runtime.RemoteObjectId;
    }
    interface GetHeapObjectIdResponse extends ProtocolResponseWithError {
        /**
         * Id of the heap snapshot object corresponding to the passed remote object id.
         */
        heapSnapshotObjectId: HeapSnapshotObjectId;
    }
    interface GetObjectByHeapObjectIdRequest {
        objectId: HeapSnapshotObjectId;
        /**
         * Symbolic group name that can be used to release multiple objects.
         */
        objectGroup?: string;
    }
    interface GetObjectByHeapObjectIdResponse extends ProtocolResponseWithError {
        /**
         * Evaluation result.
         */
        result: Runtime.RemoteObject;
    }
    interface GetSamplingProfileResponse extends ProtocolResponseWithError {
        /**
         * Return the sampling profile being collected.
         */
        profile: SamplingHeapProfile;
    }
    interface StartSamplingRequest {
        /**
         * Average sample interval in bytes. Poisson distribution is used for the intervals. The
         * default value is 32768 bytes.
         */
        samplingInterval?: number;
        /**
         * Maximum stack depth. The default value is 128.
         */
        stackDepth?: number;
        /**
         * By default, the sampling heap profiler reports only objects which are
         * still alive when the profile is returned via getSamplingProfile or
         * stopSampling, which is useful for determining what functions contribute
         * the most to steady-state memory usage. This flag instructs the sampling
         * heap profiler to also include information about objects discarded by
         * major GC, which will show which functions cause large temporary memory
         * usage or long GC pauses.
         */
        includeObjectsCollectedByMajorGC?: boolean;
        /**
         * By default, the sampling heap profiler reports only objects which are
         * still alive when the profile is returned via getSamplingProfile or
         * stopSampling, which is useful for determining what functions contribute
         * the most to steady-state memory usage. This flag instructs the sampling
         * heap profiler to also include information about objects discarded by
         * minor GC, which is useful when tuning a latency-sensitive application
         * for minimal GC activity.
         */
        includeObjectsCollectedByMinorGC?: boolean;
    }
    interface StartTrackingHeapObjectsRequest {
        trackAllocations?: boolean;
    }
    interface StopSamplingResponse extends ProtocolResponseWithError {
        /**
         * Recorded sampling heap profile.
         */
        profile: SamplingHeapProfile;
    }
    interface StopTrackingHeapObjectsRequest {
        /**
         * If true 'reportHeapSnapshotProgress' events will be generated while snapshot is being taken
         * when the tracking is stopped.
         */
        reportProgress?: boolean;
        /**
         * Deprecated in favor of `exposeInternals`.
         * @deprecated
         */
        treatGlobalObjectsAsRoots?: boolean;
        /**
         * If true, numerical values are included in the snapshot
         */
        captureNumericValue?: boolean;
        /**
         * If true, exposes internals of the snapshot.
         */
        exposeInternals?: boolean;
    }
    interface TakeHeapSnapshotRequest {
        /**
         * If true 'reportHeapSnapshotProgress' events will be generated while snapshot is being taken.
         */
        reportProgress?: boolean;
        /**
         * If true, a raw snapshot without artificial roots will be generated.
         * Deprecated in favor of `exposeInternals`.
         * @deprecated
         */
        treatGlobalObjectsAsRoots?: boolean;
        /**
         * If true, numerical values are included in the snapshot
         */
        captureNumericValue?: boolean;
        /**
         * If true, exposes internals of the snapshot.
         */
        exposeInternals?: boolean;
    }
    interface AddHeapSnapshotChunkEvent {
        chunk: string;
    }
    /**
     * If heap objects tracking has been started then backend may send update for one or more fragments
     */
    interface HeapStatsUpdateEvent {
        /**
         * An array of triplets. Each triplet describes a fragment. The first integer is the fragment
         * index, the second integer is a total count of objects for the fragment, the third integer is
         * a total size of the objects for the fragment.
         */
        statsUpdate: integer[];
    }
    /**
     * If heap objects tracking has been started then backend regularly sends a current value for last
     * seen object id and corresponding timestamp. If the were changes in the heap since last event
     * then one or more heapStatsUpdate events will be sent before a new lastSeenObjectId event.
     */
    interface LastSeenObjectIdEvent {
        lastSeenObjectId: integer;
        timestamp: number;
    }
    interface ReportHeapSnapshotProgressEvent {
        done: integer;
        total: integer;
        finished?: boolean;
    }
}
export declare namespace Profiler {
    /**
     * Profile node. Holds callsite information, execution statistics and child nodes.
     */
    interface ProfileNode {
        /**
         * Unique id of the node.
         */
        id: integer;
        /**
         * Function location.
         */
        callFrame: Runtime.CallFrame;
        /**
         * Number of samples where this node was on top of the call stack.
         */
        hitCount?: integer;
        /**
         * Child node ids.
         */
        children?: integer[];
        /**
         * The reason of being not optimized. The function may be deoptimized or marked as don't
         * optimize.
         */
        deoptReason?: string;
        /**
         * An array of source position ticks.
         */
        positionTicks?: PositionTickInfo[];
    }
    /**
     * Profile.
     */
    interface Profile {
        /**
         * The list of profile nodes. First item is the root node.
         */
        nodes: ProfileNode[];
        /**
         * Profiling start timestamp in microseconds.
         */
        startTime: number;
        /**
         * Profiling end timestamp in microseconds.
         */
        endTime: number;
        /**
         * Ids of samples top nodes.
         */
        samples?: integer[];
        /**
         * Time intervals between adjacent samples in microseconds. The first delta is relative to the
         * profile startTime.
         */
        timeDeltas?: integer[];
    }
    /**
     * Specifies a number of samples attributed to a certain source position.
     */
    interface PositionTickInfo {
        /**
         * Source line number (1-based).
         */
        line: integer;
        /**
         * Number of samples attributed to the source line.
         */
        ticks: integer;
    }
    /**
     * Coverage data for a source range.
     */
    interface CoverageRange {
        /**
         * JavaScript script source offset for the range start.
         */
        startOffset: integer;
        /**
         * JavaScript script source offset for the range end.
         */
        endOffset: integer;
        /**
         * Collected execution count of the source range.
         */
        count: integer;
    }
    /**
     * Coverage data for a JavaScript function.
     */
    interface FunctionCoverage {
        /**
         * JavaScript function name.
         */
        functionName: string;
        /**
         * Source ranges inside the function with coverage data.
         */
        ranges: CoverageRange[];
        /**
         * Whether coverage data for this function has block granularity.
         */
        isBlockCoverage: boolean;
    }
    /**
     * Coverage data for a JavaScript script.
     */
    interface ScriptCoverage {
        /**
         * JavaScript script id.
         */
        scriptId: Runtime.ScriptId;
        /**
         * JavaScript script name or url.
         */
        url: string;
        /**
         * Functions contained in the script that has coverage data.
         */
        functions: FunctionCoverage[];
    }
    interface GetBestEffortCoverageResponse extends ProtocolResponseWithError {
        /**
         * Coverage data for the current isolate.
         */
        result: ScriptCoverage[];
    }
    interface SetSamplingIntervalRequest {
        /**
         * New sampling interval in microseconds.
         */
        interval: integer;
    }
    interface StartPreciseCoverageRequest {
        /**
         * Collect accurate call counts beyond simple 'covered' or 'not covered'.
         */
        callCount?: boolean;
        /**
         * Collect block-based coverage.
         */
        detailed?: boolean;
        /**
         * Allow the backend to send updates on its own initiative
         */
        allowTriggeredUpdates?: boolean;
    }
    interface StartPreciseCoverageResponse extends ProtocolResponseWithError {
        /**
         * Monotonically increasing time (in seconds) when the coverage update was taken in the backend.
         */
        timestamp: number;
    }
    interface StopResponse extends ProtocolResponseWithError {
        /**
         * Recorded profile.
         */
        profile: Profile;
    }
    interface TakePreciseCoverageResponse extends ProtocolResponseWithError {
        /**
         * Coverage data for the current isolate.
         */
        result: ScriptCoverage[];
        /**
         * Monotonically increasing time (in seconds) when the coverage update was taken in the backend.
         */
        timestamp: number;
    }
    interface ConsoleProfileFinishedEvent {
        id: string;
        /**
         * Location of console.profileEnd().
         */
        location: Debugger.Location;
        profile: Profile;
        /**
         * Profile title passed as an argument to console.profile().
         */
        title?: string;
    }
    /**
     * Sent when new profile recording is started using console.profile() call.
     */
    interface ConsoleProfileStartedEvent {
        id: string;
        /**
         * Location of console.profile().
         */
        location: Debugger.Location;
        /**
         * Profile title passed as an argument to console.profile().
         */
        title?: string;
    }
    /**
     * Reports coverage delta since the last poll (either from an event like this, or from
     * `takePreciseCoverage` for the current isolate. May only be sent if precise code
     * coverage has been started. This event can be trigged by the embedder to, for example,
     * trigger collection of coverage data immediately at a certain point in time.
     */
    interface PreciseCoverageDeltaUpdateEvent {
        /**
         * Monotonically increasing time (in seconds) when the coverage update was taken in the backend.
         */
        timestamp: number;
        /**
         * Identifier for distinguishing coverage events.
         */
        occasion: string;
        /**
         * Coverage data for the current isolate.
         */
        result: ScriptCoverage[];
    }
}
/**
 * Runtime domain exposes JavaScript runtime by means of remote evaluation and mirror objects.
 * Evaluation results are returned as mirror object that expose object type, string representation
 * and unique identifier that can be used for further object reference. Original objects are
 * maintained in memory unless they are either explicitly released or are released along with the
 * other objects in their object group.
 */
export declare namespace Runtime {
    /**
     * Unique script identifier.
     */
    type ScriptId = OpaqueIdentifier<string, 'Protocol.Runtime.ScriptId'>;
    const enum SerializationOptionsSerialization {
        Deep = "deep",
        Json = "json",
        IdOnly = "idOnly"
    }
    /**
     * Represents options for serialization. Overrides `generatePreview` and `returnByValue`.
     */
    interface SerializationOptions {
        serialization: SerializationOptionsSerialization;
        /**
         * Deep serialization depth. Default is full depth. Respected only in `deep` serialization mode.
         */
        maxDepth?: integer;
        /**
         * Embedder-specific parameters. For example if connected to V8 in Chrome these control DOM
         * serialization via `maxNodeDepth: integer` and `includeShadowTree: "none" | "open" | "all"`.
         * Values can be only of type string or integer.
         */
        additionalParameters?: any;
    }
    const enum DeepSerializedValueType {
        Undefined = "undefined",
        Null = "null",
        String = "string",
        Number = "number",
        Boolean = "boolean",
        Bigint = "bigint",
        Regexp = "regexp",
        Date = "date",
        Symbol = "symbol",
        Array = "array",
        Object = "object",
        Function = "function",
        Map = "map",
        Set = "set",
        Weakmap = "weakmap",
        Weakset = "weakset",
        Error = "error",
        Proxy = "proxy",
        Promise = "promise",
        Typedarray = "typedarray",
        Arraybuffer = "arraybuffer",
        Node = "node",
        Window = "window",
        Generator = "generator"
    }
    /**
     * Represents deep serialized value.
     */
    interface DeepSerializedValue {
        type: DeepSerializedValueType;
        value?: any;
        objectId?: string;
        /**
         * Set if value reference met more then once during serialization. In such
         * case, value is provided only to one of the serialized values. Unique
         * per value in the scope of one CDP call.
         */
        weakLocalObjectReference?: integer;
    }
    /**
     * Unique object identifier.
     */
    type RemoteObjectId = OpaqueIdentifier<string, 'Protocol.Runtime.RemoteObjectId'>;
    /**
     * Primitive value which cannot be JSON-stringified. Includes values `-0`, `NaN`, `Infinity`,
     * `-Infinity`, and bigint literals.
     */
    type UnserializableValue = string;
    const enum RemoteObjectType {
        Object = "object",
        Function = "function",
        Undefined = "undefined",
        String = "string",
        Number = "number",
        Boolean = "boolean",
        Symbol = "symbol",
        Bigint = "bigint"
    }
    const enum RemoteObjectSubtype {
        Array = "array",
        Null = "null",
        Node = "node",
        Regexp = "regexp",
        Date = "date",
        Map = "map",
        Set = "set",
        Weakmap = "weakmap",
        Weakset = "weakset",
        Iterator = "iterator",
        Generator = "generator",
        Error = "error",
        Proxy = "proxy",
        Promise = "promise",
        Typedarray = "typedarray",
        Arraybuffer = "arraybuffer",
        Dataview = "dataview",
        Webassemblymemory = "webassemblymemory",
        Wasmvalue = "wasmvalue",
        Deferredmodule = "deferredmodule",
        Trustedtype = "trustedtype"
    }
    /**
     * Mirror object referencing original JavaScript object.
     */
    interface RemoteObject {
        /**
         * Object type.
         */
        type: RemoteObjectType;
        /**
         * Object subtype hint. Specified for `object` type values only.
         * NOTE: If you change anything here, make sure to also update
         * `subtype` in `ObjectPreview` and `PropertyPreview` below.
         */
        subtype?: RemoteObjectSubtype;
        /**
         * Object class (constructor) name. Specified for `object` type values only.
         */
        className?: string;
        /**
         * Remote object value in case of primitive values or JSON values (if it was requested).
         */
        value?: any;
        /**
         * Primitive value which can not be JSON-stringified does not have `value`, but gets this
         * property.
         */
        unserializableValue?: UnserializableValue;
        /**
         * String representation of the object.
         */
        description?: string;
        /**
         * Deep serialized value.
         */
        deepSerializedValue?: DeepSerializedValue;
        /**
         * Unique object identifier (for non-primitive values).
         */
        objectId?: RemoteObjectId;
        /**
         * Preview containing abbreviated property values. Specified for `object` type values only.
         */
        preview?: ObjectPreview;
        customPreview?: CustomPreview;
    }
    interface CustomPreview {
        /**
         * The JSON-stringified result of formatter.header(object, config) call.
         * It contains json ML array that represents RemoteObject.
         */
        header: string;
        /**
         * If formatter returns true as a result of formatter.hasBody call then bodyGetterId will
         * contain RemoteObjectId for the function that returns result of formatter.body(object, config) call.
         * The result value is json ML array.
         */
        bodyGetterId?: RemoteObjectId;
    }
    const enum ObjectPreviewType {
        Object = "object",
        Function = "function",
        Undefined = "undefined",
        String = "string",
        Number = "number",
        Boolean = "boolean",
        Symbol = "symbol",
        Bigint = "bigint"
    }
    const enum ObjectPreviewSubtype {
        Array = "array",
        Null = "null",
        Node = "node",
        Regexp = "regexp",
        Date = "date",
        Map = "map",
        Set = "set",
        Weakmap = "weakmap",
        Weakset = "weakset",
        Iterator = "iterator",
        Generator = "generator",
        Error = "error",
        Proxy = "proxy",
        Promise = "promise",
        Typedarray = "typedarray",
        Arraybuffer = "arraybuffer",
        Dataview = "dataview",
        Webassemblymemory = "webassemblymemory",
        Wasmvalue = "wasmvalue",
        Deferredmodule = "deferredmodule",
        Trustedtype = "trustedtype"
    }
    /**
     * Object containing abbreviated remote object value.
     */
    interface ObjectPreview {
        /**
         * Object type.
         */
        type: ObjectPreviewType;
        /**
         * Object subtype hint. Specified for `object` type values only.
         */
        subtype?: ObjectPreviewSubtype;
        /**
         * String representation of the object.
         */
        description?: string;
        /**
         * True iff some of the properties or entries of the original object did not fit.
         */
        overflow: boolean;
        /**
         * List of the properties.
         */
        properties: PropertyPreview[];
        /**
         * List of the entries. Specified for `map` and `set` subtype values only.
         */
        entries?: EntryPreview[];
    }
    const enum PropertyPreviewType {
        Object = "object",
        Function = "function",
        Undefined = "undefined",
        String = "string",
        Number = "number",
        Boolean = "boolean",
        Symbol = "symbol",
        Accessor = "accessor",
        Bigint = "bigint"
    }
    const enum PropertyPreviewSubtype {
        Array = "array",
        Null = "null",
        Node = "node",
        Regexp = "regexp",
        Date = "date",
        Map = "map",
        Set = "set",
        Weakmap = "weakmap",
        Weakset = "weakset",
        Iterator = "iterator",
        Generator = "generator",
        Error = "error",
        Proxy = "proxy",
        Promise = "promise",
        Typedarray = "typedarray",
        Arraybuffer = "arraybuffer",
        Dataview = "dataview",
        Webassemblymemory = "webassemblymemory",
        Wasmvalue = "wasmvalue",
        Deferredmodule = "deferredmodule",
        Trustedtype = "trustedtype"
    }
    interface PropertyPreview {
        /**
         * Property name.
         */
        name: string;
        /**
         * Object type. Accessor means that the property itself is an accessor property.
         */
        type: PropertyPreviewType;
        /**
         * User-friendly property value string.
         */
        value?: string;
        /**
         * Nested value preview.
         */
        valuePreview?: ObjectPreview;
        /**
         * Object subtype hint. Specified for `object` type values only.
         */
        subtype?: PropertyPreviewSubtype;
    }
    interface EntryPreview {
        /**
         * Preview of the key. Specified for map-like collection entries.
         */
        key?: ObjectPreview;
        /**
         * Preview of the value.
         */
        value: ObjectPreview;
    }
    /**
     * Object property descriptor.
     */
    interface PropertyDescriptor {
        /**
         * Property name or symbol description.
         */
        name: string;
        /**
         * The value associated with the property.
         */
        value?: RemoteObject;
        /**
         * True if the value associated with the property may be changed (data descriptors only).
         */
        writable?: boolean;
        /**
         * A function which serves as a getter for the property, or `undefined` if there is no getter
         * (accessor descriptors only).
         */
        get?: RemoteObject;
        /**
         * A function which serves as a setter for the property, or `undefined` if there is no setter
         * (accessor descriptors only).
         */
        set?: RemoteObject;
        /**
         * True if the type of this property descriptor may be changed and if the property may be
         * deleted from the corresponding object.
         */
        configurable: boolean;
        /**
         * True if this property shows up during enumeration of the properties on the corresponding
         * object.
         */
        enumerable: boolean;
        /**
         * True if the result was thrown during the evaluation.
         */
        wasThrown?: boolean;
        /**
         * True if the property is owned for the object.
         */
        isOwn?: boolean;
        /**
         * Property symbol object, if the property is of the `symbol` type.
         */
        symbol?: RemoteObject;
    }
    /**
     * Object internal property descriptor. This property isn't normally visible in JavaScript code.
     */
    interface InternalPropertyDescriptor {
        /**
         * Conventional property name.
         */
        name: string;
        /**
         * The value associated with the property.
         */
        value?: RemoteObject;
    }
    /**
     * Object private field descriptor.
     */
    interface PrivatePropertyDescriptor {
        /**
         * Private property name.
         */
        name: string;
        /**
         * The value associated with the private property.
         */
        value?: RemoteObject;
        /**
         * A function which serves as a getter for the private property,
         * or `undefined` if there is no getter (accessor descriptors only).
         */
        get?: RemoteObject;
        /**
         * A function which serves as a setter for the private property,
         * or `undefined` if there is no setter (accessor descriptors only).
         */
        set?: RemoteObject;
    }
    /**
     * Represents function call argument. Either remote object id `objectId`, primitive `value`,
     * unserializable primitive value or neither of (for undefined) them should be specified.
     */
    interface CallArgument {
        /**
         * Primitive value or serializable javascript object.
         */
        value?: any;
        /**
         * Primitive value which can not be JSON-stringified.
         */
        unserializableValue?: UnserializableValue;
        /**
         * Remote object handle.
         */
        objectId?: RemoteObjectId;
    }
    /**
     * Id of an execution context.
     */
    type ExecutionContextId = OpaqueIdentifier<integer, 'Protocol.Runtime.ExecutionContextId'>;
    /**
     * Description of an isolated world.
     */
    interface ExecutionContextDescription {
        /**
         * Unique id of the execution context. It can be used to specify in which execution context
         * script evaluation should be performed.
         */
        id: ExecutionContextId;
        /**
         * Execution context origin.
         */
        origin: string;
        /**
         * Human readable name describing given context.
         */
        name: string;
        /**
         * A system-unique execution context identifier. Unlike the id, this is unique across
         * multiple processes, so can be reliably used to identify specific context while backend
         * performs a cross-process navigation.
         */
        uniqueId: string;
        /**
         * Embedder-specific auxiliary data likely matching {isDefault: boolean, type: 'default'|'isolated'|'worker', frameId: string}
         */
        auxData?: any;
    }
    /**
     * Detailed information about exception (or error) that was thrown during script compilation or
     * execution.
     */
    interface ExceptionDetails {
        /**
         * Exception id.
         */
        exceptionId: integer;
        /**
         * Exception text, which should be used together with exception object when available.
         */
        text: string;
        /**
         * Line number of the exception location (0-based).
         */
        lineNumber: integer;
        /**
         * Column number of the exception location (0-based).
         */
        columnNumber: integer;
        /**
         * Script ID of the exception location.
         */
        scriptId?: ScriptId;
        /**
         * URL of the exception location, to be used when the script was not reported.
         */
        url?: string;
        /**
         * JavaScript stack trace if available.
         */
        stackTrace?: StackTrace;
        /**
         * Exception object if available.
         */
        exception?: RemoteObject;
        /**
         * Identifier of the context where exception happened.
         */
        executionContextId?: ExecutionContextId;
        /**
         * Dictionary with entries of meta data that the client associated
         * with this exception, such as information about associated network
         * requests, etc.
         */
        exceptionMetaData?: any;
    }
    /**
     * Number of milliseconds since epoch.
     */
    type Timestamp = number;
    /**
     * Number of milliseconds.
     */
    type TimeDelta = number;
    /**
     * Stack entry for runtime errors and assertions.
     */
    interface CallFrame {
        /**
         * JavaScript function name.
         */
        functionName: string;
        /**
         * JavaScript script id.
         */
        scriptId: ScriptId;
        /**
         * JavaScript script name or url.
         */
        url: string;
        /**
         * JavaScript script line number (0-based).
         */
        lineNumber: integer;
        /**
         * JavaScript script column number (0-based).
         */
        columnNumber: integer;
    }
    /**
     * Call frames for assertions or error messages.
     */
    interface StackTrace {
        /**
         * String label of this stack trace. For async traces this may be a name of the function that
         * initiated the async call.
         */
        description?: string;
        /**
         * JavaScript function name.
         */
        callFrames: CallFrame[];
        /**
         * Asynchronous JavaScript stack trace that preceded this stack, if available.
         */
        parent?: StackTrace;
        /**
         * Asynchronous JavaScript stack trace that preceded this stack, if available.
         */
        parentId?: StackTraceId;
    }
    /**
     * Unique identifier of current debugger.
     */
    type UniqueDebuggerId = OpaqueIdentifier<string, 'Protocol.Runtime.UniqueDebuggerId'>;
    /**
     * If `debuggerId` is set stack trace comes from another debugger and can be resolved there. This
     * allows to track cross-debugger calls. See `Runtime.StackTrace` and `Debugger.paused` for usages.
     */
    interface StackTraceId {
        id: string;
        debuggerId?: UniqueDebuggerId;
    }
    interface AwaitPromiseRequest {
        /**
         * Identifier of the promise.
         */
        promiseObjectId: RemoteObjectId;
        /**
         * Whether the result is expected to be a JSON object that should be sent by value.
         */
        returnByValue?: boolean;
        /**
         * Whether preview should be generated for the result.
         */
        generatePreview?: boolean;
    }
    interface AwaitPromiseResponse extends ProtocolResponseWithError {
        /**
         * Promise result. Will contain rejected value if promise was rejected.
         */
        result: RemoteObject;
        /**
         * Exception details if stack strace is available.
         */
        exceptionDetails?: ExceptionDetails;
    }
    interface CallFunctionOnRequest {
        /**
         * Declaration of the function to call.
         */
        functionDeclaration: string;
        /**
         * Identifier of the object to call function on. Either objectId or executionContextId should
         * be specified.
         */
        objectId?: RemoteObjectId;
        /**
         * Call arguments. All call arguments must belong to the same JavaScript world as the target
         * object.
         */
        arguments?: CallArgument[];
        /**
         * In silent mode exceptions thrown during evaluation are not reported and do not pause
         * execution. Overrides `setPauseOnException` state.
         */
        silent?: boolean;
        /**
         * Whether the result is expected to be a JSON object which should be sent by value.
         * Can be overriden by `serializationOptions`.
         */
        returnByValue?: boolean;
        /**
         * Whether preview should be generated for the result.
         */
        generatePreview?: boolean;
        /**
         * Whether execution should be treated as initiated by user in the UI.
         */
        userGesture?: boolean;
        /**
         * Whether execution should `await` for resulting value and return once awaited promise is
         * resolved.
         */
        awaitPromise?: boolean;
        /**
         * Specifies execution context which global object will be used to call function on. Either
         * executionContextId or objectId should be specified.
         */
        executionContextId?: ExecutionContextId;
        /**
         * Symbolic group name that can be used to release multiple objects. If objectGroup is not
         * specified and objectId is, objectGroup will be inherited from object.
         */
        objectGroup?: string;
        /**
         * Whether to throw an exception if side effect cannot be ruled out during evaluation.
         */
        throwOnSideEffect?: boolean;
        /**
         * An alternative way to specify the execution context to call function on.
         * Compared to contextId that may be reused across processes, this is guaranteed to be
         * system-unique, so it can be used to prevent accidental function call
         * in context different than intended (e.g. as a result of navigation across process
         * boundaries).
         * This is mutually exclusive with `executionContextId`.
         */
        uniqueContextId?: string;
        /**
         * Specifies the result serialization. If provided, overrides
         * `generatePreview` and `returnByValue`.
         */
        serializationOptions?: SerializationOptions;
    }
    interface CallFunctionOnResponse extends ProtocolResponseWithError {
        /**
         * Call result.
         */
        result: RemoteObject;
        /**
         * Exception details.
         */
        exceptionDetails?: ExceptionDetails;
    }
    interface CompileScriptRequest {
        /**
         * Expression to compile.
         */
        expression: string;
        /**
         * Source url to be set for the script.
         */
        sourceURL: string;
        /**
         * Specifies whether the compiled script should be persisted.
         */
        persistScript: boolean;
        /**
         * Specifies in which execution context to perform script run. If the parameter is omitted the
         * evaluation will be performed in the context of the inspected page.
         */
        executionContextId?: ExecutionContextId;
    }
    interface CompileScriptResponse extends ProtocolResponseWithError {
        /**
         * Id of the script.
         */
        scriptId?: ScriptId;
        /**
         * Exception details.
         */
        exceptionDetails?: ExceptionDetails;
    }
    interface EvaluateRequest {
        /**
         * Expression to evaluate.
         */
        expression: string;
        /**
         * Symbolic group name that can be used to release multiple objects.
         */
        objectGroup?: string;
        /**
         * Determines whether Command Line API should be available during the evaluation.
         */
        includeCommandLineAPI?: boolean;
        /**
         * In silent mode exceptions thrown during evaluation are not reported and do not pause
         * execution. Overrides `setPauseOnException` state.
         */
        silent?: boolean;
        /**
         * Specifies in which execution context to perform evaluation. If the parameter is omitted the
         * evaluation will be performed in the context of the inspected page.
         * This is mutually exclusive with `uniqueContextId`, which offers an
         * alternative way to identify the execution context that is more reliable
         * in a multi-process environment.
         */
        contextId?: ExecutionContextId;
        /**
         * Whether the result is expected to be a JSON object that should be sent by value.
         */
        returnByValue?: boolean;
        /**
         * Whether preview should be generated for the result.
         */
        generatePreview?: boolean;
        /**
         * Whether execution should be treated as initiated by user in the UI.
         */
        userGesture?: boolean;
        /**
         * Whether execution should `await` for resulting value and return once awaited promise is
         * resolved.
         */
        awaitPromise?: boolean;
        /**
         * Whether to throw an exception if side effect cannot be ruled out during evaluation.
         * This implies `disableBreaks` below.
         */
        throwOnSideEffect?: boolean;
        /**
         * Terminate execution after timing out (number of milliseconds).
         */
        timeout?: TimeDelta;
        /**
         * Disable breakpoints during execution.
         */
        disableBreaks?: boolean;
        /**
         * Setting this flag to true enables `let` re-declaration and top-level `await`.
         * Note that `let` variables can only be re-declared if they originate from
         * `replMode` themselves.
         */
        replMode?: boolean;
        /**
         * The Content Security Policy (CSP) for the target might block 'unsafe-eval'
         * which includes eval(), Function(), setTimeout() and setInterval()
         * when called with non-callable arguments. This flag bypasses CSP for this
         * evaluation and allows unsafe-eval. Defaults to true.
         */
        allowUnsafeEvalBlockedByCSP?: boolean;
        /**
         * An alternative way to specify the execution context to evaluate in.
         * Compared to contextId that may be reused across processes, this is guaranteed to be
         * system-unique, so it can be used to prevent accidental evaluation of the expression
         * in context different than intended (e.g. as a result of navigation across process
         * boundaries).
         * This is mutually exclusive with `contextId`.
         */
        uniqueContextId?: string;
        /**
         * Specifies the result serialization. If provided, overrides
         * `generatePreview` and `returnByValue`.
         */
        serializationOptions?: SerializationOptions;
    }
    interface EvaluateResponse extends ProtocolResponseWithError {
        /**
         * Evaluation result.
         */
        result: RemoteObject;
        /**
         * Exception details.
         */
        exceptionDetails?: ExceptionDetails;
    }
    interface GetIsolateIdResponse extends ProtocolResponseWithError {
        /**
         * The isolate id.
         */
        id: string;
    }
    interface GetHeapUsageResponse extends ProtocolResponseWithError {
        /**
         * Used JavaScript heap size in bytes.
         */
        usedSize: number;
        /**
         * Allocated JavaScript heap size in bytes.
         */
        totalSize: number;
        /**
         * Used size in bytes in the embedder's garbage-collected heap.
         */
        embedderHeapUsedSize: number;
        /**
         * Size in bytes of backing storage for array buffers and external strings.
         */
        backingStorageSize: number;
    }
    interface GetPropertiesRequest {
        /**
         * Identifier of the object to return properties for.
         */
        objectId: RemoteObjectId;
        /**
         * If true, returns properties belonging only to the element itself, not to its prototype
         * chain.
         */
        ownProperties?: boolean;
        /**
         * If true, returns accessor properties (with getter/setter) only; internal properties are not
         * returned either.
         */
        accessorPropertiesOnly?: boolean;
        /**
         * Whether preview should be generated for the results.
         */
        generatePreview?: boolean;
        /**
         * If true, returns non-indexed properties only.
         */
        nonIndexedPropertiesOnly?: boolean;
    }
    interface GetPropertiesResponse extends ProtocolResponseWithError {
        /**
         * Object properties.
         */
        result: PropertyDescriptor[];
        /**
         * Internal object properties (only of the element itself).
         */
        internalProperties?: InternalPropertyDescriptor[];
        /**
         * Object private properties.
         */
        privateProperties?: PrivatePropertyDescriptor[];
        /**
         * Exception details.
         */
        exceptionDetails?: ExceptionDetails;
    }
    interface GlobalLexicalScopeNamesRequest {
        /**
         * Specifies in which execution context to lookup global scope variables.
         */
        executionContextId?: ExecutionContextId;
    }
    interface GlobalLexicalScopeNamesResponse extends ProtocolResponseWithError {
        names: string[];
    }
    interface QueryObjectsRequest {
        /**
         * Identifier of the prototype to return objects for.
         */
        prototypeObjectId: RemoteObjectId;
        /**
         * Symbolic group name that can be used to release the results.
         */
        objectGroup?: string;
    }
    interface QueryObjectsResponse extends ProtocolResponseWithError {
        /**
         * Array with objects.
         */
        objects: RemoteObject;
    }
    interface ReleaseObjectRequest {
        /**
         * Identifier of the object to release.
         */
        objectId: RemoteObjectId;
    }
    interface ReleaseObjectGroupRequest {
        /**
         * Symbolic object group name.
         */
        objectGroup: string;
    }
    interface RunScriptRequest {
        /**
         * Id of the script to run.
         */
        scriptId: ScriptId;
        /**
         * Specifies in which execution context to perform script run. If the parameter is omitted the
         * evaluation will be performed in the context of the inspected page.
         */
        executionContextId?: ExecutionContextId;
        /**
         * Symbolic group name that can be used to release multiple objects.
         */
        objectGroup?: string;
        /**
         * In silent mode exceptions thrown during evaluation are not reported and do not pause
         * execution. Overrides `setPauseOnException` state.
         */
        silent?: boolean;
        /**
         * Determines whether Command Line API should be available during the evaluation.
         */
        includeCommandLineAPI?: boolean;
        /**
         * Whether the result is expected to be a JSON object which should be sent by value.
         */
        returnByValue?: boolean;
        /**
         * Whether preview should be generated for the result.
         */
        generatePreview?: boolean;
        /**
         * Whether execution should `await` for resulting value and return once awaited promise is
         * resolved.
         */
        awaitPromise?: boolean;
    }
    interface RunScriptResponse extends ProtocolResponseWithError {
        /**
         * Run result.
         */
        result: RemoteObject;
        /**
         * Exception details.
         */
        exceptionDetails?: ExceptionDetails;
    }
    interface SetAsyncCallStackDepthRequest {
        /**
         * Maximum depth of async call stacks. Setting to `0` will effectively disable collecting async
         * call stacks (default).
         */
        maxDepth: integer;
    }
    interface SetCustomObjectFormatterEnabledRequest {
        enabled: boolean;
    }
    interface SetMaxCallStackSizeToCaptureRequest {
        size: integer;
    }
    interface AddBindingRequest {
        name: string;
        /**
         * If specified, the binding would only be exposed to the specified
         * execution context. If omitted and `executionContextName` is not set,
         * the binding is exposed to all execution contexts of the target.
         * This parameter is mutually exclusive with `executionContextName`.
         * Deprecated in favor of `executionContextName` due to an unclear use case
         * and bugs in implementation (crbug.com/1169639). `executionContextId` will be
         * removed in the future.
         * @deprecated
         */
        executionContextId?: ExecutionContextId;
        /**
         * If specified, the binding is exposed to the executionContext with
         * matching name, even for contexts created after the binding is added.
         * See also `ExecutionContext.name` and `worldName` parameter to
         * `Page.addScriptToEvaluateOnNewDocument`.
         * This parameter is mutually exclusive with `executionContextId`.
         */
        executionContextName?: string;
    }
    interface RemoveBindingRequest {
        name: string;
    }
    interface GetExceptionDetailsRequest {
        /**
         * The error object for which to resolve the exception details.
         */
        errorObjectId: RemoteObjectId;
    }
    interface GetExceptionDetailsResponse extends ProtocolResponseWithError {
        exceptionDetails?: ExceptionDetails;
    }
    /**
     * Notification is issued every time when binding is called.
     */
    interface BindingCalledEvent {
        name: string;
        payload: string;
        /**
         * Identifier of the context where the call was made.
         */
        executionContextId: ExecutionContextId;
    }
    const enum ConsoleAPICalledEventType {
        Log = "log",
        Debug = "debug",
        Info = "info",
        Error = "error",
        Warning = "warning",
        Dir = "dir",
        DirXML = "dirxml",
        Table = "table",
        Trace = "trace",
        Clear = "clear",
        StartGroup = "startGroup",
        StartGroupCollapsed = "startGroupCollapsed",
        EndGroup = "endGroup",
        Assert = "assert",
        Profile = "profile",
        ProfileEnd = "profileEnd",
        Count = "count",
        TimeEnd = "timeEnd"
    }
    /**
     * Issued when console API was called.
     */
    interface ConsoleAPICalledEvent {
        /**
         * Type of the call.
         */
        type: ConsoleAPICalledEventType;
        /**
         * Call arguments.
         */
        args: RemoteObject[];
        /**
         * Identifier of the context where the call was made.
         */
        executionContextId: ExecutionContextId;
        /**
         * Call timestamp.
         */
        timestamp: Timestamp;
        /**
         * Stack trace captured when the call was made. The async stack chain is automatically reported for
         * the following call types: `assert`, `error`, `trace`, `warning`. For other types the async call
         * chain can be retrieved using `Debugger.getStackTrace` and `stackTrace.parentId` field.
         */
        stackTrace?: StackTrace;
        /**
         * Console context descriptor for calls on non-default console context (not console.*):
         * 'anonymous#unique-logger-id' for call on unnamed context, 'name#unique-logger-id' for call
         * on named context.
         */
        context?: string;
    }
    /**
     * Issued when unhandled exception was revoked.
     */
    interface ExceptionRevokedEvent {
        /**
         * Reason describing why exception was revoked.
         */
        reason: string;
        /**
         * The id of revoked exception, as reported in `exceptionThrown`.
         */
        exceptionId: integer;
    }
    /**
     * Issued when exception was thrown and unhandled.
     */
    interface ExceptionThrownEvent {
        /**
         * Timestamp of the exception.
         */
        timestamp: Timestamp;
        exceptionDetails: ExceptionDetails;
    }
    /**
     * Issued when new execution context is created.
     */
    interface ExecutionContextCreatedEvent {
        /**
         * A newly created execution context.
         */
        context: ExecutionContextDescription;
    }
    /**
     * Issued when execution context is destroyed.
     */
    interface ExecutionContextDestroyedEvent {
        /**
         * Id of the destroyed context
         * @deprecated
         */
        executionContextId: ExecutionContextId;
        /**
         * Unique Id of the destroyed context
         */
        executionContextUniqueId: string;
    }
    /**
     * Issued when object should be inspected (for example, as a result of inspect() command line API
     * call).
     */
    interface InspectRequestedEvent {
        object: RemoteObject;
        hints: any;
        /**
         * Identifier of the context where the call was made.
         */
        executionContextId?: ExecutionContextId;
    }
}
/**
 * This domain is deprecated.
 * @deprecated
 */
export declare namespace Schema {
    /**
     * Description of the protocol domain.
     */
    interface Domain {
        /**
         * Domain name.
         */
        name: string;
        /**
         * Domain version.
         */
        version: string;
    }
    interface GetDomainsResponse extends ProtocolResponseWithError {
        /**
         * List of supported domains.
         */
        domains: Domain[];
    }
}
export {};
