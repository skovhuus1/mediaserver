param(
  [Parameter(Mandatory = $true)]
  [string]$Task,

  [string[]]$Paths,

  [string]$GitRoot = "$PSScriptRoot\..",

  [string]$Branch = "main"
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $GitRoot

if (-not (git rev-parse --is-inside-work-tree)) {
  throw "Ikke et git-arbejdsområde: $GitRoot"
}

$status = git status --short
if (-not $status) {
  throw "Ingen ændringer at pushe."
}

git remote get-url origin | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Ingen origin remote fundet.'
}

if ($Paths -and $Paths.Count -gt 0) {
  git add -- $Paths
} else {
  git add -A
}

$staged = git diff --cached --name-only
if (-not $staged) {
  throw "Intet blev staged. Angiv Path-parametre hvis kun bestemte filer skal med."
}

git commit -m "phase1: $Task"

git checkout $Branch
git push -u origin $Branch

Write-Host "Pushed to $Branch med besked: phase1: $Task"
