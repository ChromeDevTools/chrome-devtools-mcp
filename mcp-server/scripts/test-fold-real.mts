// Quick test: call folding ranges on a real TS file with imports
import { dragraceGetFoldingRanges, dragraceGetDocumentSymbols } from '../src/client-pipe.js';
import path from 'node:path';

const targetFile = path.resolve(
  import.meta.dirname,
  '../../extension/services/codebase/parsers.ts'
);

console.log(`\nTarget: ${targetFile}\n`);

// Get folding ranges
const foldResult = await dragraceGetFoldingRanges(targetFile);
console.log(`Total folding ranges: ${foldResult.ranges.length}`);

// Show ranges with kind
const withKind = foldResult.ranges.filter(r => r.kind);
console.log(`Ranges with kind: ${withKind.length}`);
for (const r of withKind) {
  console.log(`  Lines ${r.start}-${r.end} kind="${r.kind}"`);
}

// Show first 10 ranges
console.log(`\nFirst 10 ranges:`);
for (const r of foldResult.ranges.slice(0, 10)) {
  console.log(`  Lines ${r.start}-${r.end}${r.kind ? ` kind="${r.kind}"` : ''}`);
}

// Get document symbols for the same file
const symResult = await dragraceGetDocumentSymbols(targetFile);
console.log(`\nTotal symbols: ${symResult.symbols.length}`);

// Show first 10 symbols
console.log(`\nFirst 10 symbols:`);
for (const s of symResult.symbols.slice(0, 10)) {
  console.log(`  ${s.kind} "${s.name}" L${s.range.startLine}-${s.range.endLine}`);
}

// Cross-reference: find folding ranges that DON'T match any symbol
function getAllSymbolLines(symbols, lines = new Set()) {
  for (const s of symbols) {
    lines.add(s.range.startLine);
    if (s.children) getAllSymbolLines(s.children, lines);
  }
  return lines;
}

const symLines = getAllSymbolLines(symResult.symbols);
const unmatchedFolds = foldResult.ranges.filter(r => !symLines.has(r.start));
console.log(`\nFolding ranges with NO matching symbol: ${unmatchedFolds.length}/${foldResult.ranges.length}`);
console.log(`First 15 unmatched:`);
for (const r of unmatchedFolds.slice(0, 15)) {
  console.log(`  Lines ${r.start}-${r.end}${r.kind ? ` kind="${r.kind}"` : ''}`);
}
