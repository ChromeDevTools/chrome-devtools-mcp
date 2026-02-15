/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This utility formats console messages with template strings, reusing Chrome DevTools
 * Based on the Console Standard (https://console.spec.whatwg.org/#formatter).
 */

// Formats a console message text with its arguments, resolving format specifiers.
export function formatConsoleMessage(
  text: string,
  args: unknown[],
): {formattedText: string; remainingArgs: unknown[]} {
  if (!text) {
    return {formattedText: text, remainingArgs: args};
  }

  let result = '';
  let argIndex = 0;

  // eslint-disable-next-line no-control-regex
  const re = /%([%_Oocsdfi])|\x1B\[([\d;]*)m/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    result += text.substring(lastIndex, match.index);
    lastIndex = re.lastIndex;

    const specifier = match[1];

    if (specifier !== undefined) {
      switch (specifier) {
        case '%':
          // Escaped percent sign
          result += '%';
          break;

        case 's':
          // String substitution
          if (argIndex < args.length) {
            result += formatArg(args[argIndex++], 'string');
          } else {
            result += match[0]; // Keep the specifier if no arg available
          }
          break;

        case 'c':
          // Style substitution
          if (argIndex < args.length) {
            argIndex++; 
          } else {
            result += match[0]; 
          }
          break;

        case 'o':
        case 'O':
          // Object substitution
          if (argIndex < args.length) {
            result += formatArg(args[argIndex++], 'object');
          } else {
            result += match[0]; 
          }
          break;

        case '_':
          // Ignore substitution
          if (argIndex < args.length) {
            argIndex++;
          } else {
            result += match[0];
          }
          break;

        case 'd':
        case 'i':
          // Integer substitution
          if (argIndex < args.length) {
            const value = args[argIndex++];
            const numValue =
              typeof value === 'number' ? value : Number(value);
            result += isNaN(numValue)
              ? 'NaN'
              : Math.floor(numValue).toString();
          } else {
            result += match[0]; 
          }
          break;

        case 'f':
          // Float substitution
          if (argIndex < args.length) {
            const value = args[argIndex++];
            const numValue =
              typeof value === 'number' ? value : Number(value);
            result += isNaN(numValue) ? 'NaN' : numValue.toString();
          } else {
            result += match[0]; 
          }
          break;

        default:
          // Unknown specifier, keep it as is
          result += match[0];
          break;
      }
    } else {
      // Handle ANSI escape codes - we ignore them in the formatted output
    }
  }

  // Add any remaining text after the last match
  result += text.substring(lastIndex);

  // Return formatted text and unused arguments
  return {
    formattedText: result,
    remainingArgs: args.slice(argIndex),
  };
}

// Formats an argument value for display.
function formatArg(arg: unknown, _hint: 'string' | 'object'): string {
  if (arg === null) {
    return 'null';
  }

  if (arg === undefined) {
    return 'undefined';
  }

  if (typeof arg === 'string') {
    return arg;
  }

  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }

  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  return String(arg);
}
