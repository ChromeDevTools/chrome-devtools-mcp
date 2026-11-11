/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file Writes THIRD_PARTY_NOTICES and bundled-packages.json for the bundles
 * in src/third_party. The esbuild depfiles list the files of each bundle.
 * Based on `generateThirdPartyNotices` in Lighthouse's
 * build/build-bundle-mcp.js.
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

const ALLOWED_LICENSES = [
  'MIT',
  'Apache 2.0',
  'Apache-2.0',
  'BSD-3-Clause',
  'BSD-2-Clause',
  'ISC',
  '0BSD',
];

const DIVIDER =
  '\n\n-------------------- DEPENDENCY DIVIDER --------------------\n\n';

const DEVTOOLS_URL = 'https://github.com/ChromeDevTools/devtools-frontend';
const DEVTOOLS_DIR = 'third_party/devtools-frontend';
const DEVTOOLS_THIRD_PARTY_DIR = `${DEVTOOLS_DIR}/front_end/third_party`;

const projectRoot = path.join(import.meta.dirname, '..');

interface Notice {
  name: string;
  url?: string;
  version?: string;
  license: string;
  // Some packages (for example puppeteer-core) ship no license file.
  licenseText?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const property = value[key];
  return typeof property === 'string' ? property : undefined;
}

function getRecord(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const property = value[key];
  return isRecord(property) ? property : {};
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8').replaceAll('\r', '');
}

function formatNotice(notice: Notice): string {
  const lines = [
    `Name: ${notice.name}`,
    `URL: ${notice.url ?? 'N/A'}`,
    `Version: ${notice.version ?? 'N/A'}`,
    `License: ${notice.license}`,
  ];
  if (notice.licenseText !== undefined) {
    lines.push('', notice.licenseText);
  }
  return lines.join('\n');
}

function assertAllowedLicense(license: string, source: string): void {
  const licenses = license.split(',').map(name => name.trim());
  if (!licenses.every(name => ALLOWED_LICENSES.includes(name))) {
    throw new Error(
      `License violation in ${source}: "${license}" is not in ALLOWED_LICENSES`,
    );
  }
}

/** Returns the files of all bundles as paths relative to the project root. */
function readBundledFiles(depfiles: string[]): Set<string> {
  const files = new Set<string>();
  for (const depfile of depfiles) {
    const content = fs.readFileSync(depfile, 'utf-8');
    const inputs = content.slice(content.indexOf(': ') + 2);
    for (const input of inputs.split(/\s+/)) {
      if (input) {
        const relativePath = path.relative(projectRoot, path.resolve(input));
        files.add(relativePath.replaceAll('\\', '/'));
      }
    }
  }
  return files;
}

/** Returns the directory of the npm package that contains `file`. */
function getPackageDir(file: string): string | undefined {
  const segments = file.split('/');
  const index = segments.lastIndexOf('node_modules');
  if (index < 0) {
    return undefined;
  }
  const length = segments[index + 1]?.startsWith('@') ? 3 : 2;
  if (segments.length <= index + length) {
    return undefined;
  }
  return segments.slice(0, index + length).join('/');
}

function findLicenseFile(directory: string): string | undefined {
  const name = fs
    .readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort()
    .find(candidate => /^licen[sc]e/i.test(candidate));
  return name ? path.join(directory, name) : undefined;
}

function readPackageNotice(packageDir: string): Notice {
  const directory = path.join(projectRoot, packageDir);
  const pkg = readJson(path.join(directory, 'package.json'));
  const name = getString(pkg, 'name');
  const license = getString(pkg, 'license');
  if (!name) {
    throw new Error(`Missing package name in ${packageDir}/package.json`);
  }
  if (!license) {
    throw new Error(`Missing license in ${packageDir}/package.json`);
  }
  assertAllowedLicense(license, packageDir);
  const licenseFile = findLicenseFile(directory);
  return {
    name,
    url:
      getString(pkg, 'homepage') ??
      getString(pkg, 'repository') ??
      getString(getRecord(pkg, 'repository'), 'url'),
    version: getString(pkg, 'version'),
    license,
    licenseText: licenseFile ? readText(licenseFile) : undefined,
  };
}

function parseReadmeChromium(directory: string): Record<string, string> {
  const readmePath = path.join(projectRoot, directory, 'README.chromium');
  if (!fs.existsSync(readmePath)) {
    throw new Error(`Missing README.chromium in ${directory}`);
  }
  const fields: Record<string, string> = {};
  for (const line of fs.readFileSync(readmePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Description:')) {
      break;
    }
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      fields[key] = trimmed.slice(colonIndex + 1).trim();
    }
  }
  return fields;
}

