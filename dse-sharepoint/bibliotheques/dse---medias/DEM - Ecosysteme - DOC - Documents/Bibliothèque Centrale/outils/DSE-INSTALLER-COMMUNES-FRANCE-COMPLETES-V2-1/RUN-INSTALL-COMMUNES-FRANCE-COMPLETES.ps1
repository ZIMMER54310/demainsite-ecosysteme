# ============================================================
# DEMAINSITE ECOSYSTEME - INSTALLER COMMUNES FRANCE COMPLETES
# V2.1 - Pays + Regions + Departements + Villes + CodesPostaux + CP/Villes - source communes obligatoire
# ============================================================
# Regles : aucune suppression automatique, ajout/mise a jour uniquement.
# Source prioritaire : CSV enrichi communes-departement-region.
# ============================================================

param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque",
    [ValidateSet("Update","AuditOnly")]
    [string]$Mode = "Update",
    [string]$CsvPath = "",
    [int]$MaxRows = 0
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $Root "logs\DSE-COMMUNES-FRANCE-$RunId.log"
Start-Transcript -Path $LogFile -Force | Out-Null

$ListPays = "Pays"
$ListRegions = "Regions"
$ListDepartements = "Departements"
$ListVilles = "Villes"
$ListCodesPostaux = "CodesPostaux"
$ListCodesPostauxVilles = "CodesPostauxVilles"
$ListJournalActions = "Journal actions"
$ListJournalErreurs = "Journal erreurs"

