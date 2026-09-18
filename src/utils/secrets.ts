/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {displayPath, getDataFolder} from './paths.js';

/**
 * Secret values are read from here and spliced into input just before it is
 * dispatched to the browser, so that the plaintext never has to be passed to
 * the tool (and therefore never enters the transcript).
 */
export const SECRETS_DIR =
  process.env.CHROME_DEVTOOLS_MCP_SECRETS_DIR ||
  path.join(getDataFolder(), 'secrets');

/**
 * Spellings used in all user-facing text, with the home directory written as
 * `~` so the text does not bake in the account the server runs as.
 */
export const SECRETS_DIR_DISPLAY = displayPath(SECRETS_DIR);

/**
 * Reusable scripts are read from here so that a caller does not have to
 * include the same code in every call. The code itself is still sent to the
 * browser each time; only the caller is spared repeating it. Unlike a secret,
 * a script is never consumed.
 */
export const SCRIPTS_DIR =
  process.env.CHROME_DEVTOOLS_MCP_SCRIPTS_DIR ||
  path.join(getDataFolder(), 'scripts');

export const SCRIPTS_DIR_DISPLAY = displayPath(SCRIPTS_DIR);

interface Store {
  dir: string;
  display: string;
  kind: string;
}

const SECRETS: Store = {
  dir: SECRETS_DIR,
  display: SECRETS_DIR_DISPLAY,
  kind: 'secret',
};

const SCRIPTS: Store = {
  dir: SCRIPTS_DIR,
  display: SCRIPTS_DIR_DISPLAY,
  kind: 'script',
};

/** `{{script:NAME}}`. Takes no modifiers. */
const SCRIPT_PLACEHOLDER = /\{\{script:([^{}]+)\}\}/g;

/** `{{secret:NAME}}`, with optional `:raw` and `:keep` in any order. */
const SECRET_PLACEHOLDER = /\{\{secret:([^{}]+)\}\}/g;

const VALID_NAME = /^[A-Za-z0-9._-]+$/;

interface ParsedSecret {
  name: string;
  /** Keep the trailing newline. */
  raw: boolean;
  /** Do not delete the secret file after it has been used. */
  keep: boolean;
}

/**
 * A script takes no modifiers: it is meant to be reused, so it is never
 * consumed, and it is code, so it is always used exactly as stored.
 */
function parseScript(inner: string): string {
  const [name, ...modifiers] = inner.split(':');
  if (modifiers.length > 0) {
    throw new Error(
      `{{script:${inner}}} takes no modifiers: a script is never consumed and is always used exactly as stored.`,
    );
  }
  return name;
}

function parseSecret(inner: string): ParsedSecret {
  const [name, ...modifiers] = inner.split(':');
  let raw = false;
  let keep = false;
  for (const modifier of modifiers) {
    if (modifier === 'raw') {
      raw = true;
    } else if (modifier === 'keep') {
      keep = true;
    } else {
      throw new Error(
        `Unknown modifier ":${modifier}" in {{secret:${inner}}}. Supported modifiers are ":raw" and ":keep".`,
      );
    }
  }
  return {name, raw, keep};
}

/**
 * Resolves a bare name to a file inside `dir`. Only basenames are accepted:
 * path separators, `.`/`..` and absolute paths are rejected so that a
 * reference can never escape the directory.
 */
function resolveName(store: Store, name: string): string {
  if (!VALID_NAME.test(name) || name === '.' || name === '..') {
    throw new Error(
      `Invalid ${store.kind} name "${name}". Use a plain file name (letters, digits, ".", "_", "-") of a file in ${store.display}.`,
    );
  }
  return path.join(store.dir, name);
}

async function readFileIn(store: Store, name: string): Promise<string> {
  const filePath = resolveName(store, name);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `No ${store.kind} named "${name}" found at ${store.display}/${name}.`,
      );
    }
    throw error;
  }
}

/**
 * Files usually end with a trailing newline that is not part of the secret.
 */
function stripTrailingNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

export interface ResolvedPlaceholders {
  /** The text with every placeholder replaced by the file's contents. */
  value: string;
  /** Names of the secrets that were substituted, in order of first use. */
  names: string[];
  /**
   * Names of the secrets to delete once they have been used successfully,
   * i.e. every referenced secret that was not marked `:keep`.
   */
  consume: string[];
}

