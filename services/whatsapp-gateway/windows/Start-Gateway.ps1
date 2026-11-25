param(
  [switch]$PrepareOnly
)

$ErrorActionPreference = "Stop"
$ServiceName = "whatsapp-linked-device-gateway"
$RailwayHealth = "https://whatsapp-linked-device-gateway-production.up.railway.app/health"
$LocalHealth = "http://127.0.0.1:8080/health"

function Fail([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

Write-Host "OTPProvider WhatsApp Gateway - Windows runner" -ForegroundColor Cyan
Write-Host "Working directory: $(Get-Location)"

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Fail "Bun is not installed. Install it from https://bun.sh, reopen PowerShell, then retry."
}
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  Fail "Railway CLI is not installed. Install @railway/cli and authenticate with 'railway login'."
}

$package = Join-Path (Get-Location) "package.json"
$entry = Join-Path (Get-Location) "index.ts"
if (-not (Test-Path $package) -or -not (Test-Path $entry)) {
  Fail "Run this script from services/whatsapp-gateway."
}

Write-Host "Checking Railway CLI authentication and project link..."
railway status
if ($LASTEXITCODE -ne 0) {
  Fail "Railway CLI is not linked to the OTPProvider project. Link the existing project/service before continuing."
}

Write-Host "Checking whether the production gateway still owns the live session..."
$productionReady = $false
try {
  $health = Invoke-RestMethod -Uri $RailwayHealth -TimeoutSec 5
  $productionReady = ($health.ready -eq $true)
} catch {
  $productionReady = $false
}

if ($PrepareOnly) {
  if ($productionReady) {
    Write-Host "PREPARED: Railway production is healthy and remains untouched. Do not start a local duplicate." -ForegroundColor Green
  } else {
    Write-Host "PREPARED: Railway health endpoint did not report ready. Verify Railway manually before any cutover." -ForegroundColor Yellow
  }
  Write-Host "No service was stopped, no credentials were changed, and no WhatsApp message was sent."
  exit 0
}

if ($productionReady) {
  Fail "Production Railway still reports ready. Stop the Railway service manually during an approved maintenance window before starting the local owner. This avoids competing WhatsApp sessions."
}

try {
  $existing = Invoke-RestMethod -Uri $LocalHealth -TimeoutSec 2
  if ($existing.ok) {
    Fail "A process is already responding on local port 8080. Inspect it before starting another instance."
  }
} catch {
  # Expected when no local gateway is listening.
}

Write-Host "Starting the existing gateway source with Railway-injected variables..." -ForegroundColor Yellow
Write-Host "Keep this PowerShell window open. Press Ctrl+C to stop the local process."
railway run --service $ServiceName -- bun run index.ts
if ($LASTEXITCODE -ne 0) {
  Fail "Gateway process exited with code $LASTEXITCODE. Keep Railway available for rollback."
}
