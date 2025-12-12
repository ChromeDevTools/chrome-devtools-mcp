/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';

import type {Tool} from '@modelcontextprotocol/sdk/types.js';

import {cliOptions} from '../build/src/cli.js';
import {ToolCategory, labels} from '../build/src/tools/categories.js';
import {tools} from '../build/src/tools/tools.js';

const OUTPUT_PATH = './docs/tool-reference.md';
const README_PATH = './README.md';

// Extend the MCP Tool type to include our annotations
interface ToolWithAnnotations extends Tool {
  annotations?: {
    title?: string;
    category?: typeof ToolCategory;
  };
}

interface ZodCheck {
  kind: string;
}

interface ZodDef {
  typeName: string;
  checks?: ZodCheck[];
  values?: string[];
  type?: ZodSchema;
  innerType?: ZodSchema;
  schema?: ZodSchema;
  defaultValue?: () => unknown;
}

interface ZodSchema {
  _def: ZodDef;
  description?: string;
}

interface TypeInfo {
  type: string;
  enum?: string[];
  items?: TypeInfo;
  description?: string;
  default?: unknown;
}

function escapeHtmlTags(text: string): string {
  return text
    .replace(/&(?![a-zA-Z]+;)/g, '&amp;')
    .replace(/<([a-zA-Z][^>]*)>/g, '&lt;$1&gt;');
}

function addCrossLinks(text: string, tools: ToolWithAnnotations[]): string {
  let result = text;

  // Create a set of all tool names for efficient lookup
  const toolNames = new Set(tools.map(tool => tool.name));

  // Sort tool names by length (descending) to match longer names first
  const sortedToolNames = Array.from(toolNames).sort(
    (a, b) => b.length - a.length,
  );

  for (const toolName of sortedToolNames) {
    // Create regex to match tool name (case insensitive, word boundaries)
    const regex = new RegExp(`\\b${toolName}\\b`, 'gi');

    result = result.replace(regex, match => {
      // Only create link if the match isn't already inside a link
      if (result.indexOf(`[${match}]`) !== -1) {
        return match; // Already linked
      }
      const anchorLink = toolName.toLowerCase();
      return `[\`${match}\`](#${anchorLink})`;
    });
  }

  return result;
}

function generateToolsTOC(
  categories: Record<string, ToolWithAnnotations[]>,
  sortedCategories: string[],
): string {
  let toc = '';

  for (const category of sortedCategories) {
    const categoryTools = categories[category];
    const categoryName = labels[category];
    toc += `- **${categoryName}** (${categoryTools.length} tools)\n`;

    // Sort tools within category for TOC
    categoryTools.sort((a: Tool, b: Tool) => a.name.localeCompare(b.name));
    for (const tool of categoryTools) {
      const anchorLink = tool.name.toLowerCase();
      toc += `  - [\`${tool.name}\`](docs/tool-reference.md#${anchorLink})\n`;
    }
  }

  return toc;
}

function updateReadmeWithToolsTOC(toolsTOC: string): void {
  const readmeContent = fs.readFileSync(README_PATH, 'utf8');

  const beginMarker = '<!-- BEGIN AUTO GENERATED TOOLS -->';
  const endMarker = '<!-- END AUTO GENERATED TOOLS -->';

  const beginIndex = readmeContent.indexOf(beginMarker);
  const endIndex = readmeContent.indexOf(endMarker);

  if (beginIndex === -1 || endIndex === -1) {
    console.warn('Could not find auto-generated tools markers in README.md');
    return;
  }

  const before = readmeContent.substring(0, beginIndex + beginMarker.length);
  const after = readmeContent.substring(endIndex);

  const updatedContent = before + '\n\n' + toolsTOC + '\n' + after;

  fs.writeFileSync(README_PATH, updatedContent);
  console.log('Updated README.md with tools table of contents');
}

function generateConfigOptionsMarkdown(): string {
  let markdown = '';

  for (const [optionName, optionConfig] of Object.entries(cliOptions)) {
    // Skip hidden options
    if (optionConfig.hidden) {
      continue;
    }

    const aliasText = optionConfig.alias ? `, \`-${optionConfig.alias}\`` : '';
    const description = optionConfig.description || optionConfig.describe || '';

    // Convert camelCase to dash-case
    const dashCaseName = optionName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
    const nameDisplay =
      dashCaseName !== optionName
        ? `\`--${optionName}\`/ \`--${dashCaseName}\``
        : `\`--${optionName}\``;

    // Start with option name and description
    markdown += `- **${nameDisplay}${aliasText}**\n`;
    markdown += `  ${description}\n`;

    // Add type information
    markdown += `  - **Type:** ${optionConfig.type}\n`;

    // Add choices if available
    if (optionConfig.choices) {
      markdown += `  - **Choices:** ${optionConfig.choices.map(c => `\`${c}\``).join(', ')}\n`;
    }

    // Add default if available
    if (optionConfig.default !== undefined) {
      markdown += `  - **Default:** \`${optionConfig.default}\`\n`;
    }

    markdown += '\n';
  }

  return markdown.trim();
}

function updateReadmeWithOptionsMarkdown(optionsMarkdown: string): void {
  const readmeContent = fs.readFileSync(README_PATH, 'utf8');

  const beginMarker = '<!-- BEGIN AUTO GENERATED OPTIONS -->';
  const endMarker = '<!-- END AUTO GENERATED OPTIONS -->';

  const beginIndex = readmeContent.indexOf(beginMarker);
  const endIndex = readmeContent.indexOf(endMarker);

  if (beginIndex === -1 || endIndex === -1) {
    console.warn('Could not find auto-generated options markers in README.md');
    return;
  }

  const before = readmeContent.substring(0, beginIndex + beginMarker.length);
  const after = readmeContent.substring(endIndex);

  const updatedContent = before + '\n\n' + optionsMarkdown + '\n\n' + after;

  fs.writeFileSync(README_PATH, updatedContent);
  console.log('Updated README.md with options markdown');
}

// Helper to convert Zod schema to JSON schema-like object for docs
function getZodTypeInfo(schema: ZodSchema): TypeInfo {
  let description = schema.description;
  let def = schema._def;
  let defaultValue: unknown;

  // Unwrap optional/default/effects
  while (
    def.typeName === 'ZodOptional' ||
    def.typeName === 'ZodDefault' ||
    def.typeName === 'ZodEffects'
  ) {
    if (def.typeName === 'ZodDefault' && def.defaultValue) {
      defaultValue = def.defaultValue();
    }
    const next = def.innerType || def.schema;
    if (!next) break;
    schema = next;
    def = schema._def;
    if (!description && schema.description) description = schema.description;
  }

  const result: TypeInfo = {type: 'unknown'};
  if (description) result.description = description;
  if (defaultValue !== undefined) result.default = defaultValue;

  switch (def.typeName) {
    case 'ZodString':
      result.type = 'string';
      break;
    case 'ZodNumber':
      result.type = def.checks?.some((c: ZodCheck) => c.kind === 'int')
        ? 'integer'
        : 'number';
      break;
    case 'ZodBoolean':
      result.type = 'boolean';
      break;
    case 'ZodEnum':
      result.type = 'string';
      result.enum = def.values;
      break;
    case 'ZodArray':
      result.type = 'array';
      if (def.type) {
        result.items = getZodTypeInfo(def.type);
      }
      break;
    default:
      result.type = 'unknown';
  }
  return result;
}

function isRequired(schema: ZodSchema): boolean {
  let def = schema._def;
  while (def.typeName === 'ZodEffects') {
    if (!def.schema) break;
    schema = def.schema;
    def = schema._def;
  }
  return def.typeName !== 'ZodOptional' && def.typeName !== 'ZodDefault';
}

