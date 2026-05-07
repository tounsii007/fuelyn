<#
.SYNOPSIS
  Adds 127.0.0.1 entries for tankpilot.de + api.tankpilot.de
  to the Windows hosts file so the dev stack can be reached at
  https://tankpilot.de:49443 instead of https://localhost:49443.

.DESCRIPTION
  This is a LOCAL OVERRIDE only — your machine resolves
  tankpilot.de to 127.0.0.1, the rest of the internet still
  reaches the real public DNS for the domain. No public-facing
  effect. To revert, run with -Remove.

  Must be run as Administrator (needs write access to
  C:\Windows\System32\drivers\etc\hosts).

.PARAMETER Remove
  Strip the TankPilot entries instead of adding them.

.EXAMPLE
  .\scripts\setup-tankpilot-host.ps1
  .\scripts\setup-tankpilot-host.ps1 -Remove
#>

[CmdletBinding()]
param([switch] $Remove)

$ErrorActionPreference = 'Stop'

$hostsPath = "$env:windir\System32\drivers\etc\hosts"
$marker = '# tankpilot-dev'
$entries = @(
    "127.0.0.1 tankpilot.de $marker"
    "127.0.0.1 api.tankpilot.de $marker"
)

# Privilege check
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Administrator privileges required (need to edit Windows hosts file).' -ForegroundColor Yellow
    Write-Host 'Right-click PowerShell -> "Run as Administrator", then re-run this script.' -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $hostsPath)) {
    throw "hosts file not found at $hostsPath — unusual Windows install?"
}

# Read existing content as lines, strip every existing tankpilot-dev line
$existing = Get-Content $hostsPath -Encoding ASCII
$cleaned = $existing | Where-Object { $_ -notmatch [regex]::Escape($marker) }

if ($Remove) {
    Set-Content -Path $hostsPath -Value $cleaned -Encoding ASCII -Force
    Write-Host '-> Removed tankpilot.de hosts entries.' -ForegroundColor Green
    Write-Host '   Remember to flush DNS:  ipconfig /flushdns' -ForegroundColor Gray
    exit 0
}

# Add fresh entries
$updated = $cleaned + '' + '# --- TankPilot dev aliases (loopback) ---' + $entries
Set-Content -Path $hostsPath -Value $updated -Encoding ASCII -Force

Write-Host '-> Added entries:' -ForegroundColor Green
$entries | ForEach-Object { Write-Host "   $_" -ForegroundColor Green }
Write-Host ''
Write-Host 'Flush the DNS cache so Windows picks them up:' -ForegroundColor Gray
Write-Host '   ipconfig /flushdns' -ForegroundColor Gray
Write-Host ''
Write-Host 'Then open the app at:' -ForegroundColor Cyan
Write-Host '   https://tankpilot.de:49443' -ForegroundColor Cyan
