/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { categoryToFlagName } from '../config/category-options.js';
import { zod, } from '../third_party/index.js';
export function defineTool(definition) {
    return definition;
}
export function definePageTool(definition) {
    return (args) => {
        const tool = definition(args);
        return {
            ...tool,
            schema: {
                ...(args.pageIdRouting && !isSlimTool(tool) ? pageIdSchema : {}),
                ...tool.schema,
            },
            pageScoped: true,
        };
    };
}
/**
 * Defines a tool that does not need a browser connection, e.g. a tool that only
 * analyzes local files. Its handler only receives a {@link BrowserlessContext}.
 * Such a tool runs without the context queue (`concurrency: 'none'`) unless
 * the definition sets another value.
 */
export function defineBrowserlessTool(definition) {
    return (args) => {
        return {
            concurrency: 'none',
            ...definition(args),
            browserless: true,
        };
    };
}
export function isPageScopedTool(tool) {
    return 'pageScoped' in tool && tool.pageScoped === true;
}
export function isBrowserlessTool(tool) {
    return 'browserless' in tool && tool.browserless === true;
}
export const CLOSE_PAGE_ERROR = 'The last open page cannot be closed. It is fine to keep it open.';
export const pageIdSchema = {
    pageId: zod.number().describe('Targets a specific page by ID.'),
};
export function zodTransform(transform) {
    return (arg, ctx) => {
        try {
            return transform(arg);
        }
        catch (error) {
            ctx.addIssue({
                code: 'custom',
                message: error instanceof Error ? error.message : String(error),
            });
            return zod.NEVER;
        }
    };
}
export const timeoutSchema = {
    timeout: zod
        .number()
        .int()
        .transform(zodTransform(value => {
        return value <= 0 ? undefined : value;
    }))
        .optional()
        .describe(`Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`),
};
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const VALID_VIEWPORT_TAGS = new Set(['mobile', 'touch', 'landscape']);
function parseDecimal(part, name) {
    if (part === undefined || !DECIMAL.test(part)) {
        throw new Error(`Invalid ${name} "${part ?? ''}". Expected a decimal number.`);
    }
    return Number(part);
}
export function viewportTransform(arg) {
    if (!arg) {
        return undefined;
    }
    const [dimensions, ...tags] = arg.split(',');
    for (const tag of tags) {
        if (!VALID_VIEWPORT_TAGS.has(tag)) {
            throw new Error(`Invalid viewport tag "${tag}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]'.`);
        }
    }
    const isMobile = tags.includes('mobile');
    const hasTouch = tags.includes('touch');
    const isLandscape = tags.includes('landscape');
    const dimParts = dimensions.split('x');
    if (dimParts.length !== 2 && dimParts.length !== 3) {
        throw new Error(`Invalid viewport dimensions "${dimensions}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]'.`);
    }
    const width = parseDecimal(dimParts[0], 'viewport width');
    if (!Number.isFinite(width) || width <= 0) {
        throw new Error(`Invalid viewport width "${width}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]' with a positive width.`);
    }
    const height = parseDecimal(dimParts[1], 'viewport height');
    if (!Number.isFinite(height) || height <= 0) {
        throw new Error(`Invalid viewport height "${height}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]' with a positive height.`);
    }
    let deviceScaleFactor;
    if (dimParts.length === 3) {
        const dpr = parseDecimal(dimParts[2], 'devicePixelRatio');
        if (!Number.isFinite(dpr) || dpr <= 0) {
            throw new Error(`Invalid devicePixelRatio "${dpr}". Expected a positive number.`);
        }
        deviceScaleFactor = dpr;
    }
    return {
        width,
        height,
        deviceScaleFactor,
        isMobile,
        isLandscape,
        hasTouch,
    };
}
export function geolocationTransform(arg) {
    if (!arg) {
        return undefined;
    }
    const parts = arg.split(',');
    if (parts.length !== 2) {
        throw new Error(`Invalid geolocation "${arg}". Expected '<latitude>,<longitude>'.`);
    }
    const latitude = parseDecimal(parts[0], 'latitude');
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new Error(`Invalid latitude "${latitude}". Latitude must be a number between -90 and 90.`);
    }
    const longitude = parseDecimal(parts[1], 'longitude');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error(`Invalid longitude "${longitude}". Longitude must be a number between -180 and 180.`);
    }
    return {
        latitude,
        longitude,
    };
}
export function isSlimTool(tool) {
    return Boolean(tool.annotations.conditions?.includes('slim'));
}
/**
 * Slim mode replaces the regular tools with the slim tools.
 */
export function isAvailableInMode(tool, serverArgs) {
    return isSlimTool(tool) === Boolean(serverArgs.slim);
}
/**
 * Returns whether a capability gate is enabled under the given arguments.
 */
export function isCapabilityEnabled(gate, serverArgs) {
    if (Boolean(gate.conditions?.includes('slim')) !== Boolean(serverArgs.slim)) {
        return false;
    }
    if (gate.category && !serverArgs[categoryToFlagName(gate.category)]) {
        return false;
    }
    for (const condition of gate.conditions ?? []) {
        if (!serverArgs[condition]) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=ToolDefinition.js.map