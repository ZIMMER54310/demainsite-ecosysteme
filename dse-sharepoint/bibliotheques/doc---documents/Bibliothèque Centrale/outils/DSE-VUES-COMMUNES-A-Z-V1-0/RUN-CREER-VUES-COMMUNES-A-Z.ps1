# ============================================================
# DEMAINSITE ECOSYSTEME - VUES COMMUNES A-Z
# V1.0
# ============================================================
# Objectif : eviter une liste Villes trop lourde en creant des vues A-Z.
# Ne supprime aucune donnee.
# ============================================================

param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque",
    [ValidateSet("Update","AuditOnly")]
    [string]$Mode = "Update"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $Root "logs\DSE-VUES-COMMUNES-A-Z-$RunId.log"
Start-Transcript -Path $LogFile -Force | Out-Null

$ListVilles = "Villes"
$ListJournalActions = "Journal actions"
$ListJournalErreurs = "Journal erreurs"

function WTitle { param([string]$Text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Connect-DSE {
    try {
        Get-PnPWeb -ErrorAction Stop | Out-Null
        Write-Host "Connexion SharePoint deja active." -ForegroundColor Green
    }
    catch {
        Write-Host "Connexion SharePoint absente. Connexion DeviceLogin..." -ForegroundColor Yellow
        Connect-PnPOnline -Url $SiteUrl -DeviceLogin
        Write-Host "Connexion SharePoint OK : $SiteUrl" -ForegroundColor Green
    }
}

function Test-Field { param([string]$ListName,[string]$InternalName)
    $f = Get-PnPField -List $ListName -Identity $InternalName -ErrorAction SilentlyContinue
    return ($null -ne $f)
}

function Ensure-TextField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        if ($Mode -eq "Update") {
            Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Text -AddToDefaultView | Out-Null
        }
        Write-Host "Colonne preparee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-JournalList { param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list -and $Mode -eq "Update") {
        New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null
    }
    if ($Mode -eq "Update") {
        Ensure-TextField $ListName "Type" "TypeJournal"
        Ensure-TextField $ListName "Module" "Module"
        Ensure-TextField $ListName "Objet" "Objet"
        Ensure-TextField $ListName "Message" "Message"
        Ensure-TextField $ListName "Statut" "Statut"
    }
}

function Add-Journal { param([string]$ListName,[string]$Type,[string]$Objet,[string]$Message,[string]$Statut)
    if ($Mode -ne "Update") { return }
    try {
        Add-PnPListItem -List $ListName -Values @{ "Title"="Vues communes A-Z $RunId"; "TypeJournal"=$Type; "Module"="Geographie"; "Objet"=$Objet; "Message"=$Message; "Statut"=$Statut } | Out-Null
    } catch { Write-Host "Journal non ecrit : $($_.Exception.Message)" -ForegroundColor Yellow }
}

function Get-ExistingFieldNames { param([string]$ListName,[string[]]$Wanted)
    $fields = Get-PnPField -List $ListName
    $ok = @()
    foreach ($w in $Wanted) {
        if ($fields | Where-Object { $_.InternalName -eq $w }) { $ok += $w }
    }
    return $ok
}

function Ensure-View {
    param([string]$ViewName,[string]$Query,[string[]]$Fields)
    $existing = Get-PnPView -List $ListVilles -Identity $ViewName -ErrorAction SilentlyContinue
    $viewFields = Get-ExistingFieldNames -ListName $ListVilles -Wanted $Fields
    if ($Mode -ne "Update") {
        Write-Host "AUDIT : vue a creer/mettre a jour : $ViewName" -ForegroundColor Yellow
        return
    }
    if ($null -eq $existing) {
        Add-PnPView -List $ListVilles -Title $ViewName -Fields $viewFields -Query $Query -RowLimit 100 -Paged | Out-Null
        Write-Host "Vue creee : $ViewName" -ForegroundColor Green
    } else {
        Set-PnPView -List $ListVilles -Identity $ViewName -Fields $viewFields -Values @{ ViewQuery = $Query; RowLimit = 100; Paged = $true } | Out-Null
        Write-Host "Vue mise a jour : $ViewName" -ForegroundColor Yellow
    }
}

