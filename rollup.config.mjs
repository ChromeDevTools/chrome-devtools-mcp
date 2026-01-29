/**
 * Copyright 2021 Google LLC.
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview taken from {@link https://github.com/GoogleChromeLabs/chromium-bidi/blob/main/rollup.config.mjs | chromium-bidi}
 * and modified to specific requirement.
 */

import fs from 'node:fs';
import path from 'node:path';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import cleanup from 'rollup-plugin-cleanup';
import license from 'rollup-plugin-license';

const isProduction = process.env.NODE_ENV === 'production';

const allowedLicenses = [
  'MIT',
  'Apache 2.0',
  'Apache-2.0',
  'BSD-3-Clause',
  'BSD-2-Clause',
  'ISC',
  '0BSD',
];

const thirdPartyDir = './build/src/third_party';

const {devDependencies = {}} = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
);

// special case for puppeteer, from which we only bundle puppeteer-core
devDependencies['puppeteer-core'] = devDependencies['puppeteer'];

const aggregatedStats = {
  bundlesProcessed: 0,
  totalBundles: 0,
  bundledPackages: new Set(),
};

const projectNodeModulesPath =
  path.join(process.cwd(), 'node_modules') + path.sep;

function getPackageName(modulePath) {
  // Handle rollup's virtual module paths (paths starting with 0x00)
  const absolutePathStart = modulePath.indexOf(projectNodeModulesPath);
  if (absolutePathStart < 0) {
    return null;
  }

  const relativePath = modulePath.slice(
    projectNodeModulesPath.length + absolutePathStart,
  );
  const segments = relativePath.split(path.sep);

  // handle scoped packages
  if (segments[0].startsWith('@') && segments[1]) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}

/**
 * @returns {import('rollup').Plugin}
 */
function listBundledDeps() {
  aggregatedStats.totalBundles++;
  return {
    name: 'gather-bundled-dependencies',
    generateBundle(options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.modules) {
          // chunk.modules is an object where keys are the absolute file paths
          Object.keys(chunk.modules).forEach(modulePath => {
            const packageName = getPackageName(modulePath);
            if (packageName) {
              aggregatedStats.bundledPackages.add(packageName);
            }
          });
        }
      }
      aggregatedStats.bundlesProcessed++;

      // Only write the file when the last bundle is finished
      if (aggregatedStats.bundlesProcessed === aggregatedStats.totalBundles) {
        const outputPath = path.join(thirdPartyDir, 'bundled-packages.json');

        const bundledDevDeps = Object.fromEntries(
          Object.entries(devDependencies).filter(
            ([name]) =>
              aggregatedStats.bundledPackages.has(name) ||
              name === 'chrome-devtools-frontend',
          ),
        );

        fs.writeFileSync(outputPath, JSON.stringify(bundledDevDeps, null, 2));
      }
    },
  };
}

const seenDependencies = new Map();

/**
 * @param {string} wrapperIndexName
 * @param {import('rollup').OutputOptions} [extraOutputOptions={}]
 * @param {import('rollup').ExternalOption} [external=[]]
 * @returns {import('rollup').RollupOptions}
 */
const bundleDependency = (
  wrapperIndexName,
  extraOutputOptions = {},
  external = [],
) => ({
  input: path.join(thirdPartyDir, wrapperIndexName),
  output: {
    ...extraOutputOptions,
    file: path.join(thirdPartyDir, wrapperIndexName),
    sourcemap: !isProduction,
    format: 'esm',
  },
  plugins: [
    cleanup({
      // Keep license comments. Other comments are removed due to
      // http://b/390559299 and
      // https://github.com/microsoft/TypeScript/issues/60811.
      comments: [/Copyright/i],
    }),
    license({
      thirdParty: {
        allow: {
          test: dependency => {
            return allowedLicenses.includes(dependency.license);
          },
          failOnUnlicensed: true,
          failOnViolation: true,
        },
        output: {
          file: path.join(thirdPartyDir, 'THIRD_PARTY_NOTICES'),
          template(dependencies) {
            for (const dependency of dependencies) {
              const key = `${dependency.name}:${dependency.version}`;
              seenDependencies.set(key, dependency);
            }

            const stringifiedDependencies = Array.from(
              seenDependencies.values(),
            ).map(dependency => {
              let arr = [];
              arr.push(`Name: ${dependency.name ?? 'N/A'}`);
              let url = dependency.homepage ?? dependency.repository;
              if (url !== null && typeof url !== 'string') {
                url = url.url;
              }
              arr.push(`URL: ${url ?? 'N/A'}`);
              arr.push(`Version: ${dependency.version ?? 'N/A'}`);
              arr.push(`License: ${dependency.license ?? 'N/A'}`);
              if (dependency.licenseText !== null) {
                arr.push('');
                arr.push(dependency.licenseText.replaceAll('\r', ''));
              }
              return arr.join('\n');
            });

            // Manual license handling for chrome-devtools-frontend third_party
            const tsConfig = JSON.parse(
              fs.readFileSync(
                path.join(process.cwd(), 'tsconfig.json'),
                'utf-8',
              ),
            );
            const thirdPartyDirectories = tsConfig.include.filter(location =>
              location.includes(
                'node_modules/chrome-devtools-frontend/front_end/third_party',
              ),
            );

            const manualLicenses = [];
            // Add chrome-devtools-frontend main license
            const cdtfLicensePath = path.join(
              process.cwd(),
              'node_modules/chrome-devtools-frontend/LICENSE',
            );
            if (fs.existsSync(cdtfLicensePath)) {
              manualLicenses.push(
                [
                  'Name: chrome-devtools-frontend',
                  'License: Apache-2.0',
                  '',
                  fs.readFileSync(cdtfLicensePath, 'utf-8'),
                ].join('\n'),
              );
            }

            for (const thirdPartyDir of thirdPartyDirectories) {
              const fullPath = path.join(process.cwd(), thirdPartyDir);
              const licenseFile = path.join(fullPath, 'LICENSE');
              if (fs.existsSync(licenseFile)) {
                const name = path.basename(thirdPartyDir);
                manualLicenses.push(
                  [
                    `Name: ${name}`,
                    `License:`,
                    '',
                    fs.readFileSync(licenseFile, 'utf-8').replaceAll('\r', ''),
                  ].join('\n'),
                );
              }
            }

            if (manualLicenses.length > 0) {
              stringifiedDependencies.push(...manualLicenses);
            }

            const divider =
              '\n\n-------------------- DEPENDENCY DIVIDER --------------------\n\n';
            return stringifiedDependencies.join(divider);
          },
        },
      },
    }),
    listBundledDeps(),
    commonjs(),
    json(),
    nodeResolve(),
  ],
  external,
});

export default [
  bundleDependency(
    'index.js',
    {
      inlineDynamicImports: true,
    },
    (source, importer, _isResolved) => {
      if (
        source === 'yargs' &&
        importer &&
        importer.includes('puppeteer-core')
      ) {
        return true;
      }

      const existingExternals = ['./bidi.js', '../bidi/bidi.js'];
      if (existingExternals.includes(source)) {
        return true;
      }

      return false;
    },
  ),
  bundleDependency(
    'devtools-formatter-worker.js',
    {
      inlineDynamicImports: true,
    },
    (_source, _importer, _isResolved) => false,
  ),
];
