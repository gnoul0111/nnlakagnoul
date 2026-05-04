# Chi Tieu App - Deploy Script v2
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"
$FUNCTION_URL = "https://asia-southeast1-nnlakagnoul.cloudfunctions.net/notifyNewVersion"

Write-Host ""
Write-Host "=== CHI TIEU - DEPLOY ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build info
try { $gitHash = (git rev-parse --short HEAD 2>$null) } catch {}
$timestamp   = (Get-Date -Format "yyyyMMdd-HHmm")
$buildNumber = if ($gitHash) { "$gitHash-$timestamp" } else { $timestamp }
$version     = (Get-Date -Format "yyyy.MM.dd")
$buildTime   = (Get-Date -Format "dd/MM/yyyy HH:mm")

Write-Host "Version: $version" -ForegroundColor Gray
Write-Host "Build:   $buildNumber" -ForegroundColor Gray
Write-Host "Time:    $buildTime" -ForegroundColor Gray
Write-Host ""

# Step 2: Deploy to Vercel with build-env injection
Write-Host "[1/3] Deploying to Vercel..." -ForegroundColor Yellow
# --yes: bỏ qua mọi prompt (bao gồm prompt "upgrade CLI?" xuất hiện từ v51.8)
# để script không bị stuck hoặc exit sớm khi có version mới.
vercel --prod --yes `
    --build-env "NEXT_PUBLIC_BUILD_NUMBER=$buildNumber" `
    --build-env "NEXT_PUBLIC_BUILD_VERSION=$version" `
    --build-env "NEXT_PUBLIC_BUILD_TIME=$buildTime"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Vercel deploy failed!" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Deployed to Vercel!" -ForegroundColor Green
Write-Host ""

# Step 3: Wait for CDN
Write-Host "[2/3] Waiting 30s for CDN..." -ForegroundColor Yellow
for ($i = 30; $i -gt 0; $i--) {
    Write-Host -NoNewline "`r    $i seconds remaining...  "
    Start-Sleep -Seconds 1
}
Write-Host "`r    Done!                       " -ForegroundColor Green
Write-Host ""

# Step 4: Send notification
Write-Host "[3/3] Sending push notification..." -ForegroundColor Yellow
try {
    $secret = firebase functions:secrets:access NOTIFY_SECRET 2>$null
    if (-not $secret -or $secret.Length -lt 10) { throw "Cannot get secret" }
} catch {
    Write-Host "ERROR: Cannot read NOTIFY_SECRET from Firebase." -ForegroundColor Red
    exit 1
}

$body = @{ secret = $secret; version = $version; buildNumber = $buildNumber } | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $FUNCTION_URL -Method Post -Body $body -ContentType "application/json"
    Write-Host "OK: Notification sent!" -ForegroundColor Green
    Write-Host "    Total users : $($response.total)" -ForegroundColor Gray
    Write-Host "    Sent        : $($response.sent)" -ForegroundColor Gray
    Write-Host "    Failed      : $($response.failed)" -ForegroundColor Gray
} catch {
    Write-Host "WARNING: Deploy OK but notification failed:" -ForegroundColor Yellow
    Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== DEPLOY COMPLETE! ===" -ForegroundColor Green
Write-Host "App URL: https://expense-app-five-peach.vercel.app" -ForegroundColor Cyan
Write-Host ""