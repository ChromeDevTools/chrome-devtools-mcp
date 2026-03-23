/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';

function parseSnapshot(filePath) {
  console.log(`Loading ${filePath}...`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const strings = data.strings;
  const nodes = data.nodes;
  const nodeFields = data.snapshot.meta.node_fields;
  const nodeFieldCount = nodeFields.length;

  const typeOffset = nodeFields.indexOf('type');
  const nameOffset = nodeFields.indexOf('name');
  const sizeOffset = nodeFields.indexOf('self_size');

  const nodeTypes = data.snapshot.meta.node_types[typeOffset];

  const counts = {};
  const sizes = {};

  for (let i = 0; i < nodes.length; i += nodeFieldCount) {
    const typeIdx = nodes[i + typeOffset];
    const typeName = nodeTypes[typeIdx];
    const nameIdx = nodes[i + nameOffset];
    const name = typeof nameIdx === 'number' ? strings[nameIdx] : nameIdx;
    const size = nodes[i + sizeOffset];

    // Ignore native primitives/arrays that clutter the output unless specifically looking for them
    if (
      typeName === 'string' ||
      typeName === 'number' ||
      typeName === 'array'
    ) {
      continue;
    }

    const key = `${typeName}::${name}`;
    counts[key] = (counts[key] || 0) + 1;
    sizes[key] = (sizes[key] || 0) + size;
  }
  return {counts, sizes};
}

const [, , file1, file2] = process.argv;
if (!file1 || !file2) {
  console.error(
    'Usage: node compare_snapshots.js <baseline.heapsnapshot> <target.heapsnapshot>',
  );
  process.exit(1);
}

try {
  const snap1 = parseSnapshot(file1);
  const snap2 = parseSnapshot(file2);

  const diffs = [];
  for (const key in snap2.counts) {
    const count1 = snap1.counts[key] || 0;
    const count2 = snap2.counts[key];
    const size1 = snap1.sizes[key] || 0;
    const size2 = snap2.sizes[key];

    if (count2 > count1) {
      diffs.push({
        key,
        countDiff: count2 - count1,
        sizeDiff: size2 - size1,
      });
    }
  }

  diffs.sort((a, b) => b.sizeDiff - a.sizeDiff);

  console.log('\n--- Top 10 growing objects by size ---');
  diffs.slice(0, 10).forEach(d => {
    console.log(`${d.key}: +${d.countDiff} objects, +${d.sizeDiff} bytes`);
  });

  // Look for common leak indicators
  const commonLeaks = diffs.filter(
    d =>
      d.key.toLowerCase().includes('detached') ||
      d.key.toLowerCase().includes('html') ||
      d.key.toLowerCase().includes('eventlistener') ||
      d.key.toLowerCase().includes('context') ||
      d.key.toLowerCase().includes('closure'),
  );

  commonLeaks.sort((a, b) => b.countDiff - a.countDiff);

  console.log('\n--- Top 3 most common types of memory leaks found ---');
  if (commonLeaks.length === 0) {
    console.log('No common DOM or Closure leaks detected.');
  } else {
    commonLeaks.slice(0, 3).forEach(d => {
      console.log(`${d.key}: +${d.countDiff} objects, +${d.sizeDiff} bytes`);
    });
  }
} catch (error) {
  console.error(
    'Error parsing snapshots. They might be too large for JSON.parse or invalid.',
  );
  console.error(error.message);
}
