// src/project-root-state.ts
// Global state for MCP project root (set during initialization)

let projectRoot: string | undefined;

export function setProjectRoot(path: string): void {
  projectRoot = path;
  console.error(`[MCP] Project root initialized: ${path}`);
}

export function getProjectRoot(): string | undefined {
  return projectRoot;
}

export function isProjectRootInitialized(): boolean {
  return projectRoot !== undefined;
}
