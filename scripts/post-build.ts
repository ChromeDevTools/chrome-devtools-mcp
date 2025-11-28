/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import tsConfig from '../tsconfig.json' with {type: 'json'};

import {sed} from './sed.ts';

const BUILD_DIR = path.join(process.cwd(), 'build');

/**
 * Writes content to a file.
 * @param filePath The path to the file.
 * @param content The content to write.
 */
function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Ensures that licenses for third party files we use gets copied into the build/ dir.
 */
function copyThirdPartyLicenseFiles() {
  const thirdPartyDirectories = tsConfig.include.filter(location => {
    return location.includes(
      'node_modules/chrome-devtools-frontend/front_end/third_party',
    );
  });

  for (const thirdPartyDir of thirdPartyDirectories) {
    const fullPath = path.join(process.cwd(), thirdPartyDir);
    const licenseFile = path.join(fullPath, 'LICENSE');
    if (!fs.existsSync(licenseFile)) {
      console.error('No LICENSE for', path.basename(thirdPartyDir));
    }

    const destinationDir = path.join(BUILD_DIR, thirdPartyDir);
    const destinationFile = path.join(destinationDir, 'LICENSE');
    fs.copyFileSync(licenseFile, destinationFile);
  }
}

function main(): void {
  const devtoolsThirdPartyPath =
    'node_modules/chrome-devtools-frontend/front_end/third_party';
  const devtoolsFrontEndCorePath =
    'node_modules/chrome-devtools-frontend/front_end/core';

  // Create i18n mock
  const i18nDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'i18n');
  const localesFile = path.join(i18nDir, 'locales.js');
  const localesContent = `
export const LOCALES = [
  'en-US',
];

export const BUNDLED_LOCALES = [
  'en-US',
];

export const DEFAULT_LOCALE = 'en-US';

export const REMOTE_FETCH_PATTERN = '@HOST@/remote/serve_file/@VERSION@/core/i18n/locales/@LOCALE@.json';

export const LOCAL_FETCH_PATTERN = './locales/@LOCALE@.json';`;
  writeFile(localesFile, localesContent);

  // Create codemirror.next mock.
  const codeMirrorDir = path.join(
    BUILD_DIR,
    devtoolsThirdPartyPath,
    'codemirror.next',
  );
  fs.mkdirSync(codeMirrorDir, {recursive: true});
  const codeMirrorFile = path.join(codeMirrorDir, 'codemirror.next.js');
  const codeMirrorContent = `export default {}`;
  writeFile(codeMirrorFile, codeMirrorContent);

  // Create root mock
  const rootDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'root');
  fs.mkdirSync(rootDir, {recursive: true});
  const runtimeFile = path.join(rootDir, 'Runtime.js');
  const runtimeContent = `
export function getChromeVersion() { return ''; };
export const hostConfig = {};
export const Runtime = {
  isDescriptorEnabled: () => true,
  queryParam: () => null,
}
export const experiments = {
  isEnabled: () => false,
}
  `;
  writeFile(runtimeFile, runtimeContent);

  // Update protocol_client to remove:
  // 1. self.Protocol assignment
  // 2. Call to register backend commands.
  const protocolClientDir = path.join(
    BUILD_DIR,
    devtoolsFrontEndCorePath,
    'protocol_client',
  );
  const clientFile = path.join(protocolClientDir, 'protocol_client.js');
  const globalAssignment = /self\.Protocol = self\.Protocol \|\| \{\};/;
  const registerCommands =
    /InspectorBackendCommands\.registerCommands\(InspectorBackend\.inspectorBackend\);/;
  sed(clientFile, globalAssignment, '');
  sed(clientFile, registerCommands, '');

  const devtoolsLicensePath = path.join(
    'node_modules',
    'chrome-devtools-frontend',
    'LICENSE',
  );
  const devtoolsLicenseFileSource = path.join(
    process.cwd(),
    devtoolsLicensePath,
  );
  const devtoolsLicenseFileDestination = path.join(
    BUILD_DIR,
    devtoolsLicensePath,
  );
  fs.copyFileSync(devtoolsLicenseFileSource, devtoolsLicenseFileDestination);

  copyThirdPartyLicenseFiles();
  copyDevToolsDescriptionFiles();
}

function copyDevToolsDescriptionFiles() {
  const devtoolsIssuesDescriptionPath =
    'node_modules/chrome-devtools-frontend/front_end/models/issues_manager/descriptions';
  const sourceDir = path.join(process.cwd(), devtoolsIssuesDescriptionPath);
  const destDir = path.join(BUILD_DIR, devtoolsIssuesDescriptionPath);
  fs.cpSync(sourceDir, destDir, {recursive: true});
}

main();
