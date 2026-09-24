# ============================================================
# DEMAINSITE ECOSYSTEME - IMPORT PAYS MONDE V2.0
# Connexion SharePoint valide : DeviceLogin + Tenant + ClientId
# ============================================================

param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque",
    [string]$Tenant = "demainsite.com",
    [string]$ClientId = "5d607413-77c5-47b2-975a-eaca6827921c",
    [ValidateSet("Update","AuditOnly")]
    [string]$Mode = "Update",
    [string]$CsvPath = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $Root "logs\DSE-IMPORT-PAYS-MONDE-$RunId.log"
Start-Transcript -Path $LogFile -Force | Out-Null

$ListPays = "Pays"
$ListJournalActions = "Journal actions"
$ListJournalErreurs = "Journal erreurs"
$SourceRawUrl = "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.csv"

function WTitle { param([string]$Text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Connect-DSESharePoint {
    WTitle "CONNEXION SHAREPOINT DEMAINSITE"
    try {
        Get-PnPWeb -ErrorAction Stop | Out-Null
        Write-Host "Connexion SharePoint deja active." -ForegroundColor Green
    }
    catch {
        Write-Host "Connexion SharePoint absente. Connexion DeviceLogin..." -ForegroundColor Yellow
        Connect-PnPOnline -Url $SiteUrl -Tenant $Tenant -ClientId $ClientId -DeviceLogin
        Write-Host "Connexion SharePoint OK : $SiteUrl" -ForegroundColor Green
    }
}

function Ensure-List { param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list) {
        if ($Mode -eq "Update") {
            New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null
        }
        Write-Host "Liste preparee : $ListName" -ForegroundColor Green
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

function Ensure-DateField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        if ($Mode -eq "Update") {
            Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type DateTime -AddToDefaultView | Out-Null
        }
        Write-Host "Colonne date preparee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-Structure {
    WTitle "PREPARATION LISTE PAYS"
    Ensure-List $ListPays
    Ensure-List $ListJournalActions
    Ensure-List $ListJournalErreurs

    foreach ($ln in @($ListJournalActions,$ListJournalErreurs)) {
        Ensure-TextField $ln "Type" "TypeJournal"
        Ensure-TextField $ln "Module" "Module"
        Ensure-TextField $ln "Objet" "Objet"
        Ensure-TextField $ln "Message" "Message"
        Ensure-TextField $ln "Statut" "Statut"
    }

    Ensure-TextField $ListPays "ID Pays" "IDPays"
    Ensure-TextField $ListPays "Code Pays" "CodePays"
    Ensure-TextField $ListPays "Code ISO2" "CodeISO2"
    Ensure-TextField $ListPays "Code ISO3" "CodeISO3"
    Ensure-TextField $ListPays "Code Numerique" "CodeNumerique"
    Ensure-TextField $ListPays "Nom Pays" "NomPays"
    Ensure-TextField $ListPays "Nom Pays Source" "NomPaysSource"
    Ensure-TextField $ListPays "Nom Officiel" "NomOfficiel"
    Ensure-TextField $ListPays "Continent" "Continent"
    Ensure-TextField $ListPays "Sous Region" "SousRegion"
    Ensure-TextField $ListPays "Region Intermediaire" "RegionIntermediaire"
    Ensure-TextField $ListPays "Code Region ONU" "CodeRegionONU"
    Ensure-TextField $ListPays "Code Sous Region ONU" "CodeSousRegionONU"
    Ensure-TextField $ListPays "Code ISO 3166-2" "CodeISO3166_2"
    Ensure-TextField $ListPays "Source Donnee" "SourceDonnee"
    Ensure-TextField $ListPays "Statut Geo" "StatutGeo"
    Ensure-DateField $ListPays "Date Import" "DateImport"
}

function Add-Journal { param([string]$ListName,[string]$Type,[string]$Objet,[string]$Message,[string]$Statut)
    if ($Mode -ne "Update") { return }
    try {
        Add-PnPListItem -List $ListName -Values @{
            "Title" = "Import pays monde $RunId"
            "TypeJournal" = $Type
            "Module" = "Geographie"
            "Objet" = $Objet
            "Message" = $Message
            "Statut" = $Statut
        } | Out-Null
    }
    catch { Write-Host "Journal non ecrit : $($_.Exception.Message)" -ForegroundColor Yellow }
}

function Resolve-Csv {
    $dataDir = Join-Path $Root "data"
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

    if ($CsvPath -and (Test-Path $CsvPath)) { return (Resolve-Path $CsvPath).Path }

    $existing = Get-ChildItem -Path $dataDir -Filter *.csv -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -ne $existing) {
        Write-Host "CSV present dans data : $($existing.FullName)" -ForegroundColor Green
        return $existing.FullName
    }

    WTitle "TELECHARGEMENT SOURCE ISO 3166"
    $target = Join-Path $dataDir "iso-3166-all.csv"
    try {
        Invoke-WebRequest -Uri $SourceRawUrl -OutFile $target -UseBasicParsing
        if (Test-Path $target) {
            Write-Host "Source telechargee : $target" -ForegroundColor Green
            return $target
        }
    }
    catch {
        Write-Host "Telechargement impossible : $($_.Exception.Message)" -ForegroundColor Red
    }

    throw "Aucun CSV ISO 3166 disponible. Depose un fichier all.csv dans le dossier data puis relance."
}

function Get-Prop { param($Row,[string]$Name)
    if ($Row.PSObject.Properties.Name -contains $Name) {
        $v = $Row.$Name
        if ($null -ne $v) { return "$v".Trim() }
    }
    return ""
}

function Build-PaysIndex {
    WTitle "LECTURE INDEX PAYS"
    $items = Get-PnPListItem -List $ListPays -PageSize 2000 -Fields "Title","CodePays","CodeISO2"
    $idx = @{}
    foreach ($it in $items) {
        $code = ""
        try { $code = "$($it['CodeISO2'])".Trim() } catch {}
        if (-not $code) { try { $code = "$($it['CodePays'])".Trim() } catch {} }
        if ($code -and -not $idx.ContainsKey($code)) { $idx[$code] = $it }
    }
    Write-Host "Pays existants indexes : $($idx.Count)" -ForegroundColor Green
    return $idx
}

function Ensure-View {
    param([string]$ViewName,[string]$Query,[string[]]$Fields)
    if ($Mode -ne "Update") { return }
    $allFields = Get-PnPField -List $ListPays
    $existingFields = @()
    foreach ($f in $Fields) { if ($allFields | Where-Object { $_.InternalName -eq $f }) { $existingFields += $f } }
    $view = Get-PnPView -List $ListPays -Identity $ViewName -ErrorAction SilentlyContinue
    if ($null -eq $view) {
        Add-PnPView -List $ListPays -Title $ViewName -Fields $existingFields -Query $Query -RowLimit 100 -Paged | Out-Null
        Write-Host "Vue creee : $ViewName" -ForegroundColor Green
    }
    else {
        Set-PnPView -List $ListPays -Identity $ViewName -Fields $existingFields -Values @{ ViewQuery=$Query; RowLimit=100; Paged=$true } | Out-Null
        Write-Host "Vue mise a jour : $ViewName" -ForegroundColor Yellow
    }
}

try {
    WTitle "DEMAINSITE - IMPORT PAYS MONDE V2.0"
    Write-Host "Mode : $Mode" -ForegroundColor Cyan
    Write-Host "Site : $SiteUrl" -ForegroundColor Cyan
    Write-Host "Tenant : $Tenant" -ForegroundColor Cyan
    Write-Host "ClientId : $ClientId" -ForegroundColor Cyan

    Connect-DSESharePoint
    Ensure-Structure

    $csv = Resolve-Csv
    $rows = Import-Csv -Path $csv -Delimiter ',' -Encoding UTF8
    $total = @($rows).Count
    Write-Host "Pays lus depuis la source : $total" -ForegroundColor Green

    if ($total -lt 190) {
        throw "Source pays incomplete : moins de 190 lignes. Fichier utilise : $csv"
    }

    $idx = Build-PaysIndex
    $added = 0
    $updated = 0
    $ignored = 0
    $sourceLabel = "ISO-3166-Countries-with-Regional-Codes"

    WTitle "IMPORT / MISE A JOUR PAYS"
    foreach ($r in $rows) {
        $name = Get-Prop $r "name"
        $iso2 = Get-Prop $r "alpha-2"
        $iso3 = Get-Prop $r "alpha-3"
        $num = Get-Prop $r "country-code"
        $iso31662 = Get-Prop $r "iso_3166-2"
        $region = Get-Prop $r "region"
        $sub = Get-Prop $r "sub-region"
        $inter = Get-Prop $r "intermediate-region"
        $regCode = Get-Prop $r "region-code"
        $subCode = Get-Prop $r "sub-region-code"

        if (-not $iso2 -or -not $name) { $ignored++; continue }

        $values = @{
            "Title" = $name
            "IDPays" = "PAY-$iso2"
            "CodePays" = $iso2
            "CodeISO2" = $iso2
            "CodeISO3" = $iso3
            "CodeNumerique" = $num
            "NomPays" = $name
            "NomPaysSource" = $name
            "NomOfficiel" = $name
            "Continent" = $region
            "SousRegion" = $sub
            "RegionIntermediaire" = $inter
            "CodeRegionONU" = $regCode
            "CodeSousRegionONU" = $subCode
            "CodeISO3166_2" = $iso31662
            "SourceDonnee" = $sourceLabel
            "StatutGeo" = "Actif"
            "DateImport" = (Get-Date)
        }

        if ($idx.ContainsKey($iso2)) {
            if ($Mode -eq "Update") { Set-PnPListItem -List $ListPays -Identity $idx[$iso2].Id -Values $values | Out-Null }
            $updated++
        }
        else {
            if ($Mode -eq "Update") {
                $new = Add-PnPListItem -List $ListPays -Values $values
                $idx[$iso2] = $new
            }
            $added++
        }
    }

    WTitle "CREATION VUES PAYS"
    $fields = @("Title","CodeISO2","CodeISO3","CodeNumerique","Continent","SousRegion","StatutGeo","SourceDonnee")
    Ensure-View -ViewName "Pays - Tous A-Z" -Fields $fields -Query "<OrderBy><FieldRef Name='Title' Ascending='TRUE' /></OrderBy>"
    foreach ($continent in @("Africa","Americas","Asia","Europe","Oceania")) {
        $query = "<Where><Eq><FieldRef Name='Continent' /><Value Type='Text'>$continent</Value></Eq></Where><OrderBy><FieldRef Name='Title' Ascending='TRUE' /></OrderBy>"
        Ensure-View -ViewName "Pays - $continent" -Fields $fields -Query $query
    }

    WTitle "RAPPORT FINAL"
    Write-Host "Pays source : $total" -ForegroundColor Green
    Write-Host "Pays ajoutes : $added" -ForegroundColor Green
    Write-Host "Pays mis a jour : $updated" -ForegroundColor Yellow
    Write-Host "Lignes ignorees : $ignored" -ForegroundColor Yellow
    Write-Host "Log : $LogFile" -ForegroundColor Cyan

    Add-Journal -ListName $ListJournalActions -Type "Import" -Objet "Pays monde" -Message "Import pays monde termine. Source=$csv. Source rows=$total. Ajoutes=$added. Mis a jour=$updated. Ignorees=$ignored. Log=$LogFile" -Statut "Termine"
}
catch {
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    try { Add-Journal -ListName $ListJournalErreurs -Type "Erreur" -Objet "Pays monde" -Message $_.Exception.Message -Statut "Erreur" } catch {}
}
finally {
    Stop-Transcript | Out-Null
}
