import {logger} from '../logger.js';

export interface SsrfPolicy {
  allowPrivateNetwork?: boolean;
  allowedHostnames?: string[];
  hostnameAllowlist?: string[]; // wildcards like "*.example.com"
  blockedHostnames?: string[];
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

const BLOCKED_SCHEMES = new Set(['file:', 'javascript:', 'data:', 'vbscript:', 'ftp:']);
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

const SECRET_PATTERNS = [
  /api_key=/i,
  /apikey=/i,
  /token=/i,
  /secret=/i,
  /password=/i,
  /passwd=/i,
  /authorization=/i,
  /access_token=/i,
  /client_secret=/i,
  /private_key=/i,
];

// Matches long base64-like strings in query parameters (32+ chars)
const BASE64_QUERY_PATTERN = /[?&][^=]+=([A-Za-z0-9+/\-_]{32,})/;

/**
 * Check if an IP address is private/internal (RFC1918, loopback, link-local, metadata).
 * Does NOT perform DNS resolution — only checks the literal string.
 */
export function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim();

  // IPv6 loopback
  if (trimmed === '::1' || trimmed === '[::1]') {
    return true;
  }

  // IPv6 link-local
  if (trimmed.toLowerCase().startsWith('fe80:') || trimmed.toLowerCase().startsWith('[fe80:')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4MappedMatch = trimmed.match(/^(?:\[)?::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:])?$/i);
  if (v4MappedMatch) {
    return isPrivateIpv4(v4MappedMatch[1]);
  }

  return isPrivateIpv4(trimmed);
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map(Number);
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) {
    return false;
  }

  const [a, b] = octets;

  // 10.0.0.0/8 — Private
  if (a === 10) return true;

  // 172.16.0.0/12 — Private
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — Private
  if (a === 192 && b === 168) return true;

  // 127.0.0.0/8 — Loopback
  if (a === 127) return true;

  // 169.254.0.0/16 — Link-local (includes cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 — "This" network
  if (a === 0) return true;

  return false;
}

/**
 * Check if a hostname matches any pattern in the allowlist.
 * Supports exact match and wildcard patterns like "*.example.com".
 */
export function matchesAllowlist(hostname: string, patterns: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.toLowerCase();
    if (normalizedPattern.startsWith('*.')) {
      const suffix = normalizedPattern.slice(2);
      // *.example.com matches sub.example.com but NOT example.com itself
      return suffix.length > 0 && normalized !== suffix && normalized.endsWith(`.${suffix}`);
    }
    return normalized === normalizedPattern;
  });
}

/**
 * Check if a hostname is in the blocked list.
 */
export function isBlockedHostname(hostname: string, blockedList: string[]): boolean {
  const normalized = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(normalized)) {
    return true;
  }
  if (normalized.endsWith('.localhost') || normalized.endsWith('.local') || normalized.endsWith('.internal')) {
    return true;
  }
  return blockedList.some((blocked) => normalized === blocked.toLowerCase());
}

/**
 * Validate a URL against the SSRF policy.
 * Does NOT perform DNS resolution — validates URL structure and hostname patterns only.
 */
export function validateUrl(url: string, policy: SsrfPolicy): {allowed: boolean; reason?: string} {
  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {allowed: false, reason: 'Invalid URL'};
  }

  // 2. Block dangerous schemes first
  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    logger(`SSRF: blocked scheme ${parsed.protocol} in URL`);
    return {allowed: false, reason: `Blocked scheme: ${parsed.protocol}`};
  }

  // 3. Only allow http(s)
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    logger(`SSRF: unsupported scheme ${parsed.protocol} in URL`);
    return {allowed: false, reason: `Unsupported scheme: ${parsed.protocol}`};
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. Check blockedHostnames first (deny takes priority)
  if (policy.blockedHostnames && isBlockedHostname(hostname, policy.blockedHostnames)) {
    logger(`SSRF: blocked hostname ${hostname}`);
    return {allowed: false, reason: `Blocked hostname: ${hostname}`};
  }

  // Also check built-in blocked hostnames
  if (isBlockedHostname(hostname, [])) {
    // Allowed hostnames can override built-in blocks
    if (policy.allowedHostnames?.includes(hostname)) {
      // Explicitly allowed — continue
    } else if (policy.hostnameAllowlist && matchesAllowlist(hostname, policy.hostnameAllowlist)) {
      // Matches allowlist pattern — continue
    } else {
      logger(`SSRF: built-in blocked hostname ${hostname}`);
      return {allowed: false, reason: `Blocked hostname: ${hostname}`};
    }
  }

  // 5. Check allowedHostnames exact match
  if (policy.allowedHostnames && policy.allowedHostnames.length > 0) {
    const allowed = policy.allowedHostnames.some((h) => h.toLowerCase() === hostname);
    if (allowed) {
      return {allowed: true};
    }
  }

  // 6. Check hostnameAllowlist wildcard patterns
  if (policy.hostnameAllowlist && policy.hostnameAllowlist.length > 0) {
    if (matchesAllowlist(hostname, policy.hostnameAllowlist)) {
      return {allowed: true};
    }
    // If an allowlist is configured, only allowed hosts pass
    if (!policy.allowedHostnames || policy.allowedHostnames.length === 0) {
      logger(`SSRF: hostname ${hostname} not in allowlist`);
      return {allowed: false, reason: `Hostname not in allowlist: ${hostname}`};
    }
  }

  // 7. If hostname looks like an IP, check private network policy
  if (isPrivateIp(hostname) && !policy.allowPrivateNetwork) {
    logger(`SSRF: private IP ${hostname} blocked by policy`);
    return {allowed: false, reason: `Private/internal IP address: ${hostname}`};
  }

  // 8. Block cloud metadata IP even if allowPrivateNetwork is true
  if (hostname === '169.254.169.254' && !policy.allowedHostnames?.includes('169.254.169.254')) {
    logger('SSRF: cloud metadata endpoint blocked');
    return {allowed: false, reason: 'Cloud metadata endpoint blocked'};
  }

  return {allowed: true};
}

/**
 * Check if a URL contains API keys or secrets in query parameters.
 * Inspired by Hermes agent's URL validation.
 */
export function containsSecrets(url: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(url)) {
      return true;
    }
  }

  if (BASE64_QUERY_PATTERN.test(url)) {
    return true;
  }

  return false;
}
