# ============================================================
# DEMAINSITE ECOSYSTEME - LOCALISER CSV GEOGRAPHIE
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $Root "data"

Write-Host "Recherche du fichier communes-departement-region.csv et CSV geographiques..." -ForegroundColor Cyan
Write-Host ""

$results = @()

$knownCandidates = @(
    (Join-Path $env:USERPROFILE "DemainSite\DemainSite ecosysteme - Bibliotheque Centrale\DSE-INSTALLER-GEOGRAPHIE-FRANCE-V1-1\data\communes-departement-region.csv"),
    (Join-Path $env:USERPROFILE "DemainSite\DemainSite écosystème - Bibliothèque Centrale\DSE-INSTALLER-GEOGRAPHIE-FRANCE-V1-1\data\communes-departement-region.csv"),
    (Join-Path $env:USERPROFILE "Downloads\communes-departement-region.csv"),
    (Join-Path $env:USERPROFILE "Téléchargements\communes-departement-region.csv")
)

foreach ($c in $knownCandidates) {
    if (Test-Path $c) { $results += Get-Item $c }
}

foreach ($folder in @("DemainSite", "Downloads", "Téléchargements", "OneDrive", "Documents")) {
    $path = Join-Path $env:USERPROFILE $folder
    if (Test-Path $path) {
        Write-Host "Recherche dans : $path" -ForegroundColor Yellow
        $results += Get-ChildItem -Path $path -Recurse -File |
            Where-Object {
                $_.Name -eq "communes-departement-region.csv" -or
                ($_.Extension -eq ".csv" -and $_.Name -match "communes|villes|codes.postaux|departement|region")
            }
    }
}

$results = $results | Sort-Object FullName -Unique | Sort-Object LastWriteTime -Descending

if (@($results).Count -eq 0) {
    Write-Host "Aucun CSV geographique trouve." -ForegroundColor Red
    Write-Host "Depose le CSV dans : $dataDir" -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "CSV trouves :" -ForegroundColor Green
$results | Select-Object LastWriteTime, Length, FullName | Format-Table -AutoSize

$best = $results | Select-Object -First 1
Write-Host ""
Write-Host "CSV conseille : $($best.FullName)" -ForegroundColor Green
Write-Host ""
Write-Host "Tu peux le copier dans le dossier data, ou lancer le reimport V1.1 qui le trouvera automatiquement." -ForegroundColor Cyan
