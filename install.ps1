# browser-pilot Windows installer
# Usage: .\install.ps1 [-Client claude|codex|gemini|all]
param(
  [string]$Client = $env:TARGET_CLIENT
)

if (-not $Client) { $Client = "all" }

$valid = @("claude", "codex", "gemini", "all")
if ($Client -notin $valid) {
  Write-Error "Invalid -Client '$Client' (expected: claude|codex|gemini|all)"
  exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "==> browser-pilot installer"
Write-Host ""

Write-Host "[1/2] Building..."
npm install --silent
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build --silent
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "      OK: dist/"

Write-Host "[2/2] Installing for client: $Client..."
node dist/install.js --client $Client
exit $LASTEXITCODE
