/**
 * Hot Reload Service
 *
 * Content-hash change detection for MCP server and extension source code.
 * The extension is the single authority for all change detection, hashing,
 * building, and restart orchestration. The MCP server never hashes files.
 *
 * Source files are discovered via TypeScript's own API (ts.readConfigFile +
 * ts.parseJsonConfigFileContent), which reads tsconfig include/exclude patterns
 * and resolves the full file list. No custom glob walker, no .devtoolsignore,
 * no hardcoded exclude rules.
 *
 * Hashes are pure SHA-256 of sorted (relativePath + rawFileBytes). No mtime,
 * no file metadata. Only content bytes determine whether a rebuild is needed.
 */

import type * as vscode from 'vscode';
import * as ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { relative, join } from 'node:path';
import { exec } from 'node:child_process';

// ── Storage Keys ─────────────────────────────────────────────────────────────

const HASH_KEY_MCP = 'hotReload:hash:mcpServer';
const HASH_KEY_EXT = 'hotReload:hash:extension';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChangeCheckResult {
  mcpChanged: boolean;
  mcpRebuilt: boolean;
  mcpBuildError: string | null;
  extChanged: boolean;
  extRebuilt: boolean;
  extBuildError: string | null;
  extClientReloaded: boolean;
  newCdpPort: number | null;
  newClientStartedAt: number | null;
}

interface PackageCheckResult {
  changed: boolean;
  rebuilt: boolean;
  buildError: string | null;
}

// ── Service ──────────────────────────────────────────────────────────────────

class HotReloadService {
  constructor(private readonly workspaceState: vscode.Memento) {}

  /**
   * Discover source files using TypeScript's own tsconfig resolution.
   *
   * Prefers tsconfig.build.json (build-specific config) over tsconfig.json.
   * Uses ts.readConfigFile() + ts.parseJsonConfigFileContent() to resolve
   * the full list of matching files, respecting include/exclude/extends.
   */
  discoverSourceFiles(packageRoot: string): string[] {
    const buildConfigPath = join(packageRoot, 'tsconfig.build.json');
    const defaultConfigPath = join(packageRoot, 'tsconfig.json');
    const configPath = existsSync(buildConfigPath) ? buildConfigPath : defaultConfigPath;

    if (!existsSync(configPath)) {
      console.log('[hotReload] No tsconfig found in ' + packageRoot);
      return [];
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      const msg = ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n');
      console.log('[hotReload] Failed to read ' + configPath + ': ' + msg);
      return [];
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      packageRoot,
      undefined,
      configPath,
    );

    if (parsed.errors.length > 0) {
      for (const diag of parsed.errors) {
        const msg = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
        console.log('[hotReload] tsconfig warning: ' + msg);
      }
    }

    return parsed.fileNames;
  }

  /**
   * Compute SHA-256 of all source file contents.
   *
   * Files are sorted by relative path for deterministic output.
   * Each file contributes its relative path (forward slashes) and
   * its raw byte content to the hash. No mtime, no metadata.
   */
  computeContentHash(packageRoot: string, files: string[]): string {
    const hash = createHash('sha256');

    const sorted = files
      .map(absPath => ({
        abs: absPath,
        rel: relative(packageRoot, absPath).replace(/\\/g, '/'),
      }))
      .sort((a, b) => a.rel.localeCompare(b.rel));

    for (const file of sorted) {
      hash.update(file.rel);
      try {
        hash.update(readFileSync(file.abs));
      } catch {
        // Skip unreadable files (e.g., locked by another process)
      }
    }

    return hash.digest('hex');
  }

  getStoredHash(key: string): string | undefined {
    return this.workspaceState.get<string>(key);
  }

  setStoredHash(key: string, hash: string): Thenable<void> {
    return this.workspaceState.update(key, hash);
  }

