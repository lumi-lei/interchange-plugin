# interchange-harness installer for DeepSeek Harness.
#
# Deploys:
#   1. the interchange-dsh plugin package into every DSH installation found;
#   2. the user preset (preset/ + skills/core/scripts) under DSH_HOME/.agent-presets;
#   3. prints the cordis.patch.yml snippet for the host row (append manually).
#
# Re-run after a DSH upgrade rebuilds node_modules, or after updating this repo.

param(
  [string]$WorkspaceDir = 'D:/code/interchange-harness',
  [string]$PresetId = 'interchange'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding($false)

# ---- 1. deploy the plugin package ----
$targets = @()
$profileRoot = Join-Path $env:USERPROFILE '.dsh\profiles'
if (Test-Path $profileRoot) { $targets += Join-Path $profileRoot 'node_modules\interchange-dsh' }
$npxRoot = Join-Path $env:USERPROFILE 'AppData\Local\npm-cache\_npx'
if (Test-Path $npxRoot) {
  Get-ChildItem $npxRoot -Directory | ForEach-Object {
    if (Test-Path (Join-Path $_.FullName 'node_modules\@deepseek-ai\dsh\package.json')) {
      $targets += Join-Path $_.FullName 'node_modules\interchange-dsh'
    }
  }
}
if ($targets.Count -eq 0) { Write-Warning 'No DSH installation found (profile or npx cache); plugin package not deployed.' }
foreach ($dst in $targets) {
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Copy-Item -Force -Recurse (Join-Path $repo 'plugin\package.json'), (Join-Path $repo 'plugin\host'), (Join-Path $repo 'plugin\client') $dst
  Write-Host ('plugin installed to: ' + $dst)
}

# ---- 2. build the user preset ----
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$presetDir = Join-Path $dshHome ('.agent-presets\' + $PresetId)
New-Item -ItemType Directory -Force -Path $presetDir | Out-Null
Copy-Item -Force (Join-Path $repo 'preset\agent.cordis.yml'), (Join-Path $repo 'preset\preset.yml') $presetDir
foreach ($dir in 'skills', 'core', 'scripts') {
  if (Test-Path (Join-Path $presetDir $dir)) { Remove-Item -Recurse -Force (Join-Path $presetDir $dir) }
  Copy-Item -Recurse -Force (Join-Path $repo $dir) (Join-Path $presetDir $dir)
}
$ws = $WorkspaceDir.TrimEnd('/', '\')
$tokens = @{ '__WORKSPACE_DIR__' = $ws; '__PRESET_DIR__' = $presetDir }
Get-ChildItem $presetDir -Recurse -File -Include '*.yml', '*.md' | ForEach-Object {
  $text = [System.IO.File]::ReadAllText($_.FullName, $utf8)
  $changed = $false
  foreach ($k in $tokens.Keys) {
    if ($text.Contains($k)) { $text = $text.Replace($k, $tokens[$k]); $changed = $true }
  }
  if ($changed) { [System.IO.File]::WriteAllText($_.FullName, $text, $utf8) }
}
Write-Host ('preset installed to: ' + $presetDir)

# ---- 3. host row snippet ----
Write-Host ''
Write-Host 'Append the following entry to <DSH_HOME>\profiles\web\cordis.patch.yml:'
Write-Host ''
Write-Host '- insert:'
Write-Host '    - id: interchange-dsh'
Write-Host '      name: interchange-dsh'
Write-Host '      config:'
Write-Host ('        workspaceDir: ' + $ws)
Write-Host '        apiBase: http://127.0.0.1:4120/api'
Write-Host '        appBase: http://127.0.0.1:4120'
Write-Host '        tools: false'
Write-Host ''
Write-Host 'Then restart DSH and start a new session on the Interchange preset.'