function readDevToolsThirdPartyNotice(directory: string): Notice {
  const metadata = parseReadmeChromium(directory);
  const license = metadata['License'];
  if (!license) {
    throw new Error(`Missing license in ${directory}/README.chromium`);
  }
  assertAllowedLicense(license, directory);
  const licenseFile = path.join(
    projectRoot,
    directory,
    metadata['License File'] || 'LICENSE',
  );
  if (!fs.existsSync(licenseFile)) {
    throw new Error(`Missing license file ${licenseFile} for ${directory}`);
  }
  return {
    name:
      metadata['Short Name'] || metadata['Name'] || path.basename(directory),
    url: metadata['URL'],
    version: metadata['Version'],
    license,
    licenseText: readText(licenseFile),
  };
}

function getDevToolsCommit(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: path.join(projectRoot, DEVTOOLS_DIR),
      encoding: 'utf-8',
    }).trim();
  } catch {
    return undefined;
  }
}

function writeBundledPackages(
  outputPath: string,
  bundledNames: Set<string>,
  devToolsCommit: string | undefined,
): void {
  const devDependencies = getRecord(
    readJson(path.join(projectRoot, 'package.json')),
    'devDependencies',
  );
  // Only puppeteer-core is bundled from the puppeteer package.
  devDependencies['puppeteer-core'] = devDependencies['puppeteer'];
  const lockedPackages = getRecord(
    readJson(path.join(projectRoot, 'package-lock.json')),
    'packages',
  );

  const bundled: Record<string, unknown> = {};
  for (const [name, versionRange] of Object.entries(devDependencies)) {
    // The Lighthouse bundle is checked in and not built here.
    if (bundledNames.has(name) || name === 'lighthouse') {
      const lockedVersion = getString(
        lockedPackages[`node_modules/${name}`],
        'version',
      );
      bundled[name] = lockedVersion ?? versionRange;
    }
  }
  if (devToolsCommit) {
    bundled[DEVTOOLS_URL] = devToolsCommit;
  }
  fs.writeFileSync(outputPath, JSON.stringify(bundled, null, 2));
}

function main(): void {
  const {values} = parseArgs({
    options: {
      depfile: {type: 'string', multiple: true, default: []},
      notices: {type: 'string'},
      'bundled-packages': {type: 'string'},
    },
    strict: true,
  });
  const noticesPath = values.notices;
  const bundledPackagesPath = values['bundled-packages'];
  if (!values.depfile.length || !noticesPath || !bundledPackagesPath) {
    throw new Error(
      'Usage: generate-third-party-notices.ts --depfile <path>... ' +
        '--notices <path> --bundled-packages <path>',
    );
  }

  const packageDirs = new Set<string>();
  const devToolsThirdPartyDirs = new Set<string>();
  for (const file of readBundledFiles(values.depfile)) {
    const packageDir = getPackageDir(file);
    if (packageDir) {
      packageDirs.add(packageDir);
      continue;
    }
    // Generated files are in the build directory, under the same path.
    const index = file.indexOf(`${DEVTOOLS_THIRD_PARTY_DIR}/`);
    if (index >= 0) {
      const name = file
        .slice(index + DEVTOOLS_THIRD_PARTY_DIR.length + 1)
        .split('/')[0];
      devToolsThirdPartyDirs.add(`${DEVTOOLS_THIRD_PARTY_DIR}/${name}`);
    }
  }

  // Two installed versions of one package get one notice each.
  const packageNotices = new Map<string, Notice>();
  for (const packageDir of packageDirs) {
    const notice = readPackageNotice(packageDir);
    packageNotices.set(`${notice.name}:${notice.version}`, notice);
  }
  const notices = Array.from(packageNotices.values())
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'en') ||
        (a.version ?? '').localeCompare(b.version ?? '', 'en', {numeric: true}),
    )
    .map(formatNotice);

  const devToolsCommit = getDevToolsCommit();
  notices.push(
    formatNotice({
      name: 'devtools-frontend',
      url: DEVTOOLS_URL,
      version: devToolsCommit,
      license: 'Apache-2.0',
      licenseText: readText(path.join(projectRoot, DEVTOOLS_DIR, 'LICENSE')),
    }),
    [
      'Name: lighthouse',
      'License: Apache-2.0',
      '',
      readText(path.join(projectRoot, 'node_modules/lighthouse/LICENSE')),
    ].join('\n'),
  );
  for (const directory of Array.from(devToolsThirdPartyDirs).sort()) {
    notices.push(formatNotice(readDevToolsThirdPartyNotice(directory)));
  }

  const lighthouseNotices = fs.readFileSync(
    path.join(
      projectRoot,
      'src/third_party/LIGHTHOUSE_MCP_BUNDLE_THIRD_PARTY_NOTICES',
    ),
    'utf-8',
  );
  fs.writeFileSync(
    noticesPath,
    `${notices.join(DIVIDER).trim()}${DIVIDER}${lighthouseNotices}`,
  );

  const bundledNames = new Set(
    Array.from(packageNotices.values(), notice => notice.name),
  );
  writeBundledPackages(bundledPackagesPath, bundledNames, devToolsCommit);
}

main();
