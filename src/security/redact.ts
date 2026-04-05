import {logger} from '../logger.js';

// Default patterns to detect secrets
const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  // API keys (various formats)
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[\w\-]{20,}/gi,
  // Bearer tokens
  /Bearer\s+[\w\-._~+/]+=*/gi,
  // AWS keys
  /AKIA[0-9A-Z]{16}/g,
  // Generic long hex/base64 tokens (40+ chars)
  /(?:token|secret|password|credential|auth)\s*[:=]\s*['"]?[\w\-+/]{40,}/gi,
  // JWT tokens
  /eyJ[\w-]+\.eyJ[\w-]+\.[\w\-+/=]+/g,
  // Private keys
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  // Connection strings
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/gi,
];

export interface RedactionConfig {
  enabled?: boolean;
  additionalPatterns?: string[]; // User-supplied regex patterns
}

const REDACTED = '[REDACTED]';

function buildPatterns(config?: RedactionConfig): RegExp[] {
  const patterns = [...DEFAULT_SECRET_PATTERNS];

  if (config?.additionalPatterns) {
    for (const raw of config.additionalPatterns) {
      try {
        patterns.push(new RegExp(raw, 'gi'));
      } catch (err) {
        logger(`Invalid additional redaction pattern: ${raw}`);
      }
    }
  }

  return patterns;
}

/**
 * Redact sensitive content from a string.
 * Returns text with secrets replaced by [REDACTED].
 * If config.enabled === false, returns text unchanged.
 */
export function redact(text: string, config?: RedactionConfig): string {
  if (config?.enabled === false) {
    return text;
  }

  const patterns = buildPatterns(config);
  let result = text;

  for (const pattern of patterns) {
    // Reset lastIndex for stateful regexes (those with /g flag)
    pattern.lastIndex = 0;
    result = result.replace(pattern, REDACTED);
  }

  return result;
}

/**
 * Check if text contains any secrets (without redacting).
 */
export function containsSecrets(text: string): boolean {
  for (const pattern of DEFAULT_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
