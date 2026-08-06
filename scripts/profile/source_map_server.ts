/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';

export interface SourceMapTestServer {
  close(): Promise<void>;
  url: string;
}

export function sourceMapFor(index: number, sizeBytes = 1_000_000): string {
  const padding = '// Large source map payload padding line\n'.repeat(
    Math.ceil(sizeBytes / 42),
  );
  return JSON.stringify({
    version: 3,
    file: `script-${index}.js`,
    sources: [`source-${index}.ts`],
    sourcesContent: [
      `export function profileFunction${index}(value: number): number {\n  console.error(new Error('Profile error from script ${index}'));\n  return value + ${index};\n}\n${padding}`,
    ],
    names: [],
    mappings: 'AAAA;AACA;AACA;AACA',
  });
}

export function scriptFor(index: number): string {
  return [
    `function profileFunction${index}(value) {`,
    `  console.error(new Error('Profile error from script ' + ${index}));`,
    `  return value + ${index};`,
    '}',
    'globalThis.profileScriptResults ??= [];',
    `globalThis.profileScriptResults.push(profileFunction${index}(${index}));`,
    `//# sourceMappingURL=/maps/script-${index}.js.map`,
    '',
  ].join('\n');
}

export async function startSourceMapTestServer(
  scriptCount = 100,
): Promise<SourceMapTestServer> {
  const scriptTags = Array.from(
    {length: scriptCount},
    (_, index) => `<script src="/scripts/script-${index}.js"></script>`,
  ).join('\n');
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Source map profiler fixture</title>
  </head>
  <body>
    <h1>Source map profiler fixture</h1>
    <p>${scriptCount} scripts, each with a distinct source map.</p>
    ${scriptTags}
  </body>
</html>`;

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/html; charset=utf-8',
      });
      response.end(html);
      return;
    }

    const scriptMatch = /^\/scripts\/script-(\d+)\.js$/.exec(
      requestUrl.pathname,
    );
    const mapMatch = /^\/maps\/script-(\d+)\.js\.map$/.exec(
      requestUrl.pathname,
    );
    const match = scriptMatch ?? mapMatch;
    const indexText = match?.[1];
    const index = indexText === undefined ? -1 : Number(indexText);
    if (!Number.isInteger(index) || index < 0 || index >= scriptCount) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    if (scriptMatch) {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/javascript; charset=utf-8',
      });
      response.end(scriptFor(index));
      return;
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(sourceMapFor(index));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Source map test server did not expose a TCP port');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}
