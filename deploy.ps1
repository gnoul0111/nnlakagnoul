# Chi Tieu -- Deploy Script
# Usage: .\deploy.ps1
# Usage: .\deploy.ps1 -Message "fix: sua loi xoa chi tieu"
#
# Script tu dong:
#   1. Git add + commit + push len GitHub
#   2. Doi Vercel build xong
#   3. Gui push notification cho users

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

$APP_URL      = "https://nnlakagnoul.vercel.app"
$FUNCTION_URL = "https://asia-southeast1-nnlakagnoul.cloudfunctions.net/notifyNewVersion"
$WAIT_SECONDS = 90

function Info ($t) { Write-Host "  $t" -ForegroundColor Gray }
function OK   ($t) { Write-Host "  $t" -ForegroundColor Green }
function Warn ($t) { Write-Host "  WARNING: $t" -ForegroundColor Yellow }
function Fail ($t) { Write-Host "  ERROR: $t" -ForegroundColor Red }
function Step ($n, $total, $t) { Write-Host "[$n/$total] $t" -ForegroundColor Cyan }

# Build info
$version     = (Get-Date -Format "yyyy.MM.dd")
$buildTime   = (Get-Date -Format "dd/MM/yyyy HH:mm")
$buildTag    = (Get-Date -Format "yyyyMMdd-HHmm")
try { $gitHash = (git rev-parse --short HEAD 2>$null) } catch { $gitHash = "" }

Write-Host ""
Write-Host "=== CHI TIEU -- DEPLOY ===" -ForegroundColor Cyan
Write-Host ""
Info "Version : $version"
Info "Time    : $buildTime"
Write-Host ""

# ---- Step 1: Git ----

Step 1 3 "Git commit va push..."

$status = git status --porcelain 2>$null
$skipGit = $false

if (-not $status) {
    Warn "Khong co file nao thay doi."
    $skipGit = $true
}

if (-not $skipGit) {
    if (-not $Message) {
        git add -A | Out-Null
        $changedFiles = (git diff --cached --name-only 2>$null)
        $fileCount = ($changedFiles -split "`n" | Where-Object { $_ }).Count
        $Message = "deploy: update $fileCount files - $buildTime"
    }

    try {
        git add -A | Out-Null
        git commit -m $Message | Out-Null
        OK "Committed: $Message"
    } catch {
        Fail "Git commit that bai: $($_.Exception.Message)"
        exit 1
    }

    try { $gitHash = (git rev-parse --short HEAD 2>$null) } catch {}

    try {
        $branch = (git branch --show-current 2>$null)
        if (-not $branch) { $branch = "main" }
        git push origin $branch | Out-Null
        OK "Pushed to GitHub (branch: $branch) -- commit: $gitHash"
    } catch {
        Fail "Git push that bai: $($_.Exception.Message)"
        exit 1
    }
}

$buildNumber = if ($gitHash) { "$gitHash-$buildTag" } else { $buildTag }

Write-Host ""

# ---- Step 2: Doi Vercel build ----

Step 2 3 "Doi Vercel build (${WAIT_SECONDS}s)..."
Info "Vercel tu dong detect commit moi va build."

$elapsed = 0
while ($elapsed -lt $WAIT_SECONDS) {
    $remaining = $WAIT_SECONDS - $elapsed
    Write-Host -NoNewline "`r  Con lai: $remaining giay...   "
    Start-Sleep -Seconds 5
    $elapsed += 5
}
Write-Host "`r  Da doi du ${WAIT_SECONDS}s.              " -ForegroundColor Green

try {
    $check = Invoke-WebRequest -Uri $APP_URL -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    if ($check.StatusCode -eq 200) {
        OK "App dang chay OK (HTTP 200)"
    } else {
        Warn "App tra ve HTTP $($check.StatusCode)"
    }
} catch {
    Warn "Khong ping duoc app: $($_.Exception.Message)"
}

Write-Host ""

# ---- Step 3: Push notification ----

Step 3 3 "Gui push notification..."

try {
    $secret = firebase functions:secrets:access NOTIFY_SECRET 2>$null
    if (-not $secret -or $secret.Length -lt 10) { throw "Secret khong hop le" }
} catch {
    Warn "Khong lay duoc NOTIFY_SECRET tu Firebase."
    Info "Chay lenh nay de setup: firebase functions:secrets:set NOTIFY_SECRET"
    Write-Host ""
    Write-Host "=== DEPLOY XONG (bo qua notification) ===" -ForegroundColor Yellow
    Write-Host "App: $APP_URL" -ForegroundColor Cyan
    exit 0
}

$body = @{
    secret      = $secret
    version     = $version
    buildNumber = $buildNumber
} | ConvertTo-Json

try {
    $res = Invoke-RestMethod -Uri $FUNCTION_URL -Method Post `
        -Body $body -ContentType "application/json" -TimeoutSec 15
    OK "Notification da gui!"
    Info "Total : $($res.total) users"
    Info "Sent  : $($res.sent)"
    if ($res.failed -gt 0) { Warn "Failed: $($res.failed)" }
} catch {
    Warn "Deploy OK nhung notification that bai: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== DEPLOY HOAN TAT! ===" -ForegroundColor Green
Write-Host "App: $APP_URL" -ForegroundColor Cyan
Write-Host ""