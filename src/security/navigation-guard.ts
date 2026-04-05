import {validateUrl, containsSecrets, type SsrfPolicy} from './ssrf.js';
import {logger} from '../logger.js';

export interface NavigationResult {
  allowed: boolean;
  url: string;
  reason?: string;
  warnings?: string[];
}

/**
 * Validate a URL before browser navigation.
 * Combines SSRF policy checks with secret detection.
 */
export function guardNavigation(url: string, policy: SsrfPolicy): NavigationResult {
  const warnings: string[] = [];

  // Check for secrets in URL
  if (containsSecrets(url)) {
    warnings.push('URL appears to contain API keys or secrets — consider using headers instead');
    logger('Navigation guard: URL contains potential secrets');
  }

  // Validate against SSRF policy
  const result = validateUrl(url, policy);

  if (!result.allowed) {
    logger(`Navigation blocked: ${result.reason} — ${url}`);
    return {
      allowed: false,
      url,
      reason: result.reason,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  return {
    allowed: true,
    url,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate the final URL after redirects.
 * Prevents SSRF via open redirects — a public URL that redirects to a private target.
 */
export function guardRedirect(
  originalUrl: string,
  finalUrl: string,
  policy: SsrfPolicy,
): NavigationResult {
  const warnings: string[] = [];

  // The original URL was already validated, so focus on the final URL
  const finalResult = validateUrl(finalUrl, policy);

  if (!finalResult.allowed) {
    logger(`Redirect blocked: ${originalUrl} -> ${finalUrl} — ${finalResult.reason}`);
    return {
      allowed: false,
      url: finalUrl,
      reason: `Redirect to blocked destination: ${finalResult.reason}`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // Warn if the redirect crossed to a different domain
  try {
    const originalHost = new URL(originalUrl).hostname.toLowerCase();
    const finalHost = new URL(finalUrl).hostname.toLowerCase();
    if (originalHost !== finalHost) {
      warnings.push(`Redirected from ${originalHost} to ${finalHost}`);
    }
  } catch {
    warnings.push('Could not parse redirect URLs for domain comparison');
  }

  // Check for secrets in final URL
  if (containsSecrets(finalUrl)) {
    warnings.push('Redirect target URL appears to contain API keys or secrets');
    logger('Navigation guard: redirect target contains potential secrets');
  }

  return {
    allowed: true,
    url: finalUrl,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
