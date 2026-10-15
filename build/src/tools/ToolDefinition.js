/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { zod } from '../third_party/index.js';
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
export const CLOSE_PAGE_ERROR = 'The last open page cannot be closed. It is fine to keep it open.';
export const pageIdSchema = {
    pageId: zod.number().describe('Targets a specific page by ID.'),
};
export const timeoutSchema = {
    timeout: zod
        .number()
        .int()
        .transform(value => {
        return value <= 0 ? undefined : value;
    })
        .optional()
        .describe(`Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`),
};
export function viewportTransform(arg) {
    if (!arg) {
        return undefined;
    }
    const [dimensions, ...tags] = arg.split(',');
    const isMobile = tags.includes('mobile');
    const hasTouch = tags.includes('touch');
    const isLandscape = tags.includes('landscape');
    const [width, height, dpr] = dimensions.split('x').map(Number);
    if (!Number.isFinite(width) || width <= 0) {
        throw new Error(`Invalid viewport width "${width}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]' with a positive width.`);
    }
    if (!Number.isFinite(height) || height <= 0) {
        throw new Error(`Invalid viewport height "${height}". Expected format '<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]' with a positive height.`);
    }
    if (dpr !== undefined && (!Number.isFinite(dpr) || dpr <= 0)) {
        throw new Error(`Invalid devicePixelRatio "${dpr}". Expected a positive number.`);
    }
    return {
        width,
        height,
        deviceScaleFactor: dpr,
        isMobile,
        isLandscape,
        hasTouch,
    };
}
export function geolocationTransform(arg) {
    if (!arg) {
        return undefined;
    }
    const [latitude, longitude] = arg.split(',').map(Number);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new Error(`Invalid latitude "${latitude}". Latitude must be a number between -90 and 90.`);
    }
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
 * Slim mode replaces the regular tools with the slim tools. Only the tools of
 * the current mode are registered, so a slim tool may share its name with a
 * regular tool. `--slim` requires a restart, so the mode never changes while
 * the server is running.
 */
export function isAvailableInMode(tool, serverArgs) {
    return isSlimTool(tool) === Boolean(serverArgs.slim);
}
//# sourceMappingURL=ToolDefinition.js.map