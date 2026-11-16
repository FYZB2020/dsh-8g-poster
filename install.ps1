# PosterForge 安装脚本：把插件挂进当前 DSH profile 的 MCP 列表
param([string]$Profile = "desktop", [string]$Python = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$profDir = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile"
if (-not (Test-Path $profDir)) { Write-Error "找不到 profile：$profDir"; exit 1 }
$settingsPath = Join-Path $profDir "settings.json"
$node = "node"
if (-not $Python) { $Python = "python" }
$cfg = @{
  command = $node
  args    = @((Join-Path $root "server\index.js"))
  env     = @{ POSTER_PYTHON = $Python }
}
if (Test-Path $settingsPath) {
  $json = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else { $json = [pscustomobject]@{} }
if (-not $json.PSObject.Properties["mcpServers"]) {
  $json | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{})
}
$json.mcpServers | Add-Member -NotePropertyName "poster-forge" -NotePropertyValue $cfg -Force
$json | ConvertTo-Json -Depth 12 | Set-Content $settingsPath -Encoding UTF8
Write-Host "已写入 $settingsPath"
Write-Host "重启 DSH 后，工具列表里会出现 poster_forge 的 8 个工具。"