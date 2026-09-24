# ============================================================
# DEMAINSITE ECOSYSTEME - MOTEUR DE LIAISON GEOGRAPHIQUE
# V1.0 - Pays -> Regions -> Departements -> Villes -> CodesPostaux
# ============================================================
# Objectif :
# - creer les colonnes de liaison Lookup si elles manquent
# - relier automatiquement les listes geographiques entre elles
# - journaliser les actions et anomalies
# - ne jamais supprimer une donnee
#
# Listes attendues :
# Pays, Regions, Departements, Villes, CodesPostaux, CodesPostauxVilles
# ============================================================

param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque",
    [ValidateSet("AuditOnly","Update")]
    [string]$Mode = "AuditOnly",
    [int]$MaxItems = 0
)

$ErrorActionPreference = "Stop"

# -----------------------------
# Configuration
# -----------------------------
$ListPays = "Pays"
$ListRegions = "Regions"
$ListDepartements = "Departements"
$ListVilles = "Villes"
$ListCodesPostaux = "CodesPostaux"
$ListCodesPostauxVilles = "CodesPostauxVilles"
$ListJournalActions = "Journal actions"
$ListJournalErreurs = "Journal erreurs"

$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$LocalLog = Join-Path (Get-Location) "DSE-GEO-MOTEUR-LIAISONS-$RunId.log"

Start-Transcript -Path $LocalLog -Force | Out-Null

# -----------------------------
# Fonctions utilitaires
# -----------------------------
function Write-DSETitle {
    param([string]$Text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Connect-DSESharePoint {
    param([string]$Url)
    try {
        Get-PnPWeb -ErrorAction Stop | Out-Null
        Write-Host "Connexion SharePoint deja active." -ForegroundColor Green
    }
    catch {
        Write-Host "Connexion SharePoint absente. Connexion DeviceLogin..." -ForegroundColor Yellow
        Connect-PnPOnline -Url $Url -DeviceLogin
        Write-Host "Connexion SharePoint OK : $Url" -ForegroundColor Green
    }
}

function Test-DSEList {
    param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list) {
        throw "Liste introuvable : $ListName"
    }
    return $list
}

function Test-DSEField {
    param([string]$ListName, [string]$InternalName)
    $field = Get-PnPField -List $ListName -Identity $InternalName -ErrorAction SilentlyContinue
    return ($null -ne $field)
}

function Ensure-DSETextField {
    param([string]$ListName, [string]$DisplayName, [string]$InternalName)
    if (-not (Test-DSEField -ListName $ListName -InternalName $InternalName)) {
        if ($Mode -eq "Update") {
            Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Text -AddToDefaultView | Out-Null
            Write-Host "Colonne texte creee : $ListName / $DisplayName" -ForegroundColor Green
        }
        else {
            Write-Host "AUDIT : colonne texte a creer : $ListName / $DisplayName" -ForegroundColor Yellow
        }
    }
}

function Ensure-DSEJournalList {
    param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list -and $Mode -eq "Update") {
        New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null
        Write-Host "Liste journal creee : $ListName" -ForegroundColor Green
    }
    if ($Mode -eq "Update") {
        Ensure-DSETextField -ListName $ListName -DisplayName "Type" -InternalName "TypeJournal"
        Ensure-DSETextField -ListName $ListName -DisplayName "Module" -InternalName "Module"
        Ensure-DSETextField -ListName $ListName -DisplayName "Objet" -InternalName "Objet"
        Ensure-DSETextField -ListName $ListName -DisplayName "Message" -InternalName "Message"
        Ensure-DSETextField -ListName $ListName -DisplayName "Statut" -InternalName "Statut"
    }
}

