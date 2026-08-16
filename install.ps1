# interchange-harness installer for DeepSeek Harness.
#
# Deploys:
#   1. the interchange-dsh plugin package into every DSH installation found;
#   2. the user preset (preset/ + skills/core/scripts) under DSH_HOME/.agent-presets;
#   3. the host row into the profile's cordis.patch.yml (idempotent; prints the
#      snippet only when no patch file is found).
#
# Re-run after a DSH upgrade rebuilds node_modules, or after updating this repo.

param(
  [string]$WorkspaceDir = '',
  [string]$PresetId = 'interchange'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding($false)
# Default workspace = this repo itself (a fresh clone works from any path).
if ([string]::IsNullOrWhiteSpace($WorkspaceDir)) { $WorkspaceDir = $repo }

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

# ---- 3. host row in the profile patch (idempotent) ----
$snippet = "- insert:`r`n" +
  "    - id: interchange-dsh`r`n" +
  "      name: interchange-dsh`r`n" +
  "      config:`r`n" +
  ("        workspaceDir: " + $ws + "`r`n") +
  "        apiBase: http://127.0.0.1:4120/api`r`n" +
  "        appBase: http://127.0.0.1:4120`r`n" +
  "        tools: false`r`n"
$patchFiles = @()
$profilesRoot = Join-Path $dshHome 'profiles'
if (Test-Path $profilesRoot) {
  $patchFiles = Get-ChildItem $profilesRoot -Recurse -Depth 3 -Filter 'cordis.patch.yml' -File | Select-Object -ExpandProperty FullName
}
if ($patchFiles.Count -gt 0) {
  foreach ($pf in $patchFiles) {
    $existing = [System.IO.File]::ReadAllText($pf, $utf8)
    if ($existing.Contains('id: interchange-dsh')) {
      Write-Host ('host row already present in ' + $pf)
      continue
    }
    [System.IO.File]::WriteAllText($pf, $existing.TrimEnd() + "`r`n`r`n" + $snippet, $utf8)
    Write-Host ('host row appended to ' + $pf)
  }
} else {
  Write-Host ''
  Write-Host 'No profile patch file found; append this entry to <DSH_HOME>\profiles\web\cordis.patch.yml:'
  Write-Host ''
  Write-Host $snippet
}
Write-Host ''
Write-Host 'Then restart DSH and start a new session on the Interchange preset.'
