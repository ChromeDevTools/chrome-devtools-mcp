// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { globSync } from 'node:fs';
import * as path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { writeIfChanged } from '../../../scripts/build/ninja/write-if-changed.js';
import { bakePlaceholders } from '../../../third_party/i18n/bake-ctc-to-lhl.js';
import { collectAllStringsInDir, createPsuedoLocaleStrings, IGNORED_PATH_COMPONENTS, } from '../../../third_party/i18n/collect-strings.js';
/** @typedef {import('../../../third_party/i18n/bake-ctc-to-lhl.js').CtcMessage} CtcMessage */
const yargsObject = yargs(hideBin(process.argv))
    .option('input-directories', {
    type: 'array',
    demandOption: true,
})
    .option('output-directory', {
    type: 'string',
    demandOption: true,
})
    .option('include-en-xl', {
    type: 'boolean',
})
    .strict()
    .parseSync();
/**
 * @param outputDirectory
 * @param locale
 * @param strings
 */
async function convertCtcToLhLAndSave(outputDirectory, locale, strings) {
    const outputPath = path.join(outputDirectory, `${locale}.json`);
    /** @type {Record<string, CtcMessage>} */
    const sortedCtcStrings = {};
    const sortedEntries = Object.entries(strings).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    for (const [key, defn] of sortedEntries) {
        sortedCtcStrings[key] = defn;
    }
    const convertedStrings = bakePlaceholders(sortedCtcStrings);
    await writeIfChanged(outputPath, JSON.stringify(convertedStrings, null, 2) + '\n');
}
const inputDirectories = yargsObject['input-directories'];
if (inputDirectories.length === 0) {
    throw new Error('Provide at least one directory!');
}
/** @type {Record<string, CtcMessage>} */
let collectedStrings = {};
/** @type {string[]} */
const files = [];
for (const directory of inputDirectories) {
    collectedStrings = {
        ...collectedStrings,
        ...collectAllStringsInDir(directory),
    };
    const fs = globSync('**/*.{js,ts,gn}', {
        cwd: directory,
        exclude: IGNORED_PATH_COMPONENTS,
    });
    files.push(...fs.map(f => path.join(directory, f)));
}
const outputDirectory = yargsObject['output-directory'];
await convertCtcToLhLAndSave(outputDirectory, 'en-US', collectedStrings);
if (yargsObject['include-en-xl']) {
    await convertCtcToLhLAndSave(outputDirectory, 'en-XL', createPsuedoLocaleStrings(collectedStrings));
}
// Write the depfile. This is necessary to properly rebuild en-US.json/en-XL.json
// when any of the input TS files change. We also re-build when any GN file changes,
// since new TS/JS files might have been added.
const depfile = `
${path.join(outputDirectory, 'en-US.json')}: ${files.join(' ')}
`;
await writeIfChanged(path.join(outputDirectory, 'collected-ui-strings.d'), depfile);
//# sourceMappingURL=collect-ui-strings.js.map