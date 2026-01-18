/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plugin API for chrome-devtools-mcp-for-extension
 *
 * This module provides the interfaces for creating plugins that extend
 * the MCP server with additional tools. Plugins can register tools
 * without modifying core functionality.
 *
 * v0.26.0: Initial plugin architecture
 */

import type {ToolCategories} from './tools/categories.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';

// Use a broader type for storing tools with any schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any>;

/**
 * Registry for managing MCP tools.
 * Allows dynamic registration and querying of tools.
 */
export class ToolRegistry {
  private tools = new Map<string, AnyToolDefinition>();
  private categories = new Map<ToolCategories, Set<string>>();

  /**
   * Register a single tool.
   * @throws Error if a tool with the same name already exists
   */
  register(tool: AnyToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);

    // Track by category
    const category = tool.annotations.category;
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(tool.name);
  }

  /**
   * Register multiple tools at once.
   */
  registerBatch(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get all registered tools.
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category.
   */
  getByCategory(category: ToolCategories): ToolDefinition[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names)
      .map((name) => this.tools.get(name)!)
      .filter(Boolean);
  }

  /**
   * Get a specific tool by name.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Unregister a tool by name.
   * Returns true if the tool was removed, false if it didn't exist.
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);
    const category = tool.annotations.category;
    this.categories.get(category)?.delete(name);
    return true;
  }

  /**
   * Clear all registered tools.
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
  }
}

/**
 * Context provided to plugins during registration.
 * Provides access to core functionality without exposing internals.
 */
export interface PluginContext {
  /**
   * The tool registry for adding tools.
   */
  registry: ToolRegistry;

  /**
   * Logger function for plugin messages.
   */
  log: (message: string) => void;

  /**
   * Plugin configuration from environment or config file.
   */
  config: PluginConfig;
}

/**
 * Configuration options for plugins.
 */
export interface PluginConfig {
  /**
   * Base directory for plugin data storage.
   * Defaults to process.cwd()
   */
  dataDir?: string;

  /**
   * Whether to enable debug logging.
   */
  debug?: boolean;

  /**
   * Custom configuration values.
   */
  [key: string]: unknown;
}

/**
 * Interface that all plugins must implement.
 */
export interface McpPlugin {
  /**
   * Unique identifier for the plugin.
   */
  id: string;

  /**
   * Human-readable name.
   */
  name: string;

  /**
   * Plugin version.
   */
  version: string;

  /**
   * Optional description.
   */
  description?: string;

  /**
   * Called when the plugin is loaded.
   * Use this to register tools and set up resources.
   */
  register(ctx: PluginContext): Promise<void> | void;

  /**
   * Called when the plugin is unloaded (optional).
   * Use this to clean up resources.
   */
  unload?(): Promise<void> | void;
}

/**
 * Plugin loader for dynamically loading plugins.
 */
export class PluginLoader {
  private plugins = new Map<string, McpPlugin>();
  private registry: ToolRegistry;
  private log: (message: string) => void;
  private config: PluginConfig;

  constructor(
    registry: ToolRegistry,
    log: (message: string) => void = console.error,
    config: PluginConfig = {},
  ) {
    this.registry = registry;
    this.log = log;
    this.config = config;
  }

  /**
   * Load a plugin from a module path or package name.
   * @param moduleId - Path to module or npm package name
   */
  async load(moduleId: string): Promise<boolean> {
    try {
      this.log(`[plugins] Loading plugin: ${moduleId}`);

      // Dynamic import
      const module = await import(moduleId);
      const plugin: McpPlugin = module.default || module.plugin || module;

      if (!plugin.id || !plugin.register) {
        this.log(`[plugins] Invalid plugin (missing id or register): ${moduleId}`);
        return false;
      }

      if (this.plugins.has(plugin.id)) {
        this.log(`[plugins] Plugin already loaded: ${plugin.id}`);
        return false;
      }

      // Create plugin context
      const ctx: PluginContext = {
        registry: this.registry,
        log: (msg) => this.log(`[${plugin.id}] ${msg}`),
        config: this.config,
      };

      // Register the plugin
      await plugin.register(ctx);

      this.plugins.set(plugin.id, plugin);
      this.log(`[plugins] Loaded: ${plugin.name} v${plugin.version} (${plugin.id})`);
      return true;
    } catch (error) {
      this.log(
        `[plugins] Failed to load ${moduleId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Load multiple plugins from environment variable or config.
   * @param pluginIds - Comma-separated list of plugin module IDs
   */
  async loadFromList(pluginIds: string): Promise<{ loaded: string[]; failed: string[] }> {
    const ids = pluginIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const loaded: string[] = [];
    const failed: string[] = [];

    for (const id of ids) {
      const success = await this.load(id);
      if (success) {
        loaded.push(id);
      } else {
        failed.push(id);
      }
    }

    return { loaded, failed };
  }

  /**
   * Unload a plugin by ID.
   */
  async unload(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    try {
      if (plugin.unload) {
        await plugin.unload();
      }
      this.plugins.delete(pluginId);
      this.log(`[plugins] Unloaded: ${pluginId}`);
      return true;
    } catch (error) {
      this.log(
        `[plugins] Failed to unload ${pluginId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Get list of loaded plugins.
   */
  getLoaded(): McpPlugin[] {
    return Array.from(this.plugins.values());
  }
}

// Re-export types for plugin authors
export type { ToolDefinition, Context, Response, ToolCategories };
