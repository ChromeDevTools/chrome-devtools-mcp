// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { writeIfChanged } from '../../../scripts/build/ninja/write-if-changed.js';
const yargsObject = yargs(hideBin(process.argv))
    .option('target-gen-dir', {
    type: 'string',
    demandOption: true,
})
    .option('remote-locales', {
    type: 'array',
    demandOption: true,
})
    .option('bundled-locales', {
    type: 'array',
    demandOption: true,
})
    .option('default-locale', {
    type: 'string',
    demandOption: true,
})
    .option('remote-fetch-pattern', {
    type: 'string',
    demandOption: true,
})
    .option('local-fetch-pattern', {
    type: 'string',
    demandOption: true,
})
    .strict()
    .parseSync();
const remoteLocaleList = yargsObject['remote-locales'].map(locale => `\n  '${locale}',`).join('');
const bundledLocaleList = yargsObject['bundled-locales'].map(locale => `\n  '${locale}',`).join('');
const allLocales = `[${remoteLocaleList}${bundledLocaleList}\n]`;
const bundledLocales = `[${bundledLocaleList}\n]`;
const content = `
export const LOCALES = ${allLocales};

export const BUNDLED_LOCALES = ${bundledLocales};

export const DEFAULT_LOCALE = '${yargsObject['default-locale']}';

export const REMOTE_FETCH_PATTERN = '${yargsObject['remote-fetch-pattern']}';

export const LOCAL_FETCH_PATTERN = '${yargsObject['local-fetch-pattern']}';
`;
await writeIfChanged(path.join(yargsObject['target-gen-dir'], 'locales.js'), content);
//# sourceMappingURL=generate-locales-js.js.map