/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file Writes THIRD_PARTY_NOTICES and bundled-packages.json for the bundles
 * in src/third_party. The esbuild metafiles list the files included in each
 * bundle. Based on `generateThirdPartyNotices` in Lighthouse's
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
const FRONT_END_THIRD_PARTY_SEGMENT = '/front_end/third_party/';

const projectRoot = path.join(import.meta.dirname, '..');
const standaloneDevToolsRoot = path.join(
  projectRoot,
  'third_party',
  'devtools-frontend',
);
const devtoolsRoot = fs.existsSync(
  path.join(standaloneDevToolsRoot, 'front_end'),
)
  ? standaloneDevToolsRoot
  : path.join(projectRoot, '..');

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

function getNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const property = value[key];
  return typeof property === 'number' ? property : undefined;
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

function writeIfChanged(filePath: string, content: string): void {
  try {
    if (fs.readFileSync(filePath, 'utf-8') === content) {
      return;
    }
  } catch {
    // File does not exist yet.
  }
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, content);
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

function isVirtualModule(modulePath: string): boolean {
  return (
    /^(?:[a-z][a-z0-9+.-]+|\([^)]+\)):/i.test(modulePath) ||
    modulePath.startsWith('<')
  );
}

function resolveMetafileInputPath(
  metafilePath: string,
  inputPath: string,
): string {
  const fromCwd = path.resolve(inputPath);
  if (fs.existsSync(fromCwd)) {
    return fromCwd.replaceAll('\\', '/');
  }
  const normalizedMeta = path.resolve(metafilePath).replaceAll('\\', '/');
  const genIndex = normalizedMeta.indexOf('/gen/');
  if (genIndex > 0) {
    const buildRoot = normalizedMeta.slice(0, genIndex);
    const fromBuildRoot = path.resolve(buildRoot, inputPath);
    if (fs.existsSync(fromBuildRoot)) {
      return fromBuildRoot.replaceAll('\\', '/');
    }
  }
  return fromCwd.replaceAll('\\', '/');
}

/**
 * Returns the non-tree-shaken input files of all bundles as absolute
 * forward-slash normalized paths.
 */
function readBundledFiles(metafiles: string[]): Set<string> {
  const files = new Set<string>();
  for (const metafilePath of metafiles) {
    const metafile = readJson(metafilePath);
    const outputs = getRecord(metafile, 'outputs');
    const jsOutputs = Object.entries(outputs).filter(([outputPath]) =>
      outputPath.endsWith('.js'),
    );
    if (jsOutputs.length === 0) {
      throw new Error(`No .js output found in metafile ${metafilePath}`);
    }
    for (const [, output] of jsOutputs) {
      const inputs = getRecord(output, 'inputs');
      for (const [inputPath, info] of Object.entries(inputs)) {
        if (isVirtualModule(inputPath)) {
          continue;
        }
        const bytesInOutput = getNumber(info, 'bytesInOutput');
        if (bytesInOutput === undefined || bytesInOutput <= 0) {
          continue;
        }
        files.add(resolveMetafileInputPath(metafilePath, inputPath));
      }
    }
  }
  return files;
}

/** Returns the absolute directory of the npm package that contains `file`. */
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
  const pkg = readJson(path.join(packageDir, 'package.json'));
  const name = getString(pkg, 'name');
  const license = getString(pkg, 'license');
  if (!name) {
    throw new Error(`Missing package name in ${packageDir}/package.json`);
  }
  if (!license) {
    throw new Error(`Missing license in ${packageDir}/package.json`);
  }
  assertAllowedLicense(license, packageDir);
  const licenseFile = findLicenseFile(packageDir);
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
  const readmePath = path.join(devtoolsRoot, directory, 'README.chromium');
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
    devtoolsRoot,
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
      cwd: devtoolsRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
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
  devDependencies['puppeteer-core'] ??= devDependencies['puppeteer'];
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
  writeIfChanged(outputPath, JSON.stringify(bundled, null, 2));
}

function main(): void {
  const {values} = parseArgs({
    options: {
      metafile: {type: 'string', multiple: true, default: []},
      notices: {type: 'string'},
      'bundled-packages': {type: 'string'},
    },
    strict: true,
  });
  const noticesPath = values.notices;
  const bundledPackagesPath = values['bundled-packages'];
  if (!values.metafile.length || !noticesPath || !bundledPackagesPath) {
    throw new Error(
      'Usage: generate-third-party-notices.ts --metafile <path>... ' +
        '--notices <path> --bundled-packages <path>',
    );
  }

  const packageDirs = new Set<string>();
  const devToolsThirdPartyDirs = new Set<string>();
  for (const file of readBundledFiles(values.metafile)) {
    const packageDir = getPackageDir(file);
    if (packageDir) {
      packageDirs.add(packageDir);
      continue;
    }
    // Generated files are in the build directory, under the same path.
    const index = file.lastIndexOf(FRONT_END_THIRD_PARTY_SEGMENT);
    if (index >= 0) {
      const name = file
        .slice(index + FRONT_END_THIRD_PARTY_SEGMENT.length)
        .split('/')[0];
      devToolsThirdPartyDirs.add(`front_end/third_party/${name}`);
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
      licenseText: readText(path.join(devtoolsRoot, 'LICENSE')),
    }),
    [
      'Name: lighthouse',
      'License: Apache-2.0',
      '',
      readText(
        path.join(devtoolsRoot, 'front_end/third_party/lighthouse/LICENSE'),
      ),
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
  writeIfChanged(
    noticesPath,
    `${notices.join(DIVIDER).trim()}${DIVIDER}${lighthouseNotices}`,
  );

  const bundledNames = new Set(
    Array.from(packageNotices.values(), notice => notice.name),
  );
  writeBundledPackages(bundledPackagesPath, bundledNames, devToolsCommit);
}

main();