function WTitle { param([string]$Text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Connect-DSE {
    try { Get-PnPWeb -ErrorAction Stop | Out-Null; Write-Host "Connexion SharePoint deja active." -ForegroundColor Green }
    catch { Write-Host "Connexion SharePoint absente. Connexion DeviceLogin..." -ForegroundColor Yellow; Connect-PnPOnline -Url $SiteUrl -DeviceLogin; Write-Host "Connexion SharePoint OK : $SiteUrl" -ForegroundColor Green }
}

function Ensure-List { param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list) {
        if ($Mode -eq "Update") { New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null }
        Write-Host "Liste preparee : $ListName" -ForegroundColor Green
    }
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

function Add-Journal { param([string]$ListName,[string]$Type,[string]$Objet,[string]$Message,[string]$Statut)
    if ($Mode -ne "Update") { return }
    try { Add-PnPListItem -List $ListName -Values @{ "Title"="Communes France $RunId"; "TypeJournal"=$Type; "Module"="Geographie"; "Objet"=$Objet; "Message"=$Message; "Statut"=$Statut } | Out-Null }
    catch { Write-Host "Journal non ecrit : $($_.Exception.Message)" -ForegroundColor Yellow }
}

function Ensure-Structure {
    WTitle "PREPARATION DES LISTES ET COLONNES"
    foreach ($ln in @($ListPays,$ListRegions,$ListDepartements,$ListVilles,$ListCodesPostaux,$ListCodesPostauxVilles,$ListJournalActions,$ListJournalErreurs)) { Ensure-List $ln }

    foreach ($ln in @($ListJournalActions,$ListJournalErreurs)) {
        Ensure-TextField $ln "Type" "TypeJournal"; Ensure-TextField $ln "Module" "Module"; Ensure-TextField $ln "Objet" "Objet"; Ensure-TextField $ln "Message" "Message"; Ensure-TextField $ln "Statut" "Statut"
    }

    Ensure-TextField $ListPays "ID Pays" "IDPays"; Ensure-TextField $ListPays "Code Pays" "CodePays"; Ensure-TextField $ListPays "Code ISO2" "CodeISO2"; Ensure-TextField $ListPays "Statut Geo" "StatutGeo"

    Ensure-TextField $ListRegions "ID Region" "IDRegion"; Ensure-TextField $ListRegions "Code Region" "CodeRegion"; Ensure-TextField $ListRegions "Nom Region" "NomRegion"; Ensure-TextField $ListRegions "Pays" "PaysTexte"; Ensure-TextField $ListRegions "Statut Geo" "StatutGeo"

    Ensure-TextField $ListDepartements "ID Departement" "IDDepartement"; Ensure-TextField $ListDepartements "Code Departement" "CodeDepartement"; Ensure-TextField $ListDepartements "Nom Departement" "NomDepartement"; Ensure-TextField $ListDepartements "Code Region" "CodeRegion"; Ensure-TextField $ListDepartements "Nom Region" "NomRegion"; Ensure-TextField $ListDepartements "Pays" "PaysTexte"; Ensure-TextField $ListDepartements "Statut Geo" "StatutGeo"

    Ensure-TextField $ListVilles "ID Ville" "IDVille"; Ensure-TextField $ListVilles "Code INSEE" "CodeINSEE"; Ensure-TextField $ListVilles "Nom Ville" "NomVille"; Ensure-TextField $ListVilles "Nom postal" "NomPostal"; Ensure-TextField $ListVilles "Code Departement" "CodeDepartement"; Ensure-TextField $ListVilles "Nom Departement" "NomDepartement"; Ensure-TextField $ListVilles "Code Region" "CodeRegion"; Ensure-TextField $ListVilles "Nom Region" "NomRegion"; Ensure-TextField $ListVilles "Pays" "PaysTexte"; Ensure-TextField $ListVilles "Latitude" "Latitude"; Ensure-TextField $ListVilles "Longitude" "Longitude"; Ensure-TextField $ListVilles "Statut Geo" "StatutGeo"

    Ensure-TextField $ListCodesPostaux "ID Code Postal" "IDCodePostal"; Ensure-TextField $ListCodesPostaux "Code Postal" "CodePostal"; Ensure-TextField $ListCodesPostaux "Pays" "PaysTexte"; Ensure-NumberField $ListCodesPostaux "Nombre Villes" "NombreVilles"; Ensure-TextField $ListCodesPostaux "Regions associees" "RegionsAssociees"; Ensure-TextField $ListCodesPostaux "Departements associes" "DepartementsAssocies"; Ensure-TextField $ListCodesPostaux "Statut Geo" "StatutGeo"

    Ensure-TextField $ListCodesPostauxVilles "ID CP Ville" "IDCPVille"; Ensure-TextField $ListCodesPostauxVilles "Cle CP Ville" "CleCPVille"; Ensure-TextField $ListCodesPostauxVilles "Code Postal" "CodePostal"; Ensure-TextField $ListCodesPostauxVilles "Code INSEE" "CodeINSEE"; Ensure-TextField $ListCodesPostauxVilles "Nom Ville" "NomVille"; Ensure-TextField $ListCodesPostauxVilles "Libelle acheminement" "LibelleAcheminement"; Ensure-TextField $ListCodesPostauxVilles "Ligne 5" "Ligne5"; Ensure-TextField $ListCodesPostauxVilles "Code Departement" "CodeDepartement"; Ensure-TextField $ListCodesPostauxVilles "Nom Departement" "NomDepartement"; Ensure-TextField $ListCodesPostauxVilles "Code Region" "CodeRegion"; Ensure-TextField $ListCodesPostauxVilles "Nom Region" "NomRegion"; Ensure-TextField $ListCodesPostauxVilles "Pays" "PaysTexte"; Ensure-TextField $ListCodesPostauxVilles "Latitude" "Latitude"; Ensure-TextField $ListCodesPostauxVilles "Longitude" "Longitude"; Ensure-TextField $ListCodesPostauxVilles "Statut Geo" "StatutGeo"
}

function Count-CsvLinesQuick {
    param([string]$Path)
    try {
        $count = 0
        Get-Content -Path $Path -Encoding UTF8 | ForEach-Object { $count++ }
        if ($count -gt 0) { return ($count - 1) }
        return 0
    }
    catch { return 0 }
}

function Test-SourceCsvCandidate {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $lines = Count-CsvLinesQuick -Path $Path
    Write-Host "Controle source CSV : $Path / lignes donnees = $lines" -ForegroundColor Cyan
    if ($lines -lt 30000) {
        Write-Host "Source refusee : moins de 30000 lignes. Ce n'est probablement pas le fichier des communes." -ForegroundColor Yellow
        return $false
    }
    $header = Get-Content -Path $Path -TotalCount 1 -Encoding UTF8
    if ($header -notmatch "commune|INSEE|postal|departement|region|code") {
        Write-Host "Source refusee : entete non geographique." -ForegroundColor Yellow
        return $false
    }
    return $true
}

function Get-ResourceScore {
    param($Resource)
    $txt = (($Resource.title + " " + $Resource.url + " " + $Resource.latest + " " + $Resource.description) -as [string]).ToLowerInvariant()
    $score = 0
    if ($txt -match "communes-departement-region") { $score += 1000 }
    if ($txt -match "communes.*departement.*region") { $score += 500 }
    if ($txt -match "code.*postal") { $score += 250 }
    if ($txt -match "commune") { $score += 250 }
    if ($txt -match "insee") { $score += 150 }
    if ($txt -match "region") { $score += 50 }
    if ($txt -match "departement") { $score += 50 }
    if ($txt -match "regions-france") { $score -= 1000 }
    if ($txt -match "departements-france") { $score -= 900 }
    return $score
}

function Download-SourceCsv {
    $dataDir = Join-Path $Root "data"
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

    # 1. Chemin parametre, accepte seulement si source complete
    if ($CsvPath -and (Test-Path $CsvPath)) {
        if (Test-SourceCsvCandidate -Path $CsvPath) { return (Resolve-Path $CsvPath).Path }
        throw "Le CSV fourni en parametre existe mais ne contient pas assez de communes."
    }

    # 2. CSV deja dans data, mais on ignore les petits fichiers comme regions-france.csv
    $existingList = Get-ChildItem -Path $dataDir -Filter *.csv -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    foreach ($existing in $existingList) {
        if (Test-SourceCsvCandidate -Path $existing.FullName) {
            Write-Host "CSV complet deja present : $($existing.FullName)" -ForegroundColor Green
            return $existing.FullName
        }
    }

    WTitle "TELECHARGEMENT AUTOMATIQUE DU CSV DES COMMUNES"

    $apiUrls = @(
        "https://www.data.gouv.fr/api/1/datasets/communes-de-france-base-des-codes-postaux/",
        "https://www.data.gouv.fr/api/1/datasets/base-officielle-des-codes-postaux/"
    )

    foreach ($apiUrl in $apiUrls) {
        try {
            Write-Host "Interrogation : $apiUrl" -ForegroundColor Cyan
            $dataset = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing
            $resources = @($dataset.resources) | Where-Object { ($_.format -match "csv" -or $_.mime -match "csv" -or $_.url -match "\.csv") }
            $ranked = $resources | ForEach-Object {
                [PSCustomObject]@{ Resource = $_; Score = (Get-ResourceScore -Resource $_) }
            } | Sort-Object Score -Descending

            foreach ($candidate in $ranked) {
                $resource = $candidate.Resource
                if (-not $resource.url) { continue }
                $safeName = ($resource.title -replace '[^a-zA-Z0-9._-]', '-')
                if (-not $safeName) { $safeName = "source-communes" }
                $target = Join-Path $dataDir ("$safeName.csv")
                Write-Host "Essai telechargement : $($resource.title) / score $($candidate.Score)" -ForegroundColor Cyan
                try {
                    Invoke-WebRequest -Uri $resource.url -OutFile $target -UseBasicParsing
                    if (Test-SourceCsvCandidate -Path $target) {
                        Write-Host "Source CSV complete validee : $target" -ForegroundColor Green
                        return $target
                    }
                }
                catch {
                    Write-Host "Echec telechargement ressource : $($resource.title)" -ForegroundColor Yellow
                }
            }
        }
        catch { Write-Host "Source non disponible : $apiUrl" -ForegroundColor Yellow }
    }

    # 3. Recherche locale probable, seulement si source complete
    foreach ($folder in @("DemainSite", "Downloads", "Téléchargements", "OneDrive", "Documents")) {
        $path = Join-Path $env:USERPROFILE $folder
        if (Test-Path $path) {
            Write-Host "Recherche locale dans : $path" -ForegroundColor Yellow
            $foundList = Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Extension -eq ".csv" -and $_.Name -match "communes|villes|code|departement|region" } |
                Sort-Object LastWriteTime -Descending
            foreach ($found in $foundList) {
                if (Test-SourceCsvCandidate -Path $found.FullName) {
                    Write-Host "CSV local complet trouve : $($found.FullName)" -ForegroundColor Green
                    return $found.FullName
                }
            }
        }
    }

    throw "Impossible de trouver ou telecharger un CSV complet des communes. Depose le fichier communes-departement-region.csv dans le dossier data puis relance."
}

function Import-DSECsv { param([string]$Path)
    $first = Get-Content -Path $Path -TotalCount 1 -Encoding UTF8
    $delimiter = ','
    if ((($first.ToCharArray() | Where-Object { $_ -eq ';' }).Count) -gt (($first.ToCharArray() | Where-Object { $_ -eq ',' }).Count)) { $delimiter = ';' }
    Write-Host "CSV utilise : $Path" -ForegroundColor Cyan
    Write-Host "Separateur detecte : $delimiter" -ForegroundColor Cyan
    $rows = Import-Csv -Path $Path -Delimiter $delimiter -Encoding UTF8
    if ($MaxRows -gt 0) { return $rows | Select-Object -First $MaxRows }
    return $rows
}

function GP { param($Row,[string[]]$Names)
    foreach ($n in $Names) { if ($Row.PSObject.Properties.Name -contains $n) { $v=$Row.$n; if ($null -ne $v -and "$v".Trim() -ne "") { return "$v".Trim() } } }
    return ""
}
function NCP { param([string]$v) if (-not $v) { return "" }; $x=$v.Trim(); if ($x -match '^[0-9]+$' -and $x.Length -lt 5) { return $x.PadLeft(5,'0') }; return $x }
function NDEP { param([string]$v) if (-not $v) { return "" }; $x=$v.Trim(); if ($x -match '^[0-9]+$' -and $x.Length -eq 1) { return $x.PadLeft(2,'0') }; return $x }

function BuildIndex { param([string]$ListName,[string]$KeyField,[string[]]$Fields)
    Write-Host "Index : $ListName / $KeyField" -ForegroundColor Cyan
    $items = Get-PnPListItem -List $ListName -PageSize 2000 -Fields $Fields
    $map = @{}
    foreach ($it in $items) { $k=""; try { $k="$($it[$KeyField])".Trim() } catch {}; if ($k -and -not $map.ContainsKey($k)) { $map[$k]=$it } }
    Write-Host "Index $ListName : $($map.Count)" -ForegroundColor Green
    return $map
}

function UpsertItem { param([string]$ListName,[hashtable]$Index,[string]$Key,[hashtable]$Values,[string]$ActionName)
    if ($Index.ContainsKey($Key)) {
        if ($Mode -eq "Update") { Set-PnPListItem -List $ListName -Identity $Index[$Key].Id -Values $Values | Out-Null }
        return "MAJ"
    } else {
        if ($Mode -eq "Update") { $new = Add-PnPListItem -List $ListName -Values $Values; $Index[$Key]=$new }
        return "AJOUT"
    }
}

try {
    WTitle "DEMAINSITE - INSTALLATION COMMUNES FRANCE COMPLETES V2.1"
    Write-Host "Mode : $Mode" -ForegroundColor Cyan
    Connect-DSE
    Ensure-Structure
    $csv = Download-SourceCsv
    $rows = Import-DSECsv -Path $csv
    $total = @($rows).Count
    Write-Host "Lignes source : $total" -ForegroundColor Green

    if ($total -lt 30000) { Write-Host "ATTENTION : source inferieure a 30000 lignes. Verification conseillee." -ForegroundColor Yellow }

    WTitle "LECTURE DES INDEX SHAREPOINT"
    $paysIdx = BuildIndex $ListPays "CodePays" @("Title","CodePays")
    $regIdx = BuildIndex $ListRegions "CodeRegion" @("Title","CodeRegion")
    $depIdx = BuildIndex $ListDepartements "CodeDepartement" @("Title","CodeDepartement")
    $villeIdx = BuildIndex $ListVilles "CodeINSEE" @("Title","CodeINSEE")
    $cpIdx = BuildIndex $ListCodesPostaux "CodePostal" @("Title","CodePostal")
    $cpvIdx = BuildIndex $ListCodesPostauxVilles "CleCPVille" @("Title","CleCPVille")

    if (-not $paysIdx.ContainsKey("FR")) {
        if ($Mode -eq "Update") { $newp = Add-PnPListItem -List $ListPays -Values @{ "Title"="France"; "IDPays"="PAY-FR"; "CodePays"="FR"; "CodeISO2"="FR"; "StatutGeo"="Actif" }; $paysIdx["FR"]=$newp }
    }

    $stats = [ordered]@{ RegionsAjoutees=0; RegionsMaj=0; DepartementsAjoutes=0; DepartementsMaj=0; VillesAjoutees=0; VillesMaj=0; CodesPostauxAjoutes=0; CodesPostauxMaj=0; RelationsAjoutees=0; RelationsMaj=0; LignesIgnorees=0 }
    $cpStats = @{}

    WTitle "IMPORT / MISE A JOUR DES COMMUNES"
    foreach ($row in $rows) {
        $insee = GP $row @("code_commune_INSEE","Code_commune_INSEE","CODE_COMMUNE_INSEE","COM","CodeINSEE","code_insee")
        $nomVille = GP $row @("nom_commune_complet","Nom_commune_complet","nom_commune","Nom_commune","NomVille","LIBELLE")
        $nomPostal = GP $row @("nom_commune_postal","Nom_commune_postal","Libelle_acheminement","libelle_acheminement","NomPostal")
        $cp = NCP (GP $row @("code_postal","Code_postal","CODE_POSTAL","CodePostal"))
        $libelle = GP $row @("libelle_acheminement","Libelle_acheminement","LIBELLE_ACHM")
        $ligne5 = GP $row @("ligne_5","Ligne_5","LIGNE_5")
        $lat = GP $row @("latitude","Latitude","LAT")
        $lon = GP $row @("longitude","Longitude","LON")
        $depCode = NDEP (GP $row @("code_departement","Code_departement","DEP","CodeDepartement"))
        $depName = GP $row @("nom_departement","Nom_departement","NomDepartement")
        $regCode = GP $row @("code_region","Code_region","REG","CodeRegion")
        $regName = GP $row @("nom_region","Nom_region","NomRegion")

        if (-not $insee -or -not $nomVille -or -not $cp) { $stats.LignesIgnorees++; continue }

        if ($regCode) {
            $r = UpsertItem $ListRegions $regIdx $regCode @{ "Title"=$regName; "IDRegion"="REG-$regCode"; "CodeRegion"=$regCode; "NomRegion"=$regName; "PaysTexte"="France"; "StatutGeo"="Actif" } "Region"
            if ($r -eq "AJOUT") { $stats.RegionsAjoutees++ } else { $stats.RegionsMaj++ }
        }
        if ($depCode) {
            $d = UpsertItem $ListDepartements $depIdx $depCode @{ "Title"="$depCode - $depName"; "IDDepartement"="DEP-$depCode"; "CodeDepartement"=$depCode; "NomDepartement"=$depName; "CodeRegion"=$regCode; "NomRegion"=$regName; "PaysTexte"="France"; "StatutGeo"="Actif" } "Departement"
            if ($d -eq "AJOUT") { $stats.DepartementsAjoutes++ } else { $stats.DepartementsMaj++ }
        }

        $v = UpsertItem $ListVilles $villeIdx $insee @{ "Title"=$nomVille; "IDVille"="VIL-$insee"; "CodeINSEE"=$insee; "NomVille"=$nomVille; "NomPostal"=$nomPostal; "CodeDepartement"=$depCode; "NomDepartement"=$depName; "CodeRegion"=$regCode; "NomRegion"=$regName; "PaysTexte"="France"; "Latitude"=$lat; "Longitude"=$lon; "StatutGeo"="Actif" } "Ville"
        if ($v -eq "AJOUT") { $stats.VillesAjoutees++ } else { $stats.VillesMaj++ }

        if (-not $cpStats.ContainsKey($cp)) { $cpStats[$cp] = [ordered]@{ Villes=@{}; Deps=@{}; Regs=@{} } }
        $cpStats[$cp].Villes[$insee]=$true; if ($depCode) { $cpStats[$cp].Deps[$depCode]=$true }; if ($regCode) { $cpStats[$cp].Regs[$regCode]=$true }

        $c = UpsertItem $ListCodesPostaux $cpIdx $cp @{ "Title"=$cp; "IDCodePostal"="CP-$cp"; "CodePostal"=$cp; "PaysTexte"="France"; "StatutGeo"="Actif" } "CodePostal"
        if ($c -eq "AJOUT") { $stats.CodesPostauxAjoutes++ } else { $stats.CodesPostauxMaj++ }

        $cle = "$cp|$insee"
        $rel = UpsertItem $ListCodesPostauxVilles $cpvIdx $cle @{ "Title"=$cle; "IDCPVille"="CPV-$cp-$insee"; "CleCPVille"=$cle; "CodePostal"=$cp; "CodeINSEE"=$insee; "NomVille"=$nomVille; "LibelleAcheminement"=$libelle; "Ligne5"=$ligne5; "CodeDepartement"=$depCode; "NomDepartement"=$depName; "CodeRegion"=$regCode; "NomRegion"=$regName; "PaysTexte"="France"; "Latitude"=$lat; "Longitude"=$lon; "StatutGeo"="Actif" } "CPVille"
        if ($rel -eq "AJOUT") { $stats.RelationsAjoutees++ } else { $stats.RelationsMaj++ }

        $done = $stats.VillesAjoutees + $stats.VillesMaj + $stats.LignesIgnorees
        if (($done % 1000) -eq 0) { Write-Host "Lignes traitees : $done / $total" -ForegroundColor DarkGreen }
    }

    WTitle "MISE A JOUR DES COMPTEURS CODES POSTAUX"
    foreach ($cpKey in $cpStats.Keys) {
        if ($cpIdx.ContainsKey($cpKey)) {
            $deps = ($cpStats[$cpKey].Deps.Keys | Sort-Object) -join ","
            $regs = ($cpStats[$cpKey].Regs.Keys | Sort-Object) -join ","
            $nb = $cpStats[$cpKey].Villes.Keys.Count
            if ($Mode -eq "Update") { Set-PnPListItem -List $ListCodesPostaux -Identity $cpIdx[$cpKey].Id -Values @{ "NombreVilles"=$nb; "DepartementsAssocies"=$deps; "RegionsAssociees"=$regs; "StatutGeo"="Actif" } | Out-Null }
        }
    }

    WTitle "RAPPORT FINAL"
    $stats.GetEnumerator() | Format-Table -AutoSize
    $msg = "Installation communes France complete. Source=$csv. Lignes=$total. Villes ajoutees=$($stats.VillesAjoutees), villes MAJ=$($stats.VillesMaj), relations ajoutees=$($stats.RelationsAjoutees), relations MAJ=$($stats.RelationsMaj), ignorees=$($stats.LignesIgnorees). Log=$LogFile"
    Add-Journal $ListJournalActions "Import" "Communes France completes" $msg "Termine"
    Write-Host $msg -ForegroundColor Green
    Write-Host "Log : $LogFile" -ForegroundColor Cyan
}
catch {
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    try { Add-Journal $ListJournalErreurs "Erreur" "Communes France completes" $_.Exception.Message "Erreur" } catch {}
}
finally { Stop-Transcript | Out-Null }
