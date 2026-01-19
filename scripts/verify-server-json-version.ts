/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverJsonFilePath = path.join(process.cwd(), 'server.json');
const serverJson = JSON.parse(fs.readFileSync(serverJsonFilePath, 'utf-8'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-verify-'));

try {
  const osName = os.platform();
  const arch = os.arch();
  let platform = '';
  if (osName === 'darwin') {
    platform = 'darwin';
  } else if (osName === 'linux') {
    platform = 'linux';
  }
  // mcp-publisher does not support windows
  else {
    throw new Error(`Unsupported platform: ${osName}`);
  }

  let archName = '';
  if (arch === 'x64') {
    archName = 'amd64';
  } else if (arch === 'arm64') {
    archName = 'arm64';
  } else {
    throw new Error(`Unsupported architecture: ${arch}`);
  }

  const osArch = `${platform}_${archName}`;
  const binName = 'mcp-publisher';
  const downloadUrl = `https://github.com/modelcontextprotocol/registry/releases/latest/download/${binName}_${osArch}.tar.gz`;

  console.log(`Downloading ${binName} from ${downloadUrl}`);
  const downloadCmd = `curl -L "${downloadUrl}" | tar xz -C "${tmpDir}" ${binName}`;
  execSync(downloadCmd, {stdio: 'inherit'});

  const publisherPath = path.join(tmpDir, binName);
  fs.chmodSync(publisherPath, 0o755);
  console.log(`Downloaded to ${publisherPath}`);

  // Create the new server.json in the temporary directory
  execSync(`${publisherPath} init`, {cwd: tmpDir, stdio: 'inherit'});

  const newServerJsonPath = path.join(tmpDir, 'server.json');
  const newServerJson = JSON.parse(fs.readFileSync(newServerJsonPath, 'utf-8'));

  const propertyToVerify = ['$schema'];
  const diffProps = [];

  for (const prop of propertyToVerify) {
    if (serverJson[prop] !== newServerJson[prop]) {
      diffProps.push(prop);
    }
  }

  if (diffProps.length) {
    throw new Error(
      `The following props in ${serverJsonFilePath} did not match the latest init value:\n${diffProps.map(
        prop =>
          `- "${prop}": expected "${newServerJson[prop]}", got "${serverJson[prop]}"`,
      )}`,
    );
  }
} finally {
  fs.rmSync(tmpDir, {recursive: true, force: true});
}
