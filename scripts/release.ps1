<#
  Poster8G (dsh-8g-poster) release helper.

  Usage:
    pwsh -File scripts/release.ps1                 # patch bump, run tests, commit, tag, push
    pwsh -File scripts/release.ps1 -Bump minor
    pwsh -File scripts/release.ps1 -Bump minor -Message "feat: 支持 A3 画布"
    pwsh -File scripts/release.ps1 -DryRun         # tests + version preview only

  What it does, in order:
    1. run the four test suites (smoke / route / ver / tools)
    2. bump version in package.json (patch | minor | major)
    3. prepend a dated section to CHANGELOG.md
    4. commit everything, create tag vX.Y.Z, push branch + tag

  Nothing is pushed unless the tests pass. Nothing is committed with -DryRun.

  Notes:
    - `npm.cmd` must be used on Windows; `npm` resolves to npm.ps1 and gets blocked
      by the ExecutionPolicy.
    - Python is discovered by lib/deps.js; run `node test/smoke.mjs` first if the
      environment changed.
    - The token lives in Windows Credential Manager (git credential manager).
      Never write it into this repository.
#>

[CmdletBinding()]
param(
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Bump = 'patch',
  [string]$Message = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
  Write-Host ''
  Write-Host "== Poster8G release ($Bump) ==" -ForegroundColor Cyan

  # --- 0. preconditions ---------------------------------------------------
  if (-not (Test-Path 'package.json')) { throw "package.json not found in $repo" }
  if (Test-Path '.git\rebase-merge') { throw 'a rebase is in progress; finish it first' }
  $dirty = (git status --porcelain)
  if ($dirty) {
    Write-Host "   warning: working tree has uncommitted changes, they will be included in the release commit" -ForegroundColor Yellow
  }

  # --- 1. tests -----------------------------------------------------------
  Write-Host '-> running tests'
  foreach ($t in @('test/smoke.mjs', 'test/route.mjs', 'test/ver.mjs', 'test/tools.mjs')) {
    if (-not (Test-Path $t)) { Write-Host "   skip $t (missing)" -ForegroundColor DarkGray; continue }
    node $t 2>&1 | ForEach-Object { "   $_" }
    if ($LASTEXITCODE -ne 0) { throw "test failed: $t" }
  }
  Write-Host '   all suites passed' -ForegroundColor Green

  # --- 2. version bump ----------------------------------------------------
  $pkg = Get-Content 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
  $old = [string]$pkg.version
  $parts = $old.Split('.')
  $major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]
  switch ($Bump) {
    'major' { $major++; $minor = 0; $patch = 0 }
    'minor' { $minor++; $patch = 0 }
    'patch' { $patch++ }
  }
  $new = "$major.$minor.$patch"
  Write-Host "-> version $old -> $new"

  if ($DryRun) {
    Write-Host '   -DryRun: stopping before any write' -ForegroundColor Yellow
    return
  }

  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='$new';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
  if ($LASTEXITCODE -ne 0) { throw 'failed to bump package.json' }

  # --- 3. changelog -------------------------------------------------------
  $date = Get-Date -Format 'yyyy-MM-dd'
  $body = if ($Message) { $Message } else { "- (fill in what changed in $new)" }
  $entry = "## $new - $date`n`n$body`n`n"
  $cl = if (Test-Path 'CHANGELOG.md') { Get-Content 'CHANGELOG.md' -Raw -Encoding UTF8 } else { '' }
  Set-Content 'CHANGELOG.md' -Encoding UTF8 -NoNewline -Value ($entry + $cl)
  Write-Host '-> CHANGELOG.md updated (please review the wording before the tag is pushed)'

  # --- 4. commit + tag + push --------------------------------------------
  git -c core.autocrlf=false add -A
  $commitMsg = if ($Message) { $Message } else { "chore: release $new" }
  git -c core.autocrlf=false commit -m "chore: release $new" -m $commitMsg 2>&1 | ForEach-Object { "   $_" }
  git tag -a "v$new" -m "v$new"
  git push origin HEAD 2>&1 | ForEach-Object { "   $_" }
  git push origin "v$new" 2>&1 | ForEach-Object { "   $_" }

  Write-Host ''
  Write-Host "== released v$new ==" -ForegroundColor Green
  Write-Host '   next: edit the CHANGELOG body if it still says "(fill in ...)", then amend the tag:'
  Write-Host "     git commit --amend --no-edit; git tag -f v$new; git push --force-with-lease origin HEAD v$new"
}
finally {
  Pop-Location
}