async function generateToolDocumentation(): Promise<void> {
  try {
    console.log('Generating tool documentation from definitions...');

    // Convert ToolDefinitions to ToolWithAnnotations
    const toolsWithAnnotations: ToolWithAnnotations[] = tools.map(tool => {
      const properties: Record<string, TypeInfo> = {};
      const required: string[] = [];

      for (const [key, schema] of Object.entries(
        tool.schema as unknown as Record<string, ZodSchema>,
      )) {
        const info = getZodTypeInfo(schema);
        properties[key] = info;
        if (isRequired(schema)) {
          required.push(key);
        }
      }

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object',
          properties,
          required,
        },
        annotations: tool.annotations,
      };
    });

    console.log(`Found ${toolsWithAnnotations.length} tools`);

    // Generate markdown documentation
    let markdown = `<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

`;

    // Group tools by category (based on annotations)
    const categories: Record<string, ToolWithAnnotations[]> = {};
    toolsWithAnnotations.forEach((tool: ToolWithAnnotations) => {
      const category = tool.annotations?.category || 'Uncategorized';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(tool);
    });

    // Sort categories using the enum order
    const categoryOrder = Object.values(ToolCategory);
    const sortedCategories = Object.keys(categories).sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a);
      const bIndex = categoryOrder.indexOf(b);
      // Put known categories first, unknown categories last
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    // Generate table of contents
    for (const category of sortedCategories) {
      const categoryTools = categories[category];
      const categoryName = labels[category];
      const anchorName = categoryName.toLowerCase().replace(/\s+/g, '-');
      markdown += `- **[${categoryName}](#${anchorName})** (${categoryTools.length} tools)\n`;

      // Sort tools within category for TOC
      categoryTools.sort((a: Tool, b: Tool) => a.name.localeCompare(b.name));
      for (const tool of categoryTools) {
        // Generate proper markdown anchor link: backticks are removed, keep underscores, lowercase
        const anchorLink = tool.name.toLowerCase();
        markdown += `  - [\`${tool.name}\`](#${anchorLink})\n`;
      }
    }
    markdown += '\n';

    for (const category of sortedCategories) {
      const categoryTools = categories[category];
      const categoryName = labels[category];

      markdown += `## ${categoryName}\n\n`;

      // Sort tools within category
      categoryTools.sort((a: Tool, b: Tool) => a.name.localeCompare(b.name));

      for (const tool of categoryTools) {
        markdown += `### \`${tool.name}\`\n\n`;

        if (tool.description) {
          // Escape HTML tags but preserve JS function syntax
          let escapedDescription = escapeHtmlTags(tool.description);

          // Add cross-links to mentioned tools
          escapedDescription = addCrossLinks(
            escapedDescription,
            toolsWithAnnotations,
          );
          markdown += `**Description:** ${escapedDescription}\n\n`;
        }

        // Handle input schema
        if (
          tool.inputSchema &&
          tool.inputSchema.properties &&
          Object.keys(tool.inputSchema.properties).length > 0
        ) {
          const properties = tool.inputSchema.properties;
          const required = tool.inputSchema.required || [];

          markdown += '**Parameters:**\n\n';

          const propertyNames = Object.keys(properties).sort((a, b) => {
            const aRequired = required.includes(a);
            const bRequired = required.includes(b);
            if (aRequired && !bRequired) return -1;
            if (!aRequired && bRequired) return 1;
            return a.localeCompare(b);
          });
          for (const propName of propertyNames) {
            const prop = properties[propName] as TypeInfo;
            const isRequired = required.includes(propName);
            const requiredText = isRequired
              ? ' **(required)**'
              : ' _(optional)_';

            let typeInfo = prop.type || 'unknown';
            if (prop.enum) {
              typeInfo = `enum: ${prop.enum.map((v: string) => `"${v}"`).join(', ')}`;
            }

            markdown += `- **${propName}** (${typeInfo})${requiredText}`;
            if (prop.description) {
              let escapedParamDesc = escapeHtmlTags(prop.description);

              // Add cross-links to mentioned tools
              escapedParamDesc = addCrossLinks(
                escapedParamDesc,
                toolsWithAnnotations,
              );
              markdown += `: ${escapedParamDesc}`;
            }
            markdown += '\n';
          }
          markdown += '\n';
        } else {
          markdown += '**Parameters:** None\n\n';
        }

        markdown += '---\n\n';
      }
    }

    // Write the documentation to file
    fs.writeFileSync(OUTPUT_PATH, markdown.trim() + '\n');

    console.log(
      `Generated documentation for ${toolsWithAnnotations.length} tools in ${OUTPUT_PATH}`,
    );

    // Generate tools TOC and update README
    const toolsTOC = generateToolsTOC(categories, sortedCategories);
    updateReadmeWithToolsTOC(toolsTOC);

    // Generate and update configuration options
    const optionsMarkdown = generateConfigOptionsMarkdown();
    updateReadmeWithOptionsMarkdown(optionsMarkdown);
    process.exit(0);
  } catch (error) {
    console.error('Error generating documentation:', error);
    process.exit(1);
  }
}

// Run the documentation generator
generateToolDocumentation().catch(console.error);
