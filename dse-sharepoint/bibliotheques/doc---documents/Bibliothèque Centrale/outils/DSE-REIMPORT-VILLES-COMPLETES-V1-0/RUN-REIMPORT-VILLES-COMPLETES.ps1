# ============================================================
# DEMAINSITE ECOSYSTEME - REIMPORT VILLES COMPLETES
# V1.0 - Villes + CodesPostaux + CodesPostauxVilles
# ============================================================
# Regles :
# - Ne supprime jamais les anciennes donnees.
# - Ajoute les villes manquantes.
# - Met a jour les villes existantes par Code INSEE.
# - Ajoute/met a jour les relations CodePostal/Ville.
# - Met a jour le nombre de villes par code postal.
# ============================================================

param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque",
    [string]$CsvPath = "",
    [int]$MaxRows = 0,
    [ValidateSet("Update","AuditOnly")]
    [string]$Mode = "Update"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $Root "logs\DSE-REIMPORT-VILLES-$RunId.log"
Start-Transcript -Path $LogFile -Force | Out-Null

$ListVilles = "Villes"
$ListCodesPostaux = "CodesPostaux"
$ListCodesPostauxVilles = "CodesPostauxVilles"
$ListJournalActions = "Journal actions"
$ListJournalErreurs = "Journal erreurs"

function Write-Title { param([string]$Text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Connect-DSE {
    try { Get-PnPWeb -ErrorAction Stop | Out-Null; Write-Host "Connexion SharePoint deja active." -ForegroundColor Green }
    catch { Write-Host "Connexion SharePoint absente. Connexion DeviceLogin..." -ForegroundColor Yellow; Connect-PnPOnline -Url $SiteUrl -DeviceLogin; Write-Host "Connexion SharePoint OK : $SiteUrl" -ForegroundColor Green }
}

function Test-Field { param([string]$ListName,[string]$InternalName)
    $f = Get-PnPField -List $ListName -Identity $InternalName -ErrorAction SilentlyContinue
    return ($null -ne $f)
}

function Ensure-TextField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        if ($Mode -eq "Update") { Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Text -AddToDefaultView | Out-Null }
        Write-Host "Colonne preparee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-NumberField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        if ($Mode -eq "Update") { Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Number -AddToDefaultView | Out-Null }
        Write-Host "Colonne nombre preparee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-List { param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list) {
        if ($Mode -eq "Update") { New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null }
        Write-Host "Liste preparee : $ListName" -ForegroundColor Green
    }
}

function Add-Journal { param([string]$ListName,[string]$Type,[string]$Objet,[string]$Message,[string]$Statut)
    if ($Mode -ne "Update") { return }
    try {
        Add-PnPListItem -List $ListName -Values @{ "Title"="Reimport villes $RunId"; "TypeJournal"=$Type; "Module"="Geographie"; "Objet"=$Objet; "Message"=$Message; "Statut"=$Statut } | Out-Null
    } catch { Write-Host "Journal non ecrit : $($_.Exception.Message)" -ForegroundColor Yellow }
}

function Ensure-Journals {
    Ensure-List $ListJournalActions
    Ensure-List $ListJournalErreurs
    foreach ($ln in @($ListJournalActions,$ListJournalErreurs)) {
        Ensure-TextField $ln "Type" "TypeJournal"
        Ensure-TextField $ln "Module" "Module"
        Ensure-TextField $ln "Objet" "Objet"
        Ensure-TextField $ln "Message" "Message"
        Ensure-TextField $ln "Statut" "Statut"
    }
}

function Get-Prop { param($Row,[string[]]$Names)
    foreach ($n in $Names) {
        if ($Row.PSObject.Properties.Name -contains $n) {
            $v = $Row.$n
            if ($null -ne $v -and "$v".Trim() -ne "") { return "$v".Trim() }
        }
    }
    return ""
}

function Normalize-CodePostal { param([string]$Value)
    if (-not $Value) { return "" }
    $v = $Value.Trim()
    if ($v -match '^[0-9]+$' -and $v.Length -lt 5) { return $v.PadLeft(5,'0') }
    return $v
}

function Normalize-Dep { param([string]$Value)
    if (-not $Value) { return "" }
    $v = $Value.Trim()
    if ($v -match '^[0-9]+$' -and $v.Length -eq 1) { return $v.PadLeft(2,'0') }
    return $v
}

