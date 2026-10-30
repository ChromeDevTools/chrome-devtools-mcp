import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
export type StandardMetricNames = 'cumulative_layout_shift' | 'first_contentful_paint' | 'first_input_delay' | 'interaction_to_next_paint' | 'largest_contentful_paint' | 'experimental_time_to_first_byte' | 'round_trip_time' | 'largest_contentful_paint_image_time_to_first_byte' | 'largest_contentful_paint_image_resource_load_delay' | 'largest_contentful_paint_image_resource_load_duration' | 'largest_contentful_paint_image_element_render_delay';
export type MetricNames = StandardMetricNames | 'form_factors';
export type FormFactor = 'DESKTOP' | 'PHONE' | 'TABLET';
export type DeviceScope = FormFactor | 'ALL';
export type DeviceOption = DeviceScope | 'AUTO';
export type PageScope = 'url' | 'origin';
export interface Scope {
    pageScope: PageScope;
    deviceScope: DeviceScope;
}
export type ConnectionType = 'offline' | 'slow-2G' | '2G' | '3G' | '4G';
export interface CrUXRequest {
    effectiveConnectionType?: ConnectionType;
    formFactor?: FormFactor;
    metrics?: MetricNames[];
    origin?: string;
    url?: string;
}
export interface MetricResponse {
    histogram?: Array<{
        start: number;
        end?: number;
        density?: number;
    }>;
    percentiles?: {
        p75: number | string;
    };
}
export interface FormFactorsResponse {
    fractions?: {
        desktop: number;
        phone: number;
        tablet: number;
    };
}
interface CollectionDate {
    year: number;
    month: number;
    day: number;
}
interface CrUXRecord {
    key: Omit<CrUXRequest, 'metrics'>;
    metrics: Partial<Record<StandardMetricNames, MetricResponse>> & {
        form_factors?: FormFactorsResponse;
    };
    collectionPeriod: {
        firstDate: CollectionDate;
        lastDate: CollectionDate;
    };
}
export interface CrUXResponse {
    record: CrUXRecord;
    urlNormalizationDetails?: {
        originalUrl: string;
        normalizedUrl: string;
    };
}
export type PageResult = Record<`${PageScope}-${DeviceScope}`, CrUXResponse | null> & {
    warnings: string[];
    normalizedUrl: string;
};
export interface OriginMapping {
    developmentOrigin: string;
    productionOrigin: string;
}
export interface ConfigSetting {
    enabled: boolean;
    override?: string;
    overrideEnabled?: boolean;
    originMappings?: OriginMapping[];
}
/** TODO: Potentially support `TABLET`. Tablet field data will always be `null` until then. **/
export declare const DEVICE_SCOPE_LIST: DeviceScope[];
export declare class CrUXManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    fieldDeviceOption: DeviceOption;
    fieldPageScope: PageScope;
    constructor(targetManager: SDK.TargetManager.TargetManager, settings: Common.Settings.Settings);
    static instance(opts?: {
        forceNew: boolean | null;
    }): CrUXManager;
    static removeInstance(): void;
    /** The most recent page result from the CrUX service. */
    get pageResult(): PageResult | undefined;
    getConfigSetting(): Common.Settings.Setting<ConfigSetting>;
    isEnabled(): boolean;
    getFieldDataForPage(pageUrl: string): Promise<PageResult>;
    getFieldDataForCurrentPageForTesting(): Promise<PageResult>;
    refresh(): Promise<void>;
    setMainDocumentURL(url: string): void;
    resolveDeviceOptionToScope(option: DeviceOption): DeviceScope;
    getSelectedDeviceScope(): DeviceScope;
    getSelectedScope(): Scope;
    getSelectedFieldResponse(): CrUXResponse | null | undefined;
    getSelectedFieldMetricData(fieldMetric: StandardMetricNames): MetricResponse | undefined;
    getFieldResponse(pageScope: PageScope, deviceScope: DeviceScope): CrUXResponse | null | undefined;
    setEndpointForTesting(endpoint: string): void;
}
export declare const enum Events {
    FIELD_DATA_CHANGED = "field-data-changed"
}
interface EventTypes {
    [Events.FIELD_DATA_CHANGED]: PageResult | undefined;
}
export {};
