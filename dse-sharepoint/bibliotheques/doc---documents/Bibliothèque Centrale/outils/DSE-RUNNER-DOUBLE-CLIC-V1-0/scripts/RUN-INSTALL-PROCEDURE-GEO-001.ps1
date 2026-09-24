# ============================================================
# DEMAINSITE ECOSYSTEME
# INSTALLATION PROCEDURE OFFICIELLE GEO-001
# Version 1.0
# ============================================================

param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque",
    [string]$ListName = "Procedures"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProcedureFile = Join-Path $Root "PROCEDURE-GEO-001.md"
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $Root "INSTALL-PROCEDURE-GEO-001-$RunId.log"

Start-Transcript -Path $LogFile -Force | Out-Null

function Write-Title {
    param([string]$Text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Ensure-TextField {
    param([string]$ListName, [string]$DisplayName, [string]$InternalName, [bool]$MultiLine = $false)
    $field = Get-PnPField -List $ListName -Identity $InternalName -ErrorAction SilentlyContinue
    if ($null -eq $field) {
        if ($MultiLine) {
            Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Note -AddToDefaultView | Out-Null
        }
        else {
            Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Text -AddToDefaultView | Out-Null
        }
        Write-Host "Colonne creee : $DisplayName" -ForegroundColor Green
    }
    else {
        Write-Host "Colonne deja presente : $DisplayName" -ForegroundColor DarkGreen
    }
}

try {
    Write-Title "INSTALLATION PROCEDURE GEO-001"

    try {
        Get-PnPWeb -ErrorAction Stop | Out-Null
        Write-Host "Connexion SharePoint deja active." -ForegroundColor Green
    }
    catch {
        Write-Host "Connexion SharePoint absente. Connexion DeviceLogin..." -ForegroundColor Yellow
        Connect-PnPOnline -Url $SiteUrl -DeviceLogin
        Write-Host "Connexion SharePoint OK : $SiteUrl" -ForegroundColor Green
    }

    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list) {
        New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null
        Write-Host "Liste creee : $ListName" -ForegroundColor Green
    }
    else {
        Write-Host "Liste presente : $ListName" -ForegroundColor Green
    }

    Ensure-TextField -ListName $ListName -DisplayName "Code procedure" -InternalName "CodeProcedure"
    Ensure-TextField -ListName $ListName -DisplayName "Version procedure" -InternalName "VersionProcedure"
    Ensure-TextField -ListName $ListName -DisplayName "Statut procedure" -InternalName "StatutProcedure"
    Ensure-TextField -ListName $ListName -DisplayName "Domaine procedure" -InternalName "DomaineProcedure"
    Ensure-TextField -ListName $ListName -DisplayName "Contenu procedure" -InternalName "ContenuProcedure" -MultiLine $true

    if (-not (Test-Path $ProcedureFile)) {
        throw "Fichier procedure introuvable : $ProcedureFile"
    }

    $content = Get-Content -Path $ProcedureFile -Raw -Encoding UTF8
    $title = "GEO-001 - Referentiel Geographique France"

    $existing = Get-PnPListItem -List $ListName -PageSize 100 -Fields "Title","CodeProcedure" | Where-Object {
        $_["Title"] -eq $title -or $_["CodeProcedure"] -eq "GEO-001"
    } | Select-Object -First 1

    $values = @{
        "Title" = $title
        "CodeProcedure" = "GEO-001"
        "VersionProcedure" = "1.0"
        "StatutProcedure" = "Officielle"
        "DomaineProcedure" = "Geographie"
        "ContenuProcedure" = $content
    }

    if ($null -eq $existing) {
        Add-PnPListItem -List $ListName -Values $values | Out-Null
        Write-Host "Procedure creee : $title" -ForegroundColor Green
    }
    else {
        Set-PnPListItem -List $ListName -Identity $existing.Id -Values $values | Out-Null
        Write-Host "Procedure mise a jour : $title" -ForegroundColor Yellow
    }

    Write-Host "Installation procedure GEO-001 terminee." -ForegroundColor Green
    Write-Host "Log : $LogFile" -ForegroundColor Cyan
}
catch {
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Stop-Transcript | Out-Null
}
