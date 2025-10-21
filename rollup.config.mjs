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
 * @fileoverview take from {@link https://github.com/GoogleChromeLabs/chromium-bidi/blob/main/rollup.config.mjs | chromium-bidi}
 * and modified to specific requirement.
 */

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

/**
 * @param {string} wrapperIndexPath
 * @param {import('rollup').OutputOptions} [extraOutputOptions={}]
 * @param {import('rollup').ExternalOption} [external=[]]
 * @returns {import('rollup').RollupOptions}
 */
const bundleDependency = (
  wrapperIndexPath,
  extraOutputOptions = {},
  external = [],
) => ({
  input: wrapperIndexPath,
  output: {
    ...extraOutputOptions,
    file: wrapperIndexPath,
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
          file: path.join(
            path.dirname(wrapperIndexPath),
            'THIRD_PARTY_NOTICES',
          ),
          template(dependencies) {
            const stringified_dependencies = dependencies.map(dependency => {
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
            const divider =
              '\n\n-------------------- DEPENDENCY DIVIDER --------------------\n\n';
            return stringified_dependencies.join(divider);
          },
        },
      },
    }),
    commonjs(),
    json(),
    nodeResolve(),
  ],
  external,
});

export default [
  bundleDependency(
    './build/src/third_party/index.js',
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
];
