# Copies Wren's files onto a Firefox checkout.   usage: scripts\apply-overlay.ps1 C:\path\to\firefox
param([Parameter(Mandatory = $true)][string]$Target)
$here = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Target "mach"))) { throw "$Target does not look like a Firefox checkout (no mach file)" }
Copy-Item -Path (Join-Path $here "overlay\*") -Destination $Target -Recurse -Force
Get-Content (Join-Path $here "overlay-deleted.txt") | Where-Object { $_ } | ForEach-Object {
  Remove-Item -LiteralPath (Join-Path $Target $_) -Force -ErrorAction SilentlyContinue
}
Copy-Item (Join-Path $here "build\mozconfig.wren-full") (Join-Path $Target "mozconfig") -Force
Write-Host "done. build with: cd $Target; ./mach build"
