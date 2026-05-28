<#
.SYNOPSIS
  Roll back the shared HTTP MCP setup created by setup-shared-mcp.ps1.

.DESCRIPTION
  Stops and removes the ChromeDevToolsMcpShared Scheduled Task, removes
  the chrome-devtools entry from the Claude Code user MCP config, and
  optionally cleans up the token and log directories.

.PARAMETER KeepTokenAndLogs
  Skip the prompt and leave the token + log/profile directories in place.

.PARAMETER RestoreStdio
  After removal, re-add the stdio variant of chrome-devtools using the
  build at the path passed via -ForkPath.

.PARAMETER ForkPath
  Path to the cloned chrome-devtools-mcp fork repo (used only with
  -RestoreStdio).
#>
param(
    [switch]$KeepTokenAndLogs,
    [switch]$RestoreStdio,
    [string]$ForkPath = ''
)

$ErrorActionPreference = 'Continue'

if (-not $ForkPath) {
    if ($PSScriptRoot) {
        $ForkPath = Split-Path -Parent $PSScriptRoot
    } else {
        $ForkPath = 'C:\Users\cejor\Dev\chrome-devtools-mcp'
    }
}

$ConfigDir   = Join-Path $env:APPDATA 'cdmcp'
$ChromeDir   = Join-Path $env:LOCALAPPDATA 'cdmcp'
$TaskName    = 'ChromeDevToolsMcpShared'

Write-Host '=== Chrome DevTools MCP — Uninstall Shared HTTP ===' -ForegroundColor Cyan
Write-Host ''

# 1. Stop + remove the Scheduled Task
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Scheduled Task:  removed ($TaskName)"
} else {
    Write-Host "Scheduled Task:  not present"
}

# 2. Remove the Claude Code MCP entry (silent if missing)
& claude mcp remove chrome-devtools --scope user 2>$null | Out-Null
Write-Host 'Claude Code:     chrome-devtools entry removed from user config'

# 3. Optionally restore stdio variant
if ($RestoreStdio) {
    $ForkPath = (Resolve-Path -LiteralPath $ForkPath).Path
    $cdmcpJs = Join-Path $ForkPath 'build\src\bin\chrome-devtools-mcp.js'
    if (Test-Path $cdmcpJs) {
        & claude mcp add chrome-devtools `
            --scope user `
            -- node $cdmcpJs --experimentalPageIdRouting
        Write-Host 'Claude Code:     stdio variant restored'
    } else {
        Write-Warning "Stdio restore skipped: $cdmcpJs not found"
    }
}

# 4. Optionally remove token + logs + profile
if (-not $KeepTokenAndLogs) {
    Write-Host ''
    Write-Host 'Remove the following directories?'
    Write-Host "  - $ConfigDir   (token, launcher)"
    Write-Host "  - $ChromeDir   (logs, Chrome user-data-dir)"
    $reply = Read-Host '[y/N]'
    if ($reply -match '^[Yy]') {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $ConfigDir, $ChromeDir
        Write-Host 'Token/logs/profile dirs:  removed'
    } else {
        Write-Host 'Token/logs/profile dirs:  kept'
    }
}

Write-Host ''
Write-Host 'Done. Restart any open Claude Code windows.' -ForegroundColor Green
