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
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${checker} ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string)   { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string){ return `\x1b[33m${s}\x1b[0m`; }

function checkVersions(): void {
  // chrome-devtools-mcp requires: ^20.19.0 || ^22.12.0 || >=23
  const [majorStr, minorStr, patchStr] = process.versions.node.split('.');
  const major = parseInt(majorStr, 10);
  const minor = parseInt(minorStr, 10);
  const patch = parseInt(patchStr, 10);
  const ok =
    (major === 20 && (minor > 19 || (minor === 19 && patch >= 0))) ||
    (major === 22 && (minor > 12 || (minor === 12 && patch >= 0))) ||
    major >= 23;
  if (!ok) {
    console.error(red(`✗ Node.js ${process.versions.node} is not supported. Requires ^20.19.0, ^22.12.0, or >=23 (chrome-devtools-mcp constraint).`));
    process.exit(1);
  }

  // npm >= 7
  try {
    const npmVersion = execSync('npm --version', { stdio: 'pipe' }).toString().trim();
    const npmMajor = parseInt(npmVersion.split('.')[0], 10);
    if (npmMajor < 7) {
      console.error(red(`✗ npm ${npmVersion} is not supported. Requires npm 7 or later.`));
      process.exit(1);
    }
  } catch {
    console.error(red('✗ npm not found. Please install npm 7 or later.'));
    process.exit(1);
  }
}

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
      'claude mcp add browser --scope user --transport stdio -- npx --package=@yqi96/browser-pilot@latest browser-pilot --launch',
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

/** Remove all [mcp_servers.browser] sections from config.toml directly,
 *  bypassing `codex mcp remove` which itself fails on duplicate keys. */
function cleanCodexConfig(mcpName: string): void {
  const configPath = path.join(homeDir, '.codex', 'config.toml');
  if (!fs.existsSync(configPath)) return;

  const lines = fs.readFileSync(configPath, 'utf8').split('\n');
  const sectionHeader = `[mcp_servers.${mcpName}]`;
  const filtered: string[] = [];
  let skip = false;

  for (const line of lines) {
    if (line.trim() === sectionHeader) {
      skip = true; // start skipping this section
      continue;
    }
    if (skip && line.trim().startsWith('[')) {
      skip = false; // new section starts — stop skipping
    }
    if (!skip) filtered.push(line);
  }

  fs.writeFileSync(configPath, filtered.join('\n'), 'utf8');
}

function installCodex(): void {
  if (!hasCommand('codex')) {
    console.log(yellow('  ⚠ codex CLI not found — skipping'));
    results['codex'] = false;
    return;
  }
  try {
    cleanCodexConfig('browser');

    execSync('codex mcp add browser -- npx --package=@yqi96/browser-pilot@latest browser-pilot --launch', { stdio: 'inherit' });

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

    execSync('gemini mcp add --scope user browser npx --package=@yqi96/browser-pilot@latest browser-pilot --launch', { stdio: 'inherit' });
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

checkVersions();

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
