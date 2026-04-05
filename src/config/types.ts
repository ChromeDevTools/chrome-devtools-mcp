/**
 * Boss Ghost MCP — Configuration type definitions.
 *
 * Defines the shape of ~/.boss-ghost/config.json and all nested sections.
 */

export interface BossGhostConfig {
  profiles?: Record<string, ProfileConfig>;
  defaultProfile?: string;
  security?: SecurityConfig;
  ghostMode?: GhostModeOverrides;
  providers?: ProvidersConfig;
}

export interface ProfileConfig {
  cdpPort?: number;
  cdpUrl?: string;
  userDataDir?: string;
  driver?: 'managed' | 'existing-session';
  attachOnly?: boolean;
  headless?: boolean;
  channel?: 'stable' | 'canary' | 'beta' | 'dev';
  executablePath?: string;
  extraArgs?: string[];
}

export interface SecurityConfig {
  ssrf?: SsrfPolicyConfig;
  redaction?: RedactionConfig;
}

export interface SsrfPolicyConfig {
  allowPrivateNetwork?: boolean;
  allowedHostnames?: string[];
  hostnameAllowlist?: string[]; // supports wildcards like "*.example.com"
  blockedHostnames?: string[];
}

export interface RedactionConfig {
  enabled?: boolean;
  patterns?: string[]; // additional regex patterns to redact
}

export interface GhostModeOverrides {
  enabled?: boolean;
  stealthLevel?: 'maximum' | 'high' | 'medium' | 'low';
  enableFingerprinting?: boolean;
  enableHumanBehavior?: boolean;
  enableBotDetectionEvasion?: boolean;
}

export interface ProvidersConfig {
  cloudProvider?: string; // 'browserbase' | 'browser-use' | 'local'
  browserbase?: {
    apiKey?: string;
    projectId?: string;
    proxies?: boolean;
    advancedStealth?: boolean;
    keepAlive?: boolean;
  };
  browserUse?: {
    apiKey?: string;
  };
}
