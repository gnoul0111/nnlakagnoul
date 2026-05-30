# Chi Tieu -- Deploy Script (PR workflow)
#
# Script tu dong nhan biet theo branch:
#
#   * Dang o BRANCH (khong phai main)  -> "SHIP MODE"
#       secretlint -> commit -> push branch -> in link tao Pull Request.
#       CI chay tren PR. Merge khi xanh -> Vercel tu deploy.
#
#   * Dang o MAIN, cay sach            -> "NOTIFY MODE"
#       pull main moi nhat -> doi Vercel build -> gui push notification cho users.
#       (Dung sau khi da merge PR.)
#
# Usage:
#   .\deploy.ps1                         # tu dong theo branch
#   .\deploy.ps1 -Message "fix: abc"     # dat commit message (ship mode)
#   .\deploy.ps1 -Hotfix                 # KHAN CAP: commit+push thang main, bo qua CI gate
#
param(
    [string]$Message = "",
    [switch]$Hotfix
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

$version   = (Get-Date -Format "yyyy.MM.dd")
$buildTime = (Get-Date -Format "dd/MM/yyyy HH:mm")
$buildTag  = (Get-Date -Format "yyyyMMdd-HHmm")

$branch = (git branch --show-current 2>$null)
if (-not $branch) { $branch = "main" }
$status = git status --porcelain 2>$null

Write-Host ""
Write-Host "=== CHI TIEU -- DEPLOY ===" -ForegroundColor Cyan
Info "Branch  : $branch"
Info "Time    : $buildTime"
Write-Host ""

# ---- SECRETLINT (luon chay dau tien o moi mode) ----
function Invoke-SecretScan {
    Step 1 4 "Kiem tra secret trong code..."
    try {
        $scanResult = npx secretlint "**/*" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Fail "Phat hien secret bi lo trong code!"
            Write-Host $scanResult
            Fail "Huy. Xoa secret truoc khi tiep tuc."
            exit 1
        }
        OK "Khong phat hien secret bi lo."
    } catch {
        Warn "Khong chay duoc secretlint: $($_.Exception.Message)"
    }
    Write-Host ""
}

# ---- NOTIFY MODE: wait Vercel + push notification (sau khi merge PR) ----
function Invoke-NotifyMode {
    Step 2 4 "Pull main moi nhat..."
    try {
        git pull origin main | Out-Null
        OK "Da pull main moi nhat."
    } catch {
        Warn "Pull that bai: $($_.Exception.Message)"
    }
    $gitHash = (git rev-parse --short HEAD 2>$null)
    $buildNumber = if ($gitHash) { "$gitHash-$buildTag" } else { $buildTag }
    Write-Host ""

    Step 3 4 "Doi Vercel build (${WAIT_SECONDS}s)..."
    Info "Vercel tu dong build sau khi merge vao main."
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
        if ($check.StatusCode -eq 200) { OK "App dang chay OK (HTTP 200)" }
        else { Warn "App tra ve HTTP $($check.StatusCode)" }
    } catch {
        Warn "Khong ping duoc app: $($_.Exception.Message)"
    }
    Write-Host ""

    Step 4 4 "Gui push notification..."
    try {
        $secret = firebase functions:secrets:access NOTIFY_SECRET 2>$null
        if (-not $secret -or $secret.Length -lt 10) { throw "Secret khong hop le" }
    } catch {
        Warn "Khong lay duoc NOTIFY_SECRET tu Firebase."
        Info "Setup: firebase functions:secrets:set NOTIFY_SECRET"
        Write-Host ""
        Write-Host "=== XONG (bo qua notification) ===" -ForegroundColor Yellow
        Write-Host "App: $APP_URL" -ForegroundColor Cyan
        exit 0
    }

    $body = @{ secret = $secret; version = $version; buildNumber = $buildNumber } | ConvertTo-Json
    try {
        $res = Invoke-RestMethod -Uri $FUNCTION_URL -Method Post -Body $body -ContentType "application/json" -TimeoutSec 15
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
}

# ---- SHIP MODE: commit + push branch + in link tao PR ----
function Invoke-ShipMode ($targetBranch) {
    if (-not $status) {
        Warn "Khong co thay doi nao de ship."
        exit 0
    }

    Step 2 4 "Commit thay doi..."
    if (-not $Message) {
        git add -A | Out-Null
        $changedFiles = (git diff --cached --name-only 2>$null)
        $fileCount = ($changedFiles -split "`n" | Where-Object { $_ }).Count
        $Message = "update $fileCount files - $buildTime"
    }
    try {
        git add -A | Out-Null
        git commit -m $Message | Out-Null
        OK "Committed: $Message"
    } catch {
        Fail "Commit that bai: $($_.Exception.Message)"
        exit 1
    }
    Write-Host ""

    Step 3 4 "Push branch len GitHub..."
    try {
        git push -u origin $targetBranch | Out-Null
        OK "Pushed branch: $targetBranch"
    } catch {
        Fail "Push that bai: $($_.Exception.Message)"
        exit 1
    }
    Write-Host ""

    Step 4 4 "Tao Pull Request..."
    $remote = (git remote get-url origin 2>$null)
    $repoPath = $remote -replace '^https://github\.com/', '' -replace '^git@github\.com:', '' -replace '\.git$', ''
    $prUrl = "https://github.com/$repoPath/compare/main...$($targetBranch)?expand=1"
    OK "Mo link sau de tao PR (CI se tu chay):"
    Write-Host "  $prUrl" -ForegroundColor Cyan
    try { Start-Process $prUrl } catch { }

    Write-Host ""
    Write-Host "=== DA PUSH BRANCH ===" -ForegroundColor Green
    Info "1. Mo PR tu link tren"
    Info "2. Doi CI xanh (test + build)"
    Info "3. Merge -> Vercel tu deploy"
    Info "4. git checkout main; git pull; .\deploy.ps1   (de gui notification)"
    Write-Host ""
}

# ---- DISPATCH ----
Invoke-SecretScan

if ($branch -ne "main") {
    Invoke-ShipMode $branch
}
elseif ($status -and -not $Hotfix) {
    Fail "Dang o MAIN ma co thay doi chua commit."
    Info "Khong commit thang vao main. Tao branch roi ship qua PR:"
    Write-Host "  git checkout -b fix/ten-thay-doi" -ForegroundColor Cyan
    Write-Host "  .\deploy.ps1" -ForegroundColor Cyan
    Write-Host ""
    Info "Hoac khan cap (bo qua CI): .\deploy.ps1 -Hotfix"
    exit 1
}
elseif ($status -and $Hotfix) {
    Warn "HOTFIX MODE -- commit thang vao main, BO QUA CI gate!"
    Step 2 4 "Commit + push main..."
    if (-not $Message) { $Message = "hotfix - $buildTime" }
    git add -A | Out-Null
    git commit -m $Message | Out-Null
    git push origin main | Out-Null
    OK "Hotfix pushed: $Message"
    Write-Host ""
    Invoke-NotifyMode
}
else {
    Invoke-NotifyMode
}