  /**
   * Detect the package manager by checking for lockfiles.
   */
  detectPackageManager(packageRoot: string): 'pnpm' | 'npm' | 'yarn' {
    if (existsSync(join(packageRoot, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (existsSync(join(packageRoot, 'yarn.lock'))) {
      return 'yarn';
    }
    return 'npm';
  }

  /**
   * Run a package.json script using the detected package manager.
   * Returns null on success, error output on failure.
   */
  runBuild(packageRoot: string, scriptName: string): Promise<string | null> {
    return new Promise(resolve => {
      const pm = this.detectPackageManager(packageRoot);
      const cmd = pm + ' run ' + scriptName;

      console.log('[hotReload] Running build: ' + cmd + ' in ' + packageRoot);

      exec(cmd, { cwd: packageRoot, timeout: 300_000 }, (error, stdout, stderr) => {
        if (error) {
          const output = [stderr, stdout].filter(Boolean).join('\n').trim();
          resolve(output || error.message);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Check extension source only (for mcpReady / hotReloadRequired handlers).
   * Returns whether the extension changed and was rebuilt.
   */
  async checkExtensionOnly(extensionRoot: string): Promise<PackageCheckResult> {
    return this.checkPackage(extensionRoot, HASH_KEY_EXT, 'compile');
  }

  /**
   * Check if source files have changed without triggering a build.
   * Returns the current content hash and whether it differs from stored.
   * Use with runBuild() + commitHash() for progress-aware workflows.
   */
  detectChange(packageRoot: string, hashKey: 'mcp' | 'ext'): { changed: boolean; currentHash: string } {
    const key = hashKey === 'mcp' ? HASH_KEY_MCP : HASH_KEY_EXT;
    const files = this.discoverSourceFiles(packageRoot);
    if (files.length === 0) {
      return { changed: false, currentHash: '' };
    }

    const currentHash = this.computeContentHash(packageRoot, files);
    const storedHash = this.getStoredHash(key);

    if (storedHash === currentHash) {
      return { changed: false, currentHash };
    }

    const storedPrefix = storedHash ? storedHash.slice(0, 12) + '...' : 'none';
    const currentPrefix = currentHash.slice(0, 12) + '...';
    console.log('[hotReload] Content changed (' + key + '): ' + storedPrefix + ' -> ' + currentPrefix);
    return { changed: true, currentHash };
  }

  /**
   * Store a content hash after a successful build.
   * Call after runBuild() succeeds to persist the hash for future comparisons.
   */
  async commitHash(hashKey: 'mcp' | 'ext', hash: string): Promise<void> {
    const key = hashKey === 'mcp' ? HASH_KEY_MCP : HASH_KEY_EXT;
    await this.setStoredHash(key, hash);
    console.log('[hotReload] Hash committed (' + key + '): ' + hash.slice(0, 12) + '...');
  }

  /**
   * Check for changes in a single package.
   * Discovers files, hashes content, compares to stored hash,
   * and rebuilds if content has changed.
   */
  private async checkPackage(
    packageRoot: string,
    hashKey: string,
    buildScript: string,
  ): Promise<PackageCheckResult> {
    const files = this.discoverSourceFiles(packageRoot);
    if (files.length === 0) {
      return { changed: false, rebuilt: false, buildError: null };
    }

    const currentHash = this.computeContentHash(packageRoot, files);
    const storedHash = this.getStoredHash(hashKey);

    if (storedHash === currentHash) {
      return { changed: false, rebuilt: false, buildError: null };
    }

    const storedPrefix = storedHash ? storedHash.slice(0, 12) + '...' : 'none';
    const currentPrefix = currentHash.slice(0, 12) + '...';
    console.log('[hotReload] Content changed (' + hashKey + '): ' + storedPrefix + ' -> ' + currentPrefix);

    const buildError = await this.runBuild(packageRoot, buildScript);
    if (buildError) {
      console.log('[hotReload] Build failed (' + hashKey + '): ' + buildError);
      return { changed: true, rebuilt: false, buildError };
    }

    await this.setStoredHash(hashKey, currentHash);
    console.log('[hotReload] Build succeeded, hash stored: ' + currentPrefix);
    return { changed: true, rebuilt: true, buildError: null };
  }

  /**
   * Main entry point: check both extension and MCP server source.
   *
   * Extension is checked first, then MCP server.
   * - If extension changed: rebuild inline, caller handles Client restart
   * - If MCP changed: rebuild MCP source, caller handles MCP restart
   */
  async checkForChanges(
    mcpServerRoot: string,
    extensionRoot: string,
  ): Promise<ChangeCheckResult> {
    const result: ChangeCheckResult = {
      mcpChanged: false,
      mcpRebuilt: false,
      mcpBuildError: null,
      extChanged: false,
      extRebuilt: false,
      extBuildError: null,
      extClientReloaded: false,
      newCdpPort: null,
      newClientStartedAt: null,
    };

    // Extension first - uses 'compile' script (esbuild)
    const extResult = await this.checkPackage(extensionRoot, HASH_KEY_EXT, 'compile');
    result.extChanged = extResult.changed;
    result.extRebuilt = extResult.rebuilt;
    result.extBuildError = extResult.buildError;

    // MCP server - uses 'build' script (rollup)
    const mcpResult = await this.checkPackage(mcpServerRoot, HASH_KEY_MCP, 'build');
    result.mcpChanged = mcpResult.changed;
    result.mcpRebuilt = mcpResult.rebuilt;
    result.mcpBuildError = mcpResult.buildError;

    return result;
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

let serviceInstance: HotReloadService | undefined;

function createHotReloadService(workspaceState: vscode.Memento): HotReloadService {
  serviceInstance = new HotReloadService(workspaceState);
  return serviceInstance;
}

function getHotReloadService(): HotReloadService | undefined {
  return serviceInstance;
}

export type { ChangeCheckResult, PackageCheckResult };
export { HotReloadService, createHotReloadService, getHotReloadService };
