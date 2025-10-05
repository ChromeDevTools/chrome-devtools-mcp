/**
 * Browser Globals Mock for Node.js Environment
 *
 * chrome-devtools-frontend requires browser globals (location, etc.)
 * This module must be loaded BEFORE any chrome-devtools-frontend modules are imported.
 *
 * Usage: node --import ./scripts/browser-globals-mock.mjs build/src/main.js
 */

// Mock location
globalThis.location = {
  search: '',
  href: '',
  protocol: 'file:',
  host: '',
  hostname: '',
  port: '',
  pathname: '',
  hash: '',
};

// Mock self (browser global, typically refers to window)
globalThis.self = globalThis;

// Mock localStorage
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

console.error('[browser-globals-mock] Initialized browser globals (location, self, localStorage) for Node.js');
