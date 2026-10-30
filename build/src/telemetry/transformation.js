/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { isLocalhost } from '../utils/url.js';
const LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
export function bucketizeLatency(latencyMs) {
    for (const bucket of LATENCY_BUCKETS) {
        if (latencyMs <= bucket) {
            return bucket;
        }
    }
    return LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1];
}
export const MAX_ACTIVE_DAYS = 31;
export function bucketizeDaysSince(days) {
    return Math.min(days, MAX_ACTIVE_DAYS);
}
export const REDACTED_CLIENT_NAME = '<redacted>';
const VALID_CLIENT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_CLIENT_NAME_LENGTH = 32;
export function sanitizeClientName(clientName) {
    if (clientName.length > 0 &&
        clientName.length < MAX_CLIENT_NAME_LENGTH &&
        VALID_CLIENT_NAME_REGEX.test(clientName)) {
        return clientName;
    }
    return REDACTED_CLIENT_NAME;
}
export const PARAM_BLOCKLIST = new Set(['uid', 'reqid', 'msgid']);
const SUPPORTED_ZOD_TYPES = [
    'ZodString',
    'ZodNumber',
    'ZodBoolean',
    'ZodArray',
    'ZodEnum',
];
function isObjectWithDef(val) {
    return typeof val === 'object' && val !== null && '_def' in val;
}
function isZodType(type) {
    return SUPPORTED_ZOD_TYPES.includes(type);
}
export function getZodType(zodType) {
    if (!isObjectWithDef(zodType)) {
        throw new Error('Invalid zod schema');
    }
    const def = zodType._def;
    let typeName = def.typeName;
    if (!typeName && def.type) {
        typeName = 'Zod' + def.type.charAt(0).toUpperCase() + def.type.slice(1);
    }
    if (typeName === 'ZodOptional' ||
        typeName === 'ZodDefault' ||
        typeName === 'ZodNullable') {
        return getZodType(def.innerType);
    }
    if (typeName === 'ZodEffects') {
        return getZodType(def.schema);
    }
    if (typeName === 'ZodPipeline' || typeName === 'ZodPipe') {
        return getZodType(isObjectWithDef(def.in) &&
            (def.in._def.type === 'transform' ||
                def.in._def.typeName === 'ZodTransform')
            ? def.out
            : def.in);
    }
    if (typeName && isZodType(typeName)) {
        return typeName;
    }
    throw new Error(`Unsupported zod type for tool parameter: ${typeName}`);
}
/**
 * Resolves the values of an enum parameter, unwrapping any optional/default/
 * nullable/effects wrappers (in any order), mirroring {@link getZodType}.
 */
export function getEnumValues(zodType) {
    if (!isObjectWithDef(zodType)) {
        throw new Error('Invalid zod schema');
    }
    const def = zodType._def;
    let typeName = def.typeName;
    if (!typeName && def.type) {
        typeName = 'Zod' + def.type.charAt(0).toUpperCase() + def.type.slice(1);
    }
    if (typeName === 'ZodOptional' ||
        typeName === 'ZodDefault' ||
        typeName === 'ZodNullable') {
        return getEnumValues(def.innerType);
    }
    if (typeName === 'ZodEffects') {
        return getEnumValues(def.schema);
    }
    if (typeName === 'ZodPipeline' || typeName === 'ZodPipe') {
        return getEnumValues(isObjectWithDef(def.in) &&
            (def.in._def.type === 'transform' ||
                def.in._def.typeName === 'ZodTransform')
            ? def.out
            : def.in);
    }
    if (typeName === 'ZodEnum') {
        if (def.values) {
            return def.values;
        }
        if (def.entries) {
            return Object.values(def.entries);
        }
    }
    throw new Error(`Cannot resolve enum values for zod type: ${typeName}`);
}
export function stripUnderscoreBeforeNumber(name) {
    return name.replace(/_([0-9])/g, '$1');
}
export function transformArgName(zodType, name) {
    const snakeCaseName = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    let transformed;
    if (zodType === 'ZodString') {
        transformed = `${snakeCaseName}_length`;
    }
    else if (zodType === 'ZodArray') {
        transformed = `${snakeCaseName}_count`;
    }
    else {
        transformed = snakeCaseName;
    }
    return stripUnderscoreBeforeNumber(transformed);
}
export function transformArgType(zodType) {
    if (zodType === 'ZodString' || zodType === 'ZodArray') {
        return 'number';
    }
    switch (zodType) {
        case 'ZodNumber':
            return 'number';
        case 'ZodBoolean':
            return 'boolean';
        case 'ZodEnum':
            return 'enum';
        default:
            throw new Error(`Unsupported zod type for tool parameter: ${zodType}`);
    }
}
const BUCKETS = [
    0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];
function bucketize(value) {
    for (const bucket of BUCKETS) {
        if (bucket >= value) {
            return bucket;
        }
    }
    return BUCKETS[BUCKETS.length - 1];
}
function transformValue(zodType, value) {
    if (zodType === 'ZodString') {
        return bucketize(value.length);
    }
    if (zodType === 'ZodArray') {
        return value.length;
    }
    return value;
}
function hasEquivalentType(zodType, value) {
    if (zodType === 'ZodString') {
        return typeof value === 'string';
    }
    if (zodType === 'ZodArray') {
        return Array.isArray(value);
    }
    if (zodType === 'ZodNumber') {
        return typeof value === 'number';
    }
    if (zodType === 'ZodBoolean') {
        return typeof value === 'boolean';
    }
    if (zodType === 'ZodEnum') {
        return (typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean');
    }
    return false;
}
export function sanitizeParams(params, schema) {
    const transformed = {};
    for (const [name, value] of Object.entries(params)) {
        if (PARAM_BLOCKLIST.has(name)) {
            continue;
        }
        const zodType = getZodType(schema[name]);
        if (!hasEquivalentType(zodType, value)) {
            throw new Error(`parameter ${name} has type ${zodType} but value ${value} is not of equivalent type`);
        }
        const transformedName = transformArgName(zodType, name);
        const transformedValue = transformValue(zodType, value);
        transformed[transformedName] = transformedValue;
    }
    return transformed;
}
function transformDevToolsData(devToolsData) {
    const logged = {};
    if (devToolsData.cdpBackendNodeId !== undefined) {
        logged.is_dom_element_selected = true;
    }
    if (devToolsData.cdpRequestId !== undefined) {
        logged.is_network_request_selected = true;
    }
    return logged;
}
export function buildContext(devToolsData, pageUrl) {
    let context;
    if (devToolsData === undefined) {
        context = { is_devtools_open: false };
    }
    else {
        context = {
            is_devtools_open: Object.keys(devToolsData).length > 0,
        };
        const loggedDevtoolsData = transformDevToolsData(devToolsData);
        if (Object.keys(loggedDevtoolsData).length > 0) {
            context.devtools_data = loggedDevtoolsData;
        }
    }
    if (pageUrl !== undefined) {
        context.is_localhost = isLocalhost(pageUrl);
    }
    return context;
}
//# sourceMappingURL=transformation.js.map