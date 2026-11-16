# 一条命令推到 GitHub
#   用法：
#     .\publish.ps1 -Repo "https://github.com/<你>/poster-forge.git" -Token "ghp_xxx"
#   也可以先把 token 放进环境变量 $env:GITHUB_TOKEN，再：
#     .\publish.ps1 -Repo "https://github.com/<你>/poster-forge.git"
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

Write-Host "检查是否含客户物料..." -ForegroundColor Cyan
$bad = git ls-files | Select-String -Pattern "金版|书链|高教社" -SimpleMatch:$false
if ($bad) { throw "仓库里有客户字样，先清掉：`n$bad" }

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