function Ensure-GeoFields {
    Write-Title "PREPARATION DES LISTES ET COLONNES"
    Ensure-List $ListVilles
    Ensure-List $ListCodesPostaux
    Ensure-List $ListCodesPostauxVilles
    Ensure-Journals

    Ensure-TextField $ListVilles "ID Ville" "IDVille"
    Ensure-TextField $ListVilles "Code INSEE" "CodeINSEE"
    Ensure-TextField $ListVilles "Nom Ville" "NomVille"
    Ensure-TextField $ListVilles "Nom postal" "NomPostal"
    Ensure-TextField $ListVilles "Code Departement" "CodeDepartement"
    Ensure-TextField $ListVilles "Nom Departement" "NomDepartement"
    Ensure-TextField $ListVilles "Code Region" "CodeRegion"
    Ensure-TextField $ListVilles "Nom Region" "NomRegion"
    Ensure-TextField $ListVilles "Pays" "PaysTexte"
    Ensure-TextField $ListVilles "Latitude" "Latitude"
    Ensure-TextField $ListVilles "Longitude" "Longitude"
    Ensure-TextField $ListVilles "Statut Geo" "StatutGeo"

    Ensure-TextField $ListCodesPostaux "ID Code Postal" "IDCodePostal"
    Ensure-TextField $ListCodesPostaux "Code Postal" "CodePostal"
    Ensure-TextField $ListCodesPostaux "Pays" "PaysTexte"
    Ensure-NumberField $ListCodesPostaux "Nombre Villes" "NombreVilles"
    Ensure-TextField $ListCodesPostaux "Regions associees" "RegionsAssociees"
    Ensure-TextField $ListCodesPostaux "Departements associes" "DepartementsAssocies"
    Ensure-TextField $ListCodesPostaux "Statut Geo" "StatutGeo"

    Ensure-TextField $ListCodesPostauxVilles "ID CP Ville" "IDCPVille"
    Ensure-TextField $ListCodesPostauxVilles "Cle CP Ville" "CleCPVille"
    Ensure-TextField $ListCodesPostauxVilles "Code Postal" "CodePostal"
    Ensure-TextField $ListCodesPostauxVilles "Code INSEE" "CodeINSEE"
    Ensure-TextField $ListCodesPostauxVilles "Nom Ville" "NomVille"
    Ensure-TextField $ListCodesPostauxVilles "Libelle acheminement" "LibelleAcheminement"
    Ensure-TextField $ListCodesPostauxVilles "Ligne 5" "Ligne5"
    Ensure-TextField $ListCodesPostauxVilles "Code Departement" "CodeDepartement"
    Ensure-TextField $ListCodesPostauxVilles "Nom Departement" "NomDepartement"
    Ensure-TextField $ListCodesPostauxVilles "Code Region" "CodeRegion"
    Ensure-TextField $ListCodesPostauxVilles "Nom Region" "NomRegion"
    Ensure-TextField $ListCodesPostauxVilles "Pays" "PaysTexte"
    Ensure-TextField $ListCodesPostauxVilles "Latitude" "Latitude"
    Ensure-TextField $ListCodesPostauxVilles "Longitude" "Longitude"
    Ensure-TextField $ListCodesPostauxVilles "Statut Geo" "StatutGeo"
}

function Resolve-CsvPath {
    if ($CsvPath -and (Test-Path $CsvPath)) { return (Resolve-Path $CsvPath).Path }
    $dataDir = Join-Path $Root "data"
    $csv = Get-ChildItem -Path $dataDir -Filter *.csv -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -eq $csv) { throw "Aucun CSV trouve. Depose le fichier CSV dans le dossier data puis relance le BAT." }
    return $csv.FullName
}

function Import-DSECsv { param([string]$Path)
    $first = Get-Content -Path $Path -TotalCount 1 -Encoding UTF8
    $comma = ($first.ToCharArray() | Where-Object { $_ -eq ',' }).Count
    $semi = ($first.ToCharArray() | Where-Object { $_ -eq ';' }).Count
    $delimiter = ','
    if ($semi -gt $comma) { $delimiter = ';' }
    Write-Host "CSV : $Path" -ForegroundColor Cyan
    Write-Host "Separateur detecte : $delimiter" -ForegroundColor Cyan
    $rows = Import-Csv -Path $Path -Delimiter $delimiter -Encoding UTF8
    if ($MaxRows -gt 0) { return $rows | Select-Object -First $MaxRows }
    return $rows
}

