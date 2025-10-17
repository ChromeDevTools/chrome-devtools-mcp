/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import tsConfig from '../tsconfig.json' with {type: 'json'};

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
 * Replaces content in a file.
 * @param filePath The path to the file.
 * @param find The regex to find.
 * @param replace The string to replace with.
 */
function sed(filePath: string, find: RegExp, replace: string): void {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found for sed operation: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const newContent = content.replace(find, replace);
  fs.writeFileSync(filePath, newContent, 'utf-8');
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
  fs.mkdirSync(i18nDir, {recursive: true});
  const i18nFile = path.join(i18nDir, 'i18n.js');
  const i18nContent = `
export const i18n = {
  registerUIStrings: () => {},
  getLocalizedString: (_, str) => {
    // So that the string passed in gets output verbatim.
    return str;
  },
  lockedLazyString: () => {},
  getLazilyComputedLocalizedString: () => {},
};

// TODO(jacktfranklin): once the DocumentLatency insight does not depend on
// this method, we can remove this stub.
export const TimeUtilities = {
  millisToString(x) {
    const separator = '\xA0';
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'unit',
      unitDisplay: 'narrow',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      unit: 'millisecond',
    });

    const parts = formatter.formatToParts(x);
    for (const part of parts) {
      if (part.type === 'literal') {
        if (part.value === ' ') {
          part.value = separator;
        }
      }
    }

    return parts.map(part => part.value).join('');
  }
};

// TODO(jacktfranklin): once the ImageDelivery insight does not depend on this method, we can remove this stub.
export const ByteUtilities = {
  bytesToString(x) {
    const separator = '\xA0';
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'unit',
      unit: 'kilobyte',
      unitDisplay: 'narrow',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const parts = formatter.formatToParts(x / 1000);
    for (const part of parts) {
      if (part.type === 'literal') {
        if (part.value === ' ') {
          part.value = separator;
        }
      }
    }

    return parts.map(part => part.value).join('');
  }
};`;
  writeFile(i18nFile, i18nContent);

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
}

main();
