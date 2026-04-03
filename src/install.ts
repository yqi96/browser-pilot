#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, '..', 'skills');
const homeDir = os.homedir();

// Parse --client flag
const clientArg = process.argv.find((a) => a.startsWith('--client='));
const clientFlag = clientArg ? clientArg.split('=')[1] : 'all';
const validClients = ['claude', 'codex', 'gemini', 'all'];

if (!validClients.includes(clientFlag)) {
  console.error(`Invalid --client value: "${clientFlag}". Valid: claude|codex|gemini|all`);
  process.exit(1);
}

const targets = clientFlag === 'all' ? ['claude', 'codex', 'gemini'] : [clientFlag];

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string)   { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string){ return `\x1b[33m${s}\x1b[0m`; }

const results: Record<string, boolean> = {};

// ── Claude ──────────────────────────────────────────────────────────────────
function installClaude(): void {
  if (!hasCommand('claude')) {
    console.log(yellow('  ⚠ claude CLI not found — skipping'));
    results['claude'] = false;
    return;
  }
  try {
    try {
      execSync('claude mcp remove browser --scope user', { stdio: 'pipe' });
    } catch { /* ignore */ }

    execSync(
      'claude mcp add browser --scope user --transport stdio -- npx browser-pilot --launch',
      { stdio: 'inherit' }
    );

    const commandsDir = path.join(homeDir, '.claude', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    fs.copyFileSync(path.join(skillsDir, 'browser', 'SKILL.md'), path.join(commandsDir, 'browser.md'));

    console.log(green('  ✓ claude — MCP server registered + skill copied'));
    results['claude'] = true;
  } catch (err) {
    console.error(red(`  ✗ claude — ${(err as Error).message}`));
    results['claude'] = false;
  }
}

// ── Codex ───────────────────────────────────────────────────────────────────
function installCodex(): void {
  if (!hasCommand('codex')) {
    console.log(yellow('  ⚠ codex CLI not found — skipping'));
    results['codex'] = false;
    return;
  }
  try {
    try {
      execSync('codex mcp remove browser', { stdio: 'pipe' });
    } catch { /* ignore */ }

    execSync('codex mcp add browser -- npx browser-pilot --launch', { stdio: 'inherit' });

    const skillDir = path.join(homeDir, '.codex', 'skills', 'browser');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.copyFileSync(
      path.join(skillsDir, 'browser', 'SKILL.md'),
      path.join(skillDir, 'SKILL.md')
    );

    console.log(green('  ✓ codex — MCP server registered + skill copied'));
    results['codex'] = true;
  } catch (err) {
    console.error(red(`  ✗ codex — ${(err as Error).message}`));
    results['codex'] = false;
  }
}

// ── Gemini ───────────────────────────────────────────────────────────────────
function installGemini(): void {
  if (!hasCommand('gemini')) {
    console.log(yellow('  ⚠ gemini CLI not found — skipping'));
    results['gemini'] = false;
    return;
  }
  try {
    try {
      execSync('gemini mcp remove browser --scope user', { stdio: 'pipe' });
    } catch { /* ignore */ }

    execSync('gemini mcp add --scope user browser npx browser-pilot --launch', { stdio: 'inherit' });
    execSync(`gemini skills link ${path.join(skillsDir, 'browser')}`, { stdio: 'inherit' });

    console.log(green('  ✓ gemini — MCP server registered + skill linked'));
    results['gemini'] = true;
  } catch (err) {
    console.error(red(`  ✗ gemini — ${(err as Error).message}`));
    results['gemini'] = false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('\nbrowser-pilot installer\n');

for (const target of targets) {
  console.log(`Installing for ${target}…`);
  if (target === 'claude')  installClaude();
  else if (target === 'codex')  installCodex();
  else if (target === 'gemini') installGemini();
}

console.log('');
const succeeded = Object.values(results).filter(Boolean).length;
const total = Object.keys(results).length;

if (succeeded === 0) {
  console.error(red(`All ${total} client(s) failed. Check warnings above.`));
  process.exit(1);
} else {
  console.log(green(`Done: ${succeeded}/${total} client(s) configured successfully.`));
  process.exit(0);
}