try {
    WTitle "DEMAINSITE - VUES COMMUNES A-Z V1.0"
    Write-Host "Mode : $Mode" -ForegroundColor Cyan
    Connect-DSE

    $list = Get-PnPList -Identity $ListVilles -Includes ItemCount
    Write-Host "Liste Villes detectee : $($list.ItemCount) elements" -ForegroundColor Green

    Ensure-JournalList $ListJournalActions
    Ensure-JournalList $ListJournalErreurs

    Ensure-TextField $ListVilles "Lettre Commune" "LettreCommune"

    WTitle "MISE A JOUR DES LETTRES COMMUNE"
    $items = Get-PnPListItem -List $ListVilles -PageSize 2000 -Fields "Title","NomVille","LettreCommune"
    $updated = 0
    foreach ($item in $items) {
        $name = ""
        try { $name = "$($item['NomVille'])".Trim() } catch {}
        if (-not $name) { try { $name = "$($item['Title'])".Trim() } catch {} }
        if (-not $name) { continue }
        $letter = $name.Substring(0,1).ToUpperInvariant()
        # Normalisation simple des accents les plus courants
        $letter = $letter.Replace('À','A').Replace('Â','A').Replace('Ä','A').Replace('Á','A')
        $letter = $letter.Replace('É','E').Replace('È','E').Replace('Ê','E').Replace('Ë','E')
        $letter = $letter.Replace('Î','I').Replace('Ï','I')
        $letter = $letter.Replace('Ô','O').Replace('Ö','O')
        $letter = $letter.Replace('Ù','U').Replace('Û','U').Replace('Ü','U')
        $letter = $letter.Replace('Ç','C')
        if ($letter -notmatch '^[A-Z]$') { $letter = "#" }
        $current = ""
        try { $current = "$($item['LettreCommune'])".Trim() } catch {}
        if ($current -ne $letter -and $Mode -eq "Update") {
            Set-PnPListItem -List $ListVilles -Identity $item.Id -Values @{ "LettreCommune" = $letter } | Out-Null
            $updated++
            if (($updated % 1000) -eq 0) { Write-Host "Lettres mises a jour : $updated" -ForegroundColor DarkGreen }
        }
    }
    Write-Host "Lettres mises a jour : $updated" -ForegroundColor Green

    WTitle "CREATION DES VUES A-Z"
    $baseFields = @("Title","LettreCommune","IDVille","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion","PaysTexte","StatutGeo")

    Ensure-View -ViewName "Communes - Toutes A-Z" -Fields $baseFields -Query "<OrderBy><FieldRef Name='NomVille' Ascending='TRUE' /></OrderBy>"

    foreach ($letter in [char[]](65..90)) {
        $l = [string]$letter
        $query = "<Where><Eq><FieldRef Name='LettreCommune' /><Value Type='Text'>$l</Value></Eq></Where><OrderBy><FieldRef Name='NomVille' Ascending='TRUE' /></OrderBy>"
        Ensure-View -ViewName "Communes - $l" -Fields $baseFields -Query $query
    }

    Ensure-View -ViewName "Communes - Autres" -Fields $baseFields -Query "<Where><Eq><FieldRef Name='LettreCommune' /><Value Type='Text'>#</Value></Eq></Where><OrderBy><FieldRef Name='NomVille' Ascending='TRUE' /></OrderBy>"

    Add-Journal $ListJournalActions "Creation vues" "Communes A-Z" "Vues A-Z creees ou mises a jour. Lettres mises a jour=$updated. Log=$LogFile" "Termine"
    WTitle "RAPPORT FINAL"
    Write-Host "Vues creees : Communes - Toutes A-Z + Communes - A a Z + Communes - Autres" -ForegroundColor Green
    Write-Host "Log : $LogFile" -ForegroundColor Cyan
}
catch {
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    try { Add-Journal $ListJournalErreurs "Erreur" "Communes A-Z" $_.Exception.Message "Erreur" } catch {}
}
finally { Stop-Transcript | Out-Null }
