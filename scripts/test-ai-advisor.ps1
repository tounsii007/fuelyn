<#
.SYNOPSIS
  Smoke test for the Fuelyn AI advisor endpoint.

.DESCRIPTION
  Posts a sample request to /api/v1/ai/advisor and pretty-prints the
  response. Two transport modes:

    -Mode Gateway   -> goes through Caddy + gateway (full auth path).
                       Requires API_KEY_1 in .env. Uses Invoke-RestMethod
                       and tolerates Caddy's self-signed dev certificate.
    -Mode Direct    -> calls the ai-service container directly via
                       'docker exec'. No auth, no TLS. Best for testing
                       the orchestrator/heuristic in isolation.

  Default: Direct (no .env required, fastest feedback).

.PARAMETER Mode
  Gateway | Direct

.PARAMETER FuelType
  diesel | e5 | e10. Default: e10.

.PARAMETER FillUpLiters
  10..200. Default: 50.

.PARAMETER Json
  Print the raw JSON response instead of object form.

.EXAMPLE
  .\scripts\test-ai-advisor.ps1
  .\scripts\test-ai-advisor.ps1 -Mode Gateway
  .\scripts\test-ai-advisor.ps1 -FuelType diesel -FillUpLiters 80 -Json
#>

[CmdletBinding()]
param(
    [ValidateSet('Direct','Gateway')]
    [string] $Mode = 'Direct',

    [ValidateSet('diesel','e5','e10')]
    [string] $FuelType = 'e10',

    [ValidateRange(10, 200)]
    [int]    $FillUpLiters = 50,

    [switch] $Json
)

$ErrorActionPreference = 'Stop'

# Force UTF-8 console output so Euro signs and umlauts render
# correctly in Windows PowerShell 5.1 sessions whose code page is
# still cp850 / cp1252.
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding           = [System.Text.Encoding]::UTF8
} catch { }

# Sample payload (Berlin Mitte, four mixed-brand stations)
$payload = @{
    fuelType     = $FuelType
    fillUpLiters = $FillUpLiters
    lat          = 52.52
    lng          = 13.40
    prices       = @(
        @{ stationName = 'Aral Mitte';          brand = 'Aral';  price = 1.749; distance = 1.2 }
        @{ stationName = 'Shell Nord';          brand = 'Shell'; price = 1.799; distance = 2.3 }
        @{ stationName = 'JET City';            brand = 'JET';   price = 1.819; distance = 0.9 }
        @{ stationName = 'Star Alexanderplatz'; brand = 'Star';  price = 1.769; distance = 3.4 }
    )
} | ConvertTo-Json -Depth 5

# Repo root resolves no matter where the script is invoked from
$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-EnvKey {
    param([string] $Name)
    $envFile = Join-Path $repoRoot '.env'
    if (-not (Test-Path $envFile)) {
        throw "$envFile not found. Run scripts/generate-dev-secrets.sh first."
    }
    $line = Get-Content $envFile | Select-String "^$Name=" | Select-Object -First 1
    if (-not $line) {
        throw "$Name missing from .env"
    }
    ($line.ToString() -split '=', 2)[1].Trim('"').Trim()
}