function Build-Index { param([string]$ListName,[string]$KeyField,[string[]]$Fields)
    Write-Host "Index en cours : $ListName / $KeyField" -ForegroundColor Cyan
    $items = Get-PnPListItem -List $ListName -PageSize 2000 -Fields $Fields
    $map = @{}
    foreach ($item in $items) {
        $key = ""
        try { $key = "$($item[$KeyField])".Trim() } catch {}
        if ($key -and -not $map.ContainsKey($key)) { $map[$key] = $item }
    }
    Write-Host "Index $ListName : $($map.Count)" -ForegroundColor Green
    return $map
}

try {
    Write-Title "DEMAINSITE - REIMPORT VILLES COMPLETES V1.0"
    Write-Host "Mode : $Mode" -ForegroundColor Cyan
    Connect-DSE
    Ensure-GeoFields

    $path = Resolve-CsvPath
    $rows = Import-DSECsv -Path $path
    $total = @($rows).Count
    Write-Host "Lignes CSV lues : $total" -ForegroundColor Green

    $villesIndex = Build-Index -ListName $ListVilles -KeyField "CodeINSEE" -Fields @("Title","CodeINSEE")
    $cpIndex = Build-Index -ListName $ListCodesPostaux -KeyField "CodePostal" -Fields @("Title","CodePostal")
    $cpVilleIndex = Build-Index -ListName $ListCodesPostauxVilles -KeyField "CleCPVille" -Fields @("Title","CleCPVille")

    $stats = [ordered]@{ VillesAjoutees=0; VillesMaj=0; CPAjoutes=0; CPMaj=0; RelationsAjoutees=0; RelationsMaj=0; Ignorees=0 }
    $cpStats = @{}

    foreach ($row in $rows) {
        $insee = Get-Prop $row @("code_commune_INSEE","Code_commune_INSEE","CODE_COMMUNE_INSEE","COM","CodeINSEE","code_insee")
        $nomVille = Get-Prop $row @("nom_commune_complet","Nom_commune_complet","nom_commune","Nom_commune","NomVille","LIBELLE")
        $nomPostal = Get-Prop $row @("nom_commune_postal","Nom_commune_postal","Libelle_acheminement","libelle_acheminement","NomPostal")
        $cp = Normalize-CodePostal (Get-Prop $row @("code_postal","Code_postal","CODE_POSTAL","CodePostal"))
        $libelle = Get-Prop $row @("libelle_acheminement","Libelle_acheminement","LIBELLE_ACHM")
        $ligne5 = Get-Prop $row @("ligne_5","Ligne_5","LIGNE_5")
        $lat = Get-Prop $row @("latitude","Latitude","LAT")
        $lon = Get-Prop $row @("longitude","Longitude","LON")
        $depCode = Normalize-Dep (Get-Prop $row @("code_departement","Code_departement","DEP","CodeDepartement"))
        $depName = Get-Prop $row @("nom_departement","Nom_departement","NomDepartement")
        $regCode = Get-Prop $row @("code_region","Code_region","REG","CodeRegion")
        $regName = Get-Prop $row @("nom_region","Nom_region","NomRegion")

        if (-not $insee -or -not $nomVille -or -not $cp) { $stats.Ignorees++; continue }

        $villeValues = @{ "Title"=$nomVille; "IDVille"="VIL-$insee"; "CodeINSEE"=$insee; "NomVille"=$nomVille; "NomPostal"=$nomPostal; "CodeDepartement"=$depCode; "NomDepartement"=$depName; "CodeRegion"=$regCode; "NomRegion"=$regName; "PaysTexte"="France"; "Latitude"=$lat; "Longitude"=$lon; "StatutGeo"="Actif" }
        if ($villesIndex.ContainsKey($insee)) {
            if ($Mode -eq "Update") { Set-PnPListItem -List $ListVilles -Identity $villesIndex[$insee].Id -Values $villeValues | Out-Null }
            $stats.VillesMaj++
        } else {
            if ($Mode -eq "Update") { $new = Add-PnPListItem -List $ListVilles -Values $villeValues; $villesIndex[$insee] = $new }
            $stats.VillesAjoutees++
        }

        if (-not $cpStats.ContainsKey($cp)) { $cpStats[$cp] = [ordered]@{ Villes=@{}; Deps=@{}; Regs=@{} } }
        $cpStats[$cp].Villes[$insee] = $true
        if ($depCode) { $cpStats[$cp].Deps[$depCode] = $true }
        if ($regCode) { $cpStats[$cp].Regs[$regCode] = $true }

        if (-not $cpIndex.ContainsKey($cp)) {
            $cpValues = @{ "Title"=$cp; "IDCodePostal"="CP-$cp"; "CodePostal"=$cp; "PaysTexte"="France"; "StatutGeo"="Actif" }
            if ($Mode -eq "Update") { $newcp = Add-PnPListItem -List $ListCodesPostaux -Values $cpValues; $cpIndex[$cp] = $newcp }
            $stats.CPAjoutes++
        } else { $stats.CPMaj++ }

        $cle = "$cp|$insee"
        $relValues = @{ "Title"=$cle; "IDCPVille"="CPV-$cp-$insee"; "CleCPVille"=$cle; "CodePostal"=$cp; "CodeINSEE"=$insee; "NomVille"=$nomVille; "LibelleAcheminement"=$libelle; "Ligne5"=$ligne5; "CodeDepartement"=$depCode; "NomDepartement"=$depName; "CodeRegion"=$regCode; "NomRegion"=$regName; "PaysTexte"="France"; "Latitude"=$lat; "Longitude"=$lon; "StatutGeo"="Actif" }
        if ($cpVilleIndex.ContainsKey($cle)) {
            if ($Mode -eq "Update") { Set-PnPListItem -List $ListCodesPostauxVilles -Identity $cpVilleIndex[$cle].Id -Values $relValues | Out-Null }
            $stats.RelationsMaj++
        } else {
            if ($Mode -eq "Update") { $newrel = Add-PnPListItem -List $ListCodesPostauxVilles -Values $relValues; $cpVilleIndex[$cle] = $newrel }
            $stats.RelationsAjoutees++
        }

        $done = $stats.VillesAjoutees + $stats.VillesMaj + $stats.Ignorees
        if (($done % 1000) -eq 0) { Write-Host "Lignes traitees : $done / $total" -ForegroundColor DarkGreen }
    }

    Write-Title "MISE A JOUR DES CODES POSTAUX"
    foreach ($cpKey in $cpStats.Keys) {
        if (-not $cpIndex.ContainsKey($cpKey)) { continue }
        $countVilles = $cpStats[$cpKey].Villes.Keys.Count
        $deps = ($cpStats[$cpKey].Deps.Keys | Sort-Object) -join ","
        $regs = ($cpStats[$cpKey].Regs.Keys | Sort-Object) -join ","
        $cpValues = @{ "NombreVilles"=$countVilles; "DepartementsAssocies"=$deps; "RegionsAssociees"=$regs; "StatutGeo"="Actif" }
        if ($Mode -eq "Update") { Set-PnPListItem -List $ListCodesPostaux -Identity $cpIndex[$cpKey].Id -Values $cpValues | Out-Null }
    }

    Write-Title "RAPPORT FINAL"
    $stats.GetEnumerator() | Format-Table -AutoSize
    Add-Journal -ListName $ListJournalActions -Type "Import" -Objet "Villes et CodesPostauxVilles" -Message "Reimport termine. Lignes=$total. Villes ajoutees=$($stats.VillesAjoutees), villes MAJ=$($stats.VillesMaj), relations ajoutees=$($stats.RelationsAjoutees), relations MAJ=$($stats.RelationsMaj), ignorees=$($stats.Ignorees). Log=$LogFile" -Statut "Termine"
    Write-Host "Log : $LogFile" -ForegroundColor Cyan
    Write-Host "Reimport termine." -ForegroundColor Green
}
catch {
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    try { Add-Journal -ListName $ListJournalErreurs -Type "Erreur" -Objet "Reimport villes" -Message $_.Exception.Message -Statut "Erreur" } catch {}
}
finally { Stop-Transcript | Out-Null }
