#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const homeDir = os.homedir();
const clientArgIdx = process.argv.indexOf('--client');
const client =
  process.argv.find(a => a.startsWith('--client='))?.split('=')[1] ??
  (clientArgIdx !== -1 ? process.argv[clientArgIdx + 1] : 'all') ??
  'all';

const targets = client === 'all' ? ['claude', 'codex', 'gemini'] : [client];

function run(cmd: string) {
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch {}
}

function del(filePath: string) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {}
}

for (const t of targets) {
  if (t === 'claude') {
    run('claude mcp remove browser --scope user');
    del(path.join(homeDir, '.claude', 'commands', 'browser.md'));
    console.log('✓ Removed claude registration + skill');
  }
  if (t === 'codex') {
    run('codex mcp remove browser');
    del(path.join(homeDir, '.codex', 'skills', 'browser', 'SKILL.md'));
    console.log('✓ Removed codex registration + skill');
  }
  if (t === 'gemini') {
    run('gemini mcp remove browser --scope user');
    console.log('✓ Removed gemini registration');
  }
}