# Direct mode: hit the container, no auth, no TLS
if ($Mode -eq 'Direct') {
    Write-Host "-> Direct mode (docker exec -> ai-service:28820)" -ForegroundColor Cyan

    # docker exec needs the JSON as a single argv-safe string
    $escaped = $payload -replace '"', '\"'
    $url = 'http://127.0.0.1:28820/api/v1/ai/advisor'

    $raw = docker exec fuelyn-ai-service-1 wget -q -O- `
        --post-data="$escaped" `
        --header="Content-Type: application/json" `
        $url

    if ($LASTEXITCODE -ne 0) {
        throw "docker exec returned $LASTEXITCODE - is fuelyn-ai-service-1 running?"
    }
}
# Gateway mode: full auth path through Caddy
else {
    Write-Host "-> Gateway mode (Caddy -> gateway -> ai-service)" -ForegroundColor Cyan
    $key = Read-EnvKey -Name 'API_KEY_1'

    # Caddy routes by Host header. On Linux/macOS *.localhost auto-
    # resolves to 127.0.0.1; on Windows it does not. We try the
    # hostname first and fall back to 127.0.0.1 + explicit Host header
    # if DNS resolution fails.
    $tryUris = @(
        @{ Uri = 'https://api.localhost:49443/api/v1/ai/advisor'; Headers = @{ 'X-API-Key' = $key } }
        @{ Uri = 'https://127.0.0.1:49443/api/v1/ai/advisor';    Headers = @{ 'X-API-Key' = $key; 'Host' = 'api.localhost' } }
    )

    # Tolerate Caddy's self-signed dev cert
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        Add-Type -AssemblyName System.Net.Http
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    }

    # We use Invoke-WebRequest (not -RestMethod) so we can read the
    # raw response bytes and force-decode them as UTF-8. PS 5.1's
    # Invoke-RestMethod silently falls back to ISO-8859-1 when the
    # Content-Type header omits a charset, which mangles umlauts and
    # the Euro sign in the response body.
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $raw = $null
    foreach ($attempt in $tryUris) {
        try {
            $params = @{
                Method      = 'POST'
                Uri         = $attempt.Uri
                Headers     = $attempt.Headers
                ContentType = 'application/json; charset=utf-8'
                Body        = $bodyBytes
                UseBasicParsing = $true
            }
            if ($PSVersionTable.PSVersion.Major -ge 7) { $params['SkipCertificateCheck'] = $true }

            $web = Invoke-WebRequest @params
            $bytes = $web.RawContentStream.ToArray()
            $raw   = [System.Text.Encoding]::UTF8.GetString($bytes)

            Write-Host ("   via {0}" -f $attempt.Uri) -ForegroundColor DarkGray
            break
        }
        catch [System.Net.WebException] {
            $msg = $_.Exception.Message
            if ($msg -match 'Remotename|resolved|aufgel|host') {
                Write-Host ("   {0} did not resolve, falling back" -f $attempt.Uri) -ForegroundColor DarkYellow
                continue
            }
            throw
        }
    }

    if ($null -eq $raw) {
        throw "Gateway unreachable on every transport candidate."
    }
}

# Output
if ($Json) {
    Write-Output $raw
}
else {
    $obj = $raw | ConvertFrom-Json
    if ($null -ne $obj.data) {
        # ApiResponse<T> wrapper from common module
        $data = $obj.data
        Write-Host ""
        Write-Host "-- AI Advisor Response -------------------------" -ForegroundColor Green
        Write-Host ("  action:        {0}" -f $data.action)
        Write-Host ("  headline:      {0}" -f $data.headline)
        Write-Host ("  explanation:   {0}" -f $data.explanation)
        Write-Host ("  savings:       {0:N2} EUR" -f $data.savingsEstimate)
        Write-Host ("  confidence:    {0}" -f $data.confidence)
        if ($data.bestStation) {
            Write-Host ("  bestStation:   {0} - {1}" -f $data.bestStation.name, $data.bestStation.reason)
        }
        Write-Host ("  priceOutlook:  {0}" -f $data.priceOutlook)
        Write-Host ("  bestTime:      {0}" -f $data.bestTimePrediction)
        Write-Host ("  tip:           {0}" -f $data.tip)
        Write-Host ""
        $tier  = if ($data.fromAI)    { "LLM enrichment OK" } else { "Heuristic baseline (no LLM)" }
        $cache = if ($data.fromCache) { "cache HIT" }         else { "fresh" }
        Write-Host ("  source:        {0}, {1}" -f $tier, $cache) -ForegroundColor DarkGray
        Write-Host "------------------------------------------------" -ForegroundColor Green
    }
    else {
        $obj | Format-List
    }
}
