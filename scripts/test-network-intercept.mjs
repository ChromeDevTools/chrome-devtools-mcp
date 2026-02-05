#!/usr/bin/env node
/**
 * Network Intercept PoC Test Script
 *
 * Sends a question to ChatGPT/Gemini and observes raw network data captured
 * via CDP Network domain. This is for protocol format discovery.
 *
 * Usage:
 *   npm run test:network -- chatgpt
 *   npm run test:network -- gemini
 *   npm run test:network -- chatgpt "custom question"
 *   npm run test:network -- chatgpt --raw   # Full raw frame dump
 */

import {
  getClient,
  askChatGPTFastWithTimings,
  askGeminiFastWithTimings,
} from '../build/src/fast-cdp/fast-chat.js';
import {NetworkInterceptor} from '../build/src/fast-cdp/network-interceptor.js';

const target = process.argv[2] || 'chatgpt';
const rawMode = process.argv.includes('--raw');
const questionArg = process.argv.find((a, i) => i >= 3 && !a.startsWith('--'));

function generateQuestion() {
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `Session ${id}: What is the time complexity of binary search? Answer in one sentence.`;
}

const question = questionArg || generateQuestion();

console.error('='.repeat(70));
console.error(`[Network Intercept PoC] target=${target}, raw=${rawMode}`);
console.error(`[Network Intercept PoC] question: ${question}`);
console.error('='.repeat(70));

async function runTest(kind) {
  console.error(`\n--- ${kind.toUpperCase()} Network Intercept Test ---\n`);

  // Step 1: Get CDP client
  console.error(`[1/5] Getting ${kind} client...`);
  const client = await getClient(kind);
  console.error(`[1/5] Client connected`);

  // Step 2: Create interceptor and start capture
  console.error(`[2/5] Starting network capture...`);
  const interceptor = new NetworkInterceptor(client);
  interceptor.startCapture();

  // Step 3: Send question (using existing fast-chat pipeline)
  console.error(`[3/5] Sending question via existing pipeline...`);
  const askFn = kind === 'chatgpt' ? askChatGPTFastWithTimings : askGeminiFastWithTimings;

  let domResult;
  try {
    domResult = await askFn(question);
  } catch (error) {
    console.error(`[3/5] ERROR: ${error.message}`);
    interceptor.stopCapture();
    // Still show captured data even on error
    printResults(interceptor, null, kind);
    process.exit(1);
  }

  // Step 4: Stop capture
  console.error(`[4/5] Stopping capture...`);
  interceptor.stopCapture();

  // Step 5: Analyze and display results
  console.error(`[5/5] Analyzing captured data...\n`);
  printResults(interceptor, domResult, kind);
}

function printResults(interceptor, domResult, kind) {
  const result = interceptor.getResult();
  const frames = interceptor.getRawFrames();

  console.error('\n' + '='.repeat(70));
  console.error('CAPTURE SUMMARY');
  console.error('='.repeat(70));
  console.error(`Capture summary: ${interceptor.getSummary()}`);
  console.error(`Total frames: ${frames.length}`);
  console.error(`Network extracted text length: ${result.text.length}`);
  console.error(`Raw data size: ${result.rawDataSize} bytes`);
  console.error(`Capture duration: ${result.captureTimeMs}ms`);

  // Frame type breakdown
  const typeCount = {};
  for (const f of frames) {
    typeCount[f.type] = (typeCount[f.type] || 0) + 1;
  }
  console.error(`Frame types: ${JSON.stringify(typeCount)}`);

  // Unique URLs
  const urls = [...new Set(frames.map(f => f.url).filter(Boolean))];
  console.error(`\nUnique URLs (${urls.length}):`);
  for (const url of urls) {
    const count = frames.filter(f => f.url === url).length;
    console.error(`  [${count} frames] ${url.slice(0, 120)}`);
  }

  // Raw frame dump
  if (rawMode || frames.length <= 20) {
    console.error(`\n${'='.repeat(70)}`);
    console.error('RAW FRAMES');
    console.error('='.repeat(70));
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const dataPreview = f.data.length > 500 ? f.data.slice(0, 500) + '...' : f.data;
      console.error(`\n--- Frame ${i} [${f.type}] (${f.data.length} bytes) ---`);
      console.error(`URL: ${f.url || 'unknown'}`);
      console.error(`Data: ${dataPreview}`);
    }
  } else {
    // Show first 5 and last 5 frames
    console.error(`\n${'='.repeat(70)}`);
    console.error(`RAW FRAMES (showing first 5 and last 5 of ${frames.length})`);
    console.error('='.repeat(70));
    for (let i = 0; i < Math.min(5, frames.length); i++) {
      const f = frames[i];
      const dataPreview = f.data.length > 300 ? f.data.slice(0, 300) + '...' : f.data;
      console.error(`\n--- Frame ${i} [${f.type}] (${f.data.length} bytes) ---`);
      console.error(`URL: ${f.url || 'unknown'}`);
      console.error(`Data: ${dataPreview}`);
    }
    if (frames.length > 10) {
      console.error(`\n... (${frames.length - 10} frames omitted) ...`);
    }
    for (let i = Math.max(5, frames.length - 5); i < frames.length; i++) {
      const f = frames[i];
      const dataPreview = f.data.length > 300 ? f.data.slice(0, 300) + '...' : f.data;
      console.error(`\n--- Frame ${i} [${f.type}] (${f.data.length} bytes) ---`);
      console.error(`URL: ${f.url || 'unknown'}`);
      console.error(`Data: ${dataPreview}`);
    }
  }

  // Comparison with DOM extraction
  if (domResult) {
    console.error(`\n${'='.repeat(70)}`);
    console.error('COMPARISON: Network vs DOM');
    console.error('='.repeat(70));
    console.error(`DOM answer (${domResult.answer.length} chars): ${domResult.answer.slice(0, 200)}`);
    console.error(`Network text (${result.text.length} chars): ${result.text.slice(0, 200)}`);
    console.error(`DOM timings: ${JSON.stringify(domResult.timings)}`);

    if (result.text.length > 50 && domResult.answer.length > 50) {
      // Simple similarity check
      const networkWords = new Set(result.text.toLowerCase().split(/\s+/));
      const domWords = new Set(domResult.answer.toLowerCase().split(/\s+/));
      const overlap = [...networkWords].filter(w => domWords.has(w)).length;
      const similarity = overlap / Math.max(networkWords.size, domWords.size);
      console.error(`Word overlap similarity: ${(similarity * 100).toFixed(1)}%`);
    }
  }

  console.error('\n' + '='.repeat(70));
  console.error('Test complete.');
  console.error('='.repeat(70));
}

try {
  if (target === 'both') {
    await runTest('chatgpt');
    await runTest('gemini');
  } else {
    await runTest(target);
  }
} catch (error) {
  console.error(`\nFATAL ERROR: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}

process.exit(0);
