/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawn, execSync} from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, after, before} from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAEMON_SCRIPT = path.join(__dirname, '..', 'src', 'bin', 'daemon.js');

describe('Daemon', () => {
  let tmpDir: string;
  let daemonProcess: any;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-daemon-test-'));
  });

  after(async () => {
    if (daemonProcess) {
      try {
        process.kill(daemonProcess.pid, 0);
        daemonProcess.kill();
      } catch {
        // Process already dead
      }
    }
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('should terminate chrome instance when transport is closed', async () => {
    if (os.platform() === 'win32') {
      // Skip on Windows due to named pipe conflicts in parallel tests
      return;
    }

    daemonProcess = spawn(process.execPath, [DAEMON_SCRIPT], {
      env: {
        ...process.env,
        XDG_DATA_HOME: tmpDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const socketPath = path.join(
      tmpDir,
      'google',
      'chrome-devtools-mcp',
      'server.sock',
    );

    // Wait for daemon to be ready
    await new Promise<void>((resolve, reject) => {
      const onData = (data: Buffer) => {
        const output = data.toString();
        // Wait for MCP client to connect
        if (output.includes('MCP client connected')) {
          daemonProcess.stdout.off('data', onData);
          resolve();
        }
      };
      daemonProcess.stdout.on('data', onData);
      daemonProcess.stderr.on('data', (data: Buffer) =>
        console.error('Daemon stderr:', data.toString()),
      );
      daemonProcess.on('error', reject);
      daemonProcess.on('exit', (code: number) => {
        if (code !== 0 && code !== null)
          reject(new Error(`Daemon exited with code ${code}`));
      });
    });

    // Connect to daemon
    const socket = net.createConnection(socketPath);
    await new Promise<void>(resolve => socket.on('connect', resolve));

    // Invoke a tool to trigger browser launch
    const message =
      JSON.stringify({
        method: 'invoke_tool',
        tool: 'list_pages',
        args: {},
      }) + '\0';
    socket.write(message);

    // Wait for response
    await new Promise<void>((resolve, reject) => {
      const onData = (data: Buffer) => {
        const str = data.toString();
        // The daemon sends messages terminated by null byte
        const parts = str.split('\0').filter(p => p.trim());
        for (const part of parts) {
           try {
             const response = JSON.parse(part);
             if (response.success === true) {
               socket.off('data', onData);
               resolve();
               return;
             }
           } catch (e) {
             console.error('Failed to parse response:', part);
           }
        }
      };
      socket.on('data', onData);
      
      // Timeout if no success response received
      setTimeout(() => {
          socket.off('data', onData);
          reject(new Error('Timeout waiting for tool success response'));
      }, 5000);
    });

    // Verify Chrome is running
    const getAllProcesses = () => {
        try {
            const output = execSync('ps -A -o pid,ppid,command').toString();
            return output.split('\n').slice(1).map(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parseInt(parts[0], 10);
                const ppid = parseInt(parts[1], 10);
                const command = parts.slice(2).join(' ');
                return { pid, ppid, command };
            }).filter(p => !isNaN(p.pid) && !isNaN(p.ppid));
        } catch (e) {
            console.error('ps error:', e);
            return [];
        }
    };

    const findDescendants = (rootPid: number) => {
        const all = getAllProcesses();
        const descendants = new Set<number>();
        const queue = [rootPid];
        
        // Safety loop break
        let iterations = 0;
        while (queue.length > 0 && iterations < 1000) {
            iterations++;
            const current = queue.shift()!;
            const children = all.filter(p => p.ppid === current);
            for (const child of children) {
                if (!descendants.has(child.pid)) {
                    descendants.add(child.pid);
                    queue.push(child.pid);
                }
            }
        }
        return Array.from(descendants).map(pid => {
             return all.find(p => p.pid === pid);
        }).filter(p => p !== undefined) as { pid: number, ppid: number, command: string }[];
    };

    const daemonPid = daemonProcess.pid;
    let chromePids: number[] = [];
    
    // Poll for Chrome
    for (let i = 0; i < 50; i++) {
        const descendants = findDescendants(daemonPid);
        const chromeProcesses = descendants.filter(p => p.command.includes('Google Chrome') || p.command.includes('Chromium'));
        
        if (chromeProcesses.length > 0) {
            chromePids = chromeProcesses.map(p => p.pid);
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    assert.ok(chromePids.length > 0, 'Chrome process not found');

    // Stop daemon
    const stopMessage = JSON.stringify({method: 'stop'}) + '\0';
    socket.write(stopMessage);

    // Wait for daemon to exit
    await new Promise<void>(resolve => daemonProcess.on('exit', resolve));

    // Wait a bit for children to be cleaned up
    await new Promise(r => setTimeout(r, 1000));

    // Verify Chrome is gone
    const chromeStillRunning = chromePids.some(pid => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });

    assert.strictEqual(
      chromeStillRunning,
      false,
      'Chrome process should have been terminated',
    );
  });
});