/**
 * Resolves placeholders in exactly two passes:
 *
 * 1. `{{script:NAME}}` is replaced with the contents of
 *    {@link SCRIPTS_DIR}/NAME, exactly as stored.
 * 2. `{{secret:NAME}}` is replaced with the contents of
 *    {@link SECRETS_DIR}/NAME, including any that came from a script in
 *    pass 1. A trailing newline is stripped unless `:raw` is given.
 *
 * Substituted content is never rescanned, so a script cannot pull in another
 * script and a secret's value is never interpreted as a placeholder.
 *
 * Text without placeholders is returned unchanged.
 */
export async function resolvePlaceholders(
  text: string,
): Promise<ResolvedPlaceholders> {
  // Pass 1: scripts.
  const scriptMatches = [...text.matchAll(SCRIPT_PLACEHOLDER)];
  let value = text;
  if (scriptMatches.length > 0) {
    const scripts = new Map<string, string>();
    for (const [placeholder, inner] of scriptMatches) {
      if (scripts.has(placeholder)) {
        continue;
      }
      scripts.set(placeholder, await readFileIn(SCRIPTS, parseScript(inner)));
    }
    value = value.replace(SCRIPT_PLACEHOLDER, match => {
      return scripts.get(match) ?? match;
    });
  }

  // Pass 2: secrets, including any a script brought in.
  const secretMatches = [...value.matchAll(SECRET_PLACEHOLDER)];
  if (secretMatches.length === 0) {
    return {value, names: [], consume: []};
  }

  const names: string[] = [];
  const consume: string[] = [];
  const values = new Map<string, string>();
  for (const [placeholder, inner] of secretMatches) {
    const {name, raw, keep} = parseSecret(inner);
    if (!values.has(placeholder)) {
      const contents = await readFileIn(SECRETS, name);
      values.set(placeholder, raw ? contents : stripTrailingNewline(contents));
    }
    if (!names.includes(name)) {
      names.push(name);
    }
    // Any use without `:keep` consumes the secret, even if another
    // placeholder for the same name asked to keep it.
    if (!keep && !consume.includes(name)) {
      consume.push(name);
    }
  }

  value = value.replace(SECRET_PLACEHOLDER, match => {
    return values.get(match) ?? match;
  });

  return {value, names, consume};
}

/**
 * Deletes the named secret files. Missing files are ignored so that the same
 * secret can be consumed by several calls.
 */
export async function deleteSecrets(names: string[]): Promise<void> {
  for (const name of names) {
    await fs.rm(resolveName(SECRETS, name), {force: true});
  }
}

export const scriptPlaceholderHint =
  `To run the same code repeatedly without writing it out in every call, store it in ${SCRIPTS_DIR_DISPLAY}/NAME and pass ` +
  `\`{{script:NAME}}\`, which this MCP server replaces with that file's contents exactly as stored. ` +
  `A script takes no modifiers: it is never deleted, and it is never trimmed.`;

export const placeholderHint =
  `May contain \`{{secret:NAME}}\`, which is replaced with the contents of ${SECRETS_DIR_DISPLAY}/NAME ` +
  `by this MCP server just before the input is sent to the browser, so the secret never has to be passed to this tool. ` +
  `Stage such files by reference (e.g. \`pass show x > ${SECRETS_DIR_DISPLAY}/x\`), never by writing the literal value. ` +
  `The secret file is DELETED once the call succeeds; append \`:keep\` (\`{{secret:NAME:keep}}\`) to keep it for later calls. ` +
  `Append \`:raw\` (\`{{secret:NAME:raw}}\`, \`{{secret:NAME:raw:keep}}\`) to keep a trailing newline. ` +
  `The directory can be relocated with the CHROME_DEVTOOLS_MCP_SECRETS_DIR environment variable. ` +
  `ALWAYS pick a unique, specific NAME (e.g. "github-login-7f3a" rather than "pw"): ` +
  `${SECRETS_DIR_DISPLAY} is shared by all MCP servers running in parallel, so a generic name can be overwritten by ` +
  `another session and make you fill the wrong value, or be deleted while you still need it.`;
