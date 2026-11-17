# 一条命令推到 GitHub
#   用法：
#     .\publish.ps1 -Repo "https://github.com/<你>/posterwright.git" -Token "ghp_xxx"
#   也可以先把 token 放进环境变量 $env:GITHUB_TOKEN，再：
#     .\publish.ps1 -Repo "https://github.com/<你>/posterwright.git"
#
# 只做三件事：检查 → 设 remote → push。不 force、不删东西。

param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".git")) { throw "这里不是 git 仓库：$PSScriptRoot" }
if ($Repo -notmatch "github\.com[:/](?<owner>[^/]+)/(?<name>[^/.]+)") { throw "仓库地址看起来不对：$Repo" }

Write-Host "自检..." -ForegroundColor Cyan
node test/smoke.mjs
if ($LASTEXITCODE -ne 0) { throw "自检没过，先修再传" }

Write-Host "检查是否含私有物料..." -ForegroundColor Cyan
# 私有词表放在仓库外面，仓库本身不带任何客户字样：
#   在仓库同级目录建 .poster-guard.txt，一行一个词
$guard = Join-Path (Split-Path $PSScriptRoot -Parent) ".poster-guard.txt"
if (Test-Path $guard) {
  $terms = Get-Content $guard -Encoding utf8 | Where-Object { $_.Trim() -ne "" }
  $bad = @()
  foreach ($t in $terms) {
    $hit = git ls-files | ForEach-Object { Select-String -Path $_ -Pattern $t -SimpleMatch -List -ErrorAction SilentlyContinue }
    if ($hit) { $bad += ($hit | ForEach-Object { $_.Path + ' :: ' + $t }) }
  }
  if ($bad.Count -gt 0) { throw ("仓库里有私有物料，先清掉：`n" + ($bad -join "`n")) }
  Write-Host "私有词表 " $terms.Count " 条，全部干净" -ForegroundColor Green
} else {
  Write-Host "没有私有词表（$guard），跳过这一项检查" -ForegroundColor Yellow
}

if ($Token) {
  # 用一次性 URL，不写进 .git/config
  $url = $Repo -replace "^https://", "https://x-access-token:$Token@"
} else {
  $url = $Repo
  Write-Host "没给 token，走已有的 git 凭证（SSH key 或 credential helper）" -ForegroundColor Yellow
}

if ((git remote) -contains "origin") { git remote remove origin }
git remote add origin $url
Write-Host "推送 $Branch → $Repo" -ForegroundColor Cyan
git push -u origin $Branch

# 推完把带 token 的 remote 换回干净地址，免得留在配置里
git remote set-url origin $Repo
Write-Host "完成。仓库：$Repo" -ForegroundColor Green