function Add-DSEJournal {
    param(
        [string]$ListName,
        [string]$TypeJournal,
        [string]$Objet,
        [string]$Message,
        [string]$Statut = "Info"
    )
    if ($Mode -ne "Update") { return }
    try {
        Add-PnPListItem -List $ListName -Values @{
            "Title" = "Geo liaison $RunId"
            "TypeJournal" = $TypeJournal
            "Module" = "Geographie"
            "Objet" = $Objet
            "Message" = $Message
            "Statut" = $Statut
        } | Out-Null
    }
    catch {
        Write-Host "Journal non ecrit : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Ensure-DSELookupField {
    param(
        [string]$ListName,
        [string]$DisplayName,
        [string]$InternalName,
        [string]$TargetListName
    )

    if (Test-DSEField -ListName $ListName -InternalName $InternalName) {
        Write-Host "Colonne Lookup deja presente : $ListName / $DisplayName" -ForegroundColor DarkGreen
        return
    }

    $targetList = Test-DSEList -ListName $TargetListName
    $targetId = $targetList.Id.ToString("B")

    $xml = "<Field Type='Lookup' DisplayName='$DisplayName' Name='$InternalName' StaticName='$InternalName' List='$targetId' ShowField='Title' Required='FALSE' Group='DemainSite - Liaisons geographiques' />"

    if ($Mode -eq "Update") {
        Add-PnPFieldFromXml -List $ListName -FieldXml $xml | Out-Null
        Write-Host "Colonne Lookup creee : $ListName / $DisplayName -> $TargetListName" -ForegroundColor Green
    }
    else {
        Write-Host "AUDIT : colonne Lookup a creer : $ListName / $DisplayName -> $TargetListName" -ForegroundColor Yellow
    }
}

function Ensure-DSEGeoFields {
    Write-DSETitle "PREPARATION DES COLONNES DE LIAISON"

    # Regions -> Pays
    Ensure-DSELookupField -ListName $ListRegions -DisplayName "Pays lie" -InternalName "DSEGeoPays" -TargetListName $ListPays
    Ensure-DSETextField -ListName $ListRegions -DisplayName "Statut liaison Geo" -InternalName "DSEGeoStatutLiaison"

    # Departements -> Regions + Pays
    Ensure-DSELookupField -ListName $ListDepartements -DisplayName "Region liee" -InternalName "DSEGeoRegion" -TargetListName $ListRegions
    Ensure-DSELookupField -ListName $ListDepartements -DisplayName "Pays lie" -InternalName "DSEGeoPays" -TargetListName $ListPays
    Ensure-DSETextField -ListName $ListDepartements -DisplayName "Statut liaison Geo" -InternalName "DSEGeoStatutLiaison"

    # Villes -> Departements + Regions + Pays
    Ensure-DSELookupField -ListName $ListVilles -DisplayName "Departement lie" -InternalName "DSEGeoDepartement" -TargetListName $ListDepartements
    Ensure-DSELookupField -ListName $ListVilles -DisplayName "Region liee" -InternalName "DSEGeoRegion" -TargetListName $ListRegions
    Ensure-DSELookupField -ListName $ListVilles -DisplayName "Pays lie" -InternalName "DSEGeoPays" -TargetListName $ListPays
    Ensure-DSETextField -ListName $ListVilles -DisplayName "Statut liaison Geo" -InternalName "DSEGeoStatutLiaison"

    # CodesPostaux -> Pays + region/departement/ville principales si unique
    Ensure-DSELookupField -ListName $ListCodesPostaux -DisplayName "Pays lie" -InternalName "DSEGeoPays" -TargetListName $ListPays
    Ensure-DSELookupField -ListName $ListCodesPostaux -DisplayName "Region principale liee" -InternalName "DSEGeoRegionPrincipale" -TargetListName $ListRegions
    Ensure-DSELookupField -ListName $ListCodesPostaux -DisplayName "Departement principal lie" -InternalName "DSEGeoDepartementPrincipal" -TargetListName $ListDepartements
    Ensure-DSELookupField -ListName $ListCodesPostaux -DisplayName "Ville principale liee" -InternalName "DSEGeoVillePrincipale" -TargetListName $ListVilles
    Ensure-DSETextField -ListName $ListCodesPostaux -DisplayName "Statut liaison Geo" -InternalName "DSEGeoStatutLiaison"

    # Table de relation CP/Villes -> tout le monde
    Ensure-DSELookupField -ListName $ListCodesPostauxVilles -DisplayName "Code postal lie" -InternalName "DSEGeoCodePostal" -TargetListName $ListCodesPostaux
    Ensure-DSELookupField -ListName $ListCodesPostauxVilles -DisplayName "Ville liee" -InternalName "DSEGeoVille" -TargetListName $ListVilles
    Ensure-DSELookupField -ListName $ListCodesPostauxVilles -DisplayName "Departement lie" -InternalName "DSEGeoDepartement" -TargetListName $ListDepartements
    Ensure-DSELookupField -ListName $ListCodesPostauxVilles -DisplayName "Region liee" -InternalName "DSEGeoRegion" -TargetListName $ListRegions
    Ensure-DSELookupField -ListName $ListCodesPostauxVilles -DisplayName "Pays lie" -InternalName "DSEGeoPays" -TargetListName $ListPays
    Ensure-DSETextField -ListName $ListCodesPostauxVilles -DisplayName "Statut liaison Geo" -InternalName "DSEGeoStatutLiaison"
}

function Get-DSEItems {
    param([string]$ListName, [string[]]$Fields)
    Write-Host "Lecture : $ListName" -ForegroundColor Cyan
    if ($MaxItems -gt 0) {
        return Get-PnPListItem -List $ListName -PageSize 2000 -Fields $Fields | Select-Object -First $MaxItems
    }
    return Get-PnPListItem -List $ListName -PageSize 2000 -Fields $Fields
}

function Get-DSEValue {
    param($Item, [string]$FieldName)
    try {
        $v = $Item[$FieldName]
        if ($null -eq $v) { return "" }
        return "$v".Trim()
    }
    catch { return "" }
}

function Set-DSELookupUpdate {
    param(
        [string]$ListName,
        $Item,
        [hashtable]$Values,
        [string]$StatusMessage
    )
    if ($Mode -eq "Update") {
        $Values["DSEGeoStatutLiaison"] = $StatusMessage
        Set-PnPListItem -List $ListName -Identity $Item.Id -Values $Values | Out-Null
    }
}

function Find-ByCodeOrName {
    param(
        [hashtable]$MapByCode,
        [hashtable]$MapByName,
        [string]$Code,
        [string]$Name
    )
    if ($Code -and $MapByCode.ContainsKey($Code)) { return $MapByCode[$Code] }
    if ($Name -and $MapByName.ContainsKey($Name.ToLowerInvariant())) { return $MapByName[$Name.ToLowerInvariant()] }
    return $null
}

# -----------------------------
# Programme principal
# -----------------------------
try {
    Write-DSETitle "DEMAINSITE - MOTEUR DE LIAISONS GEOGRAPHIQUES V1.0"
    Write-Host "Site : $SiteUrl" -ForegroundColor Cyan
    Write-Host "Mode : $Mode" -ForegroundColor Cyan
    if ($MaxItems -gt 0) { Write-Host "Limite de test : $MaxItems elements par liste" -ForegroundColor Yellow }

    Connect-DSESharePoint -Url $SiteUrl

    foreach ($ln in @($ListPays,$ListRegions,$ListDepartements,$ListVilles,$ListCodesPostaux,$ListCodesPostauxVilles)) { Test-DSEList -ListName $ln | Out-Null }
    Ensure-DSEJournalList -ListName $ListJournalActions
    Ensure-DSEJournalList -ListName $ListJournalErreurs
    Ensure-DSEGeoFields

    Write-DSETitle "LECTURE DES INDEX"

    $paysItems = Get-DSEItems -ListName $ListPays -Fields @("Title")
    $regionItems = Get-DSEItems -ListName $ListRegions -Fields @("Title","CodeRegion","NomRegion")
    $depItems = Get-DSEItems -ListName $ListDepartements -Fields @("Title","CodeDepartement","NomDepartement","CodeRegion","NomRegion")
    $villeItems = Get-DSEItems -ListName $ListVilles -Fields @("Title","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion")
    $cpItems = Get-DSEItems -ListName $ListCodesPostaux -Fields @("Title","CodePostal")
    $cpvItems = Get-DSEItems -ListName $ListCodesPostauxVilles -Fields @("Title","CodePostal","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion")

    $paysFrance = $paysItems | Where-Object { (Get-DSEValue $_ "Title") -match "France" } | Select-Object -First 1
    if ($null -eq $paysFrance) { $paysFrance = $paysItems | Select-Object -First 1 }
    if ($null -eq $paysFrance) { throw "Aucun pays trouve dans la liste Pays." }

    $regionsByCode = @{}
    $regionsByName = @{}
    foreach ($r in $regionItems) {
        $code = Get-DSEValue $r "CodeRegion"
        $name = Get-DSEValue $r "NomRegion"
        $title = Get-DSEValue $r "Title"
        if ($code -and -not $regionsByCode.ContainsKey($code)) { $regionsByCode[$code] = $r }
        if ($name -and -not $regionsByName.ContainsKey($name.ToLowerInvariant())) { $regionsByName[$name.ToLowerInvariant()] = $r }
        if ($title -and -not $regionsByName.ContainsKey($title.ToLowerInvariant())) { $regionsByName[$title.ToLowerInvariant()] = $r }
    }

    $depsByCode = @{}
    $depsByName = @{}
    foreach ($d in $depItems) {
        $code = Get-DSEValue $d "CodeDepartement"
        $name = Get-DSEValue $d "NomDepartement"
        $title = Get-DSEValue $d "Title"
        if ($code -and -not $depsByCode.ContainsKey($code)) { $depsByCode[$code] = $d }
        if ($name -and -not $depsByName.ContainsKey($name.ToLowerInvariant())) { $depsByName[$name.ToLowerInvariant()] = $d }
        if ($title -and -not $depsByName.ContainsKey($title.ToLowerInvariant())) { $depsByName[$title.ToLowerInvariant()] = $d }
    }

    $villesByInsee = @{}
    foreach ($v in $villeItems) {
        $insee = Get-DSEValue $v "CodeINSEE"
        if ($insee -and -not $villesByInsee.ContainsKey($insee)) { $villesByInsee[$insee] = $v }
    }

    $cpByCode = @{}
    foreach ($cp in $cpItems) {
        $code = Get-DSEValue $cp "CodePostal"
        if (-not $code) { $code = Get-DSEValue $cp "Title" }
        if ($code -and -not $cpByCode.ContainsKey($code)) { $cpByCode[$code] = $cp }
    }

    Write-Host "Index Pays : 1 pays principal ID $($paysFrance.Id)" -ForegroundColor Green
    Write-Host "Index Regions : $($regionsByCode.Count) codes region" -ForegroundColor Green
    Write-Host "Index Departements : $($depsByCode.Count) codes departement" -ForegroundColor Green
    Write-Host "Index Villes : $($villesByInsee.Count) codes INSEE" -ForegroundColor Green
    Write-Host "Index Codes postaux : $($cpByCode.Count) codes postaux" -ForegroundColor Green

    $stats = [ordered]@{
        RegionsLiees = 0
        DepartementsLies = 0
        VillesLiees = 0
        CodesPostauxVillesLies = 0
        CodesPostauxLies = 0
        Anomalies = 0
    }

    Write-DSETitle "LIAISON REGIONS -> PAYS"
    foreach ($r in $regionItems) {
        $stats.RegionsLiees++
        Set-DSELookupUpdate -ListName $ListRegions -Item $r -Values @{ "DSEGeoPays" = $paysFrance.Id } -StatusMessage "OK - region reliee au pays"
    }
    Write-Host "Regions traitees : $($stats.RegionsLiees)" -ForegroundColor Green

    Write-DSETitle "LIAISON DEPARTEMENTS -> REGIONS -> PAYS"
    foreach ($d in $depItems) {
        $codeReg = Get-DSEValue $d "CodeRegion"
        $nomReg = Get-DSEValue $d "NomRegion"
        $region = Find-ByCodeOrName -MapByCode $regionsByCode -MapByName $regionsByName -Code $codeReg -Name $nomReg
        if ($null -eq $region) {
            $stats.Anomalies++
            $msg = "Departement non relie a une region : ID=$($d.Id), CodeRegion=$codeReg, NomRegion=$nomReg"
            Write-Host $msg -ForegroundColor Yellow
            Add-DSEJournal -ListName $ListJournalErreurs -TypeJournal "Anomalie" -Objet "Departement" -Message $msg -Statut "A verifier"
            continue
        }
        $stats.DepartementsLies++
        Set-DSELookupUpdate -ListName $ListDepartements -Item $d -Values @{ "DSEGeoRegion" = $region.Id; "DSEGeoPays" = $paysFrance.Id } -StatusMessage "OK - departement relie"
    }
    Write-Host "Departements relies : $($stats.DepartementsLies)" -ForegroundColor Green

    Write-DSETitle "LIAISON VILLES -> DEPARTEMENTS -> REGIONS -> PAYS"
    foreach ($v in $villeItems) {
        $codeDep = Get-DSEValue $v "CodeDepartement"
        $nomDep = Get-DSEValue $v "NomDepartement"
        $codeReg = Get-DSEValue $v "CodeRegion"
        $nomReg = Get-DSEValue $v "NomRegion"
        $dep = Find-ByCodeOrName -MapByCode $depsByCode -MapByName $depsByName -Code $codeDep -Name $nomDep
        $region = Find-ByCodeOrName -MapByCode $regionsByCode -MapByName $regionsByName -Code $codeReg -Name $nomReg
        if ($null -eq $dep -or $null -eq $region) {
            $stats.Anomalies++
            $msg = "Ville non reliee completement : ID=$($v.Id), INSEE=$(Get-DSEValue $v 'CodeINSEE'), Dep=$codeDep, Reg=$codeReg"
            Write-Host $msg -ForegroundColor Yellow
            Add-DSEJournal -ListName $ListJournalErreurs -TypeJournal "Anomalie" -Objet "Ville" -Message $msg -Statut "A verifier"
            continue
        }
        $stats.VillesLiees++
        Set-DSELookupUpdate -ListName $ListVilles -Item $v -Values @{ "DSEGeoDepartement" = $dep.Id; "DSEGeoRegion" = $region.Id; "DSEGeoPays" = $paysFrance.Id } -StatusMessage "OK - ville reliee"
        if (($stats.VillesLiees % 1000) -eq 0) { Write-Host "Villes reliees : $($stats.VillesLiees)" -ForegroundColor DarkGreen }
    }
    Write-Host "Villes reliees : $($stats.VillesLiees)" -ForegroundColor Green

    Write-DSETitle "LIAISON CODESPOSTAUXVILLES -> CP + VILLE + DEP + REGION + PAYS"
    $cpvByCp = @{}
    foreach ($rel in $cpvItems) {
        $codePostal = Get-DSEValue $rel "CodePostal"
        $codeInsee = Get-DSEValue $rel "CodeINSEE"
        $codeDep = Get-DSEValue $rel "CodeDepartement"
        $nomDep = Get-DSEValue $rel "NomDepartement"
        $codeReg = Get-DSEValue $rel "CodeRegion"
        $nomReg = Get-DSEValue $rel "NomRegion"

        $cp = $null
        if ($codePostal -and $cpByCode.ContainsKey($codePostal)) { $cp = $cpByCode[$codePostal] }
        $ville = $null
        if ($codeInsee -and $villesByInsee.ContainsKey($codeInsee)) { $ville = $villesByInsee[$codeInsee] }
        $dep = Find-ByCodeOrName -MapByCode $depsByCode -MapByName $depsByName -Code $codeDep -Name $nomDep
        $region = Find-ByCodeOrName -MapByCode $regionsByCode -MapByName $regionsByName -Code $codeReg -Name $nomReg

        if ($null -eq $cp -or $null -eq $ville -or $null -eq $dep -or $null -eq $region) {
            $stats.Anomalies++
            $msg = "Relation CP/Ville incomplete : ID=$($rel.Id), CP=$codePostal, INSEE=$codeInsee, Dep=$codeDep, Reg=$codeReg"
            Write-Host $msg -ForegroundColor Yellow
            Add-DSEJournal -ListName $ListJournalErreurs -TypeJournal "Anomalie" -Objet "CodesPostauxVilles" -Message $msg -Statut "A verifier"
            continue
        }

        if (-not $cpvByCp.ContainsKey($codePostal)) { $cpvByCp[$codePostal] = @() }
        $cpvByCp[$codePostal] += [PSCustomObject]@{ CP=$cp; Ville=$ville; Dep=$dep; Region=$region; Rel=$rel }

        $stats.CodesPostauxVillesLies++
        Set-DSELookupUpdate -ListName $ListCodesPostauxVilles -Item $rel -Values @{ "DSEGeoCodePostal" = $cp.Id; "DSEGeoVille" = $ville.Id; "DSEGeoDepartement" = $dep.Id; "DSEGeoRegion" = $region.Id; "DSEGeoPays" = $paysFrance.Id } -StatusMessage "OK - relation CP/Ville reliee"
        if (($stats.CodesPostauxVillesLies % 1000) -eq 0) { Write-Host "Relations CP/Villes reliees : $($stats.CodesPostauxVillesLies)" -ForegroundColor DarkGreen }
    }
    Write-Host "Relations CP/Villes reliees : $($stats.CodesPostauxVillesLies)" -ForegroundColor Green

    Write-DSETitle "LIAISON CODESPOSTAUX -> PAYS + PRINCIPAUX SI UNIQUES"
    foreach ($cp in $cpItems) {
        $codePostal = Get-DSEValue $cp "CodePostal"
        if (-not $codePostal) { $codePostal = Get-DSEValue $cp "Title" }

        $values = @{ "DSEGeoPays" = $paysFrance.Id }
        $status = "OK - code postal relie au pays"

        if ($codePostal -and $cpvByCp.ContainsKey($codePostal)) {
            $rels = $cpvByCp[$codePostal]
            $uniqueVilles = @($rels | Select-Object -ExpandProperty Ville -Unique)
            $uniqueDeps = @($rels | Select-Object -ExpandProperty Dep -Unique)
            $uniqueRegions = @($rels | Select-Object -ExpandProperty Region -Unique)

            if ($uniqueVilles.Count -eq 1) { $values["DSEGeoVillePrincipale"] = $uniqueVilles[0].Id }
            if ($uniqueDeps.Count -eq 1) { $values["DSEGeoDepartementPrincipal"] = $uniqueDeps[0].Id }
            if ($uniqueRegions.Count -eq 1) { $values["DSEGeoRegionPrincipale"] = $uniqueRegions[0].Id }

            if ($uniqueVilles.Count -gt 1 -or $uniqueDeps.Count -gt 1 -or $uniqueRegions.Count -gt 1) {
                $status = "OK - code postal avec plusieurs rattachements, detail dans CodesPostauxVilles"
            }
            else {
                $status = "OK - code postal relie avec rattachement unique"
            }
        }
        else {
            $stats.Anomalies++
            $status = "A verifier - aucune relation CP/Ville trouvee"
            Add-DSEJournal -ListName $ListJournalErreurs -TypeJournal "Anomalie" -Objet "CodesPostaux" -Message "Code postal sans relation CP/Ville : $codePostal" -Statut "A verifier"
        }

        $stats.CodesPostauxLies++
        Set-DSELookupUpdate -ListName $ListCodesPostaux -Item $cp -Values $values -StatusMessage $status
    }
    Write-Host "Codes postaux traites : $($stats.CodesPostauxLies)" -ForegroundColor Green

    Write-DSETitle "RAPPORT FINAL"
    $stats.GetEnumerator() | Format-Table -AutoSize

    Add-DSEJournal -ListName $ListJournalActions -TypeJournal "Execution" -Objet "Moteur liaisons geographiques" -Message "Execution terminee. Mode=$Mode. Regions=$($stats.RegionsLiees), Departements=$($stats.DepartementsLies), Villes=$($stats.VillesLiees), CPVilles=$($stats.CodesPostauxVillesLies), CP=$($stats.CodesPostauxLies), Anomalies=$($stats.Anomalies). Log local=$LocalLog" -Statut "Termine"

    Write-Host "Log local : $LocalLog" -ForegroundColor Cyan
    Write-Host "Moteur termine." -ForegroundColor Green
}
catch {
    Write-Host "ERREUR GENERALE : $($_.Exception.Message)" -ForegroundColor Red
    try { Add-DSEJournal -ListName $ListJournalErreurs -TypeJournal "Erreur" -Objet "Moteur liaisons geographiques" -Message $_.Exception.Message -Statut "Erreur" } catch {}
}
finally {
    Stop-Transcript | Out-Null
}
