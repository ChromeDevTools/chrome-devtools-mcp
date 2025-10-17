/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import cleanup from 'rollup-plugin-cleanup';
import license from 'rollup-plugin-license';

const isProduction = process.env.NODE_ENV === 'production';

/** @type {import('rollup').RollupOptions} */
const sdk = {
  input: './build/src/third_party/modelcontextprotocol-sdk/index.js',
  output: {
    file: './build/src/third_party/modelcontextprotocol-sdk/index.js',
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
            let allowed_licenses = ['MIT', 'Apache 2.0', 'BSD-2-Clause', 'ISC'];
            return allowed_licenses.includes(dependency.license);
          },
          failOnUnlicensed: true,
          failOnViolation: true,
        },
        output: {
          file: path.join(
            'build',
            'src',
            'third_party',
            'modelcontextprotocol-sdk',
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
};

export default [sdk];
