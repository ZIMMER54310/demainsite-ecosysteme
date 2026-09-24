# ============================================================
# DEMAINSITE ECOSYSTEME - VILLES PAR DEPARTEMENT V1.2
# SharePoint : Bibliotheque Centrale
# Connexion : DeviceLogin + Tenant + ClientId
# Suppression automatique : NON
# ============================================================
param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque",
    [string]$Tenant = "demainsite.com",
    [string]$ClientId = "5d607413-77c5-47b2-975a-eaca6827921c",
    [string]$Choix = "STRUCTURE"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "DSE-VILLES-PAR-DEPARTEMENT-$RunId.log"
Start-Transcript -Path $LogFile -Force | Out-Null

$ListIndex = "Geo - Villes Index"
$ListJournalActions = "Journal actions"
$ListJournalErreurs = "Journal erreurs"
$ListProjets = "Projets"
$SourceApi = "https://geo.api.gouv.fr"

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
    } catch {
        Write-Host "Connexion SharePoint absente. Connexion DeviceLogin..." -ForegroundColor Yellow
        Connect-PnPOnline -Url $SiteUrl -Tenant $Tenant -ClientId $ClientId -DeviceLogin
        Write-Host "Connexion SharePoint OK : $SiteUrl" -ForegroundColor Green
    }
}

function Ensure-List { param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list) {
        New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null
        Write-Host "Liste creee : $ListName" -ForegroundColor Green
    } else {
        Write-Host "Liste presente : $ListName" -ForegroundColor DarkGreen
    }
}

function Test-Field { param([string]$ListName,[string]$InternalName)
    $f = Get-PnPField -List $ListName -Identity $InternalName -ErrorAction SilentlyContinue
    return ($null -ne $f)
}

function Ensure-TextField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Text -AddToDefaultView | Out-Null
        Write-Host "Colonne creee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-NumberField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Number -AddToDefaultView | Out-Null
        Write-Host "Colonne nombre creee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-DateField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type DateTime -AddToDefaultView | Out-Null
        Write-Host "Colonne date creee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-MultiLineTextField { param([string]$ListName,[string]$DisplayName,[string]$InternalName)
    if (-not (Test-Field -ListName $ListName -InternalName $InternalName)) {
        Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Note -AddToDefaultView | Out-Null
        Write-Host "Colonne texte long creee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Add-Journal { param([string]$TargetList,[string]$Type,[string]$Objet,[string]$Message,[string]$Statut)
    try {
        Add-PnPListItem -List $TargetList -Values @{
            "Title" = "DSE villes $RunId"
            "TypeJournal" = $Type
            "Module" = "Geographie"
            "Objet" = $Objet
            "Message" = $Message
            "Statut" = $Statut
        } | Out-Null
    } catch {
        Write-Host "Journal non ecrit : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Ensure-Journals {
    Ensure-List $ListJournalActions
    Ensure-List $ListJournalErreurs
    foreach ($ln in @($ListJournalActions,$ListJournalErreurs)) {
        Ensure-TextField $ln "Type" "TypeJournal"
        Ensure-TextField $ln "Module" "Module"
        Ensure-TextField $ln "Objet" "Objet"
        Ensure-MultiLineTextField $ln "Message" "Message"
        Ensure-TextField $ln "Statut" "Statut"
    }
}

function Ensure-IndexStructure {
    WTitle "PREPARATION INDEX VILLES"
    Ensure-List $ListIndex
    Ensure-TextField $ListIndex "Code departement" "CodeDepartement"
    Ensure-TextField $ListIndex "Nom departement" "NomDepartement"
    Ensure-TextField $ListIndex "Code region" "CodeRegion"
    Ensure-TextField $ListIndex "Liste SharePoint" "ListeSharePoint"
    Ensure-NumberField $ListIndex "Communes importees" "CommunesImportees"
    Ensure-NumberField $ListIndex "Articles WordPress" "ArticlesWordPress"
    Ensure-NumberField $ListIndex "Medias associes" "MediasAssocies"
    Ensure-NumberField $ListIndex "Produits associes" "ProduitsAssocies"
    Ensure-NumberField $ListIndex "Score completude" "ScoreCompletude"
    Ensure-TextField $ListIndex "Statut geo" "StatutGeo"
    Ensure-DateField $ListIndex "Date dernier import" "DateDernierImport"
}

function Ensure-CityListStructure { param([string]$ListName)
    Ensure-List $ListName
    Ensure-TextField $ListName "Code INSEE" "CodeINSEE"
    Ensure-TextField $ListName "Nom commune" "NomCommune"
    Ensure-TextField $ListName "Code departement" "CodeDepartement"
    Ensure-TextField $ListName "Nom departement" "NomDepartement"
    Ensure-TextField $ListName "Code region" "CodeRegion"
    Ensure-MultiLineTextField $ListName "Codes postaux" "CodesPostauxTexte"
    Ensure-NumberField $ListName "Population" "Population"
    Ensure-TextField $ListName "SIREN" "Siren"
    Ensure-TextField $ListName "Code EPCI" "CodeEpci"
    Ensure-TextField $ListName "Statut geo" "StatutGeo"
    Ensure-TextField $ListName "Article WordPress" "ArticleWordPress"
    Ensure-TextField $ListName "Produits lies" "ProduitsLies"
    Ensure-TextField $ListName "Medias lies" "MediasLies"
    Ensure-NumberField $ListName "Score completude" "ScoreCompletude"
    Ensure-TextField $ListName "Source donnee" "SourceDonnee"
    Ensure-DateField $ListName "Date import" "DateImport"
    Ensure-Views $ListName
}

function Ensure-Views { param([string]$ListName)
    $fields = @("LinkTitle","CodeINSEE","CodeDepartement","CodesPostauxTexte","Population","ArticleWordPress","ScoreCompletude","StatutGeo")
    $views = @(
        @{Title="Toutes les villes"; Query="<OrderBy><FieldRef Name='Title' Ascending='TRUE'/></OrderBy>"},
        @{Title="A completer"; Query="<Where><Lt><FieldRef Name='ScoreCompletude'/><Value Type='Number'>80</Value></Lt></Where><OrderBy><FieldRef Name='Title' Ascending='TRUE'/></OrderBy>"},
        @{Title="Sans article WordPress"; Query="<Where><IsNull><FieldRef Name='ArticleWordPress'/></IsNull></Where><OrderBy><FieldRef Name='Title' Ascending='TRUE'/></OrderBy>"},
        @{Title="Avec article WordPress"; Query="<Where><IsNotNull><FieldRef Name='ArticleWordPress'/></IsNotNull></Where><OrderBy><FieldRef Name='Title' Ascending='TRUE'/></OrderBy>"}
    )
    foreach ($v in $views) {
        $existing = Get-PnPView -List $ListName -Identity $v.Title -ErrorAction SilentlyContinue
        if ($null -eq $existing) {
            Add-PnPView -List $ListName -Title $v.Title -Fields $fields -Query $v.Query -RowLimit 100 -Paged | Out-Null
            Write-Host "Vue creee : $ListName / $($v.Title)" -ForegroundColor Green
        }
    }
}

function Get-ApiJson { param([string]$Url)
    Write-Host "Lecture API : $Url" -ForegroundColor Cyan
    return Invoke-RestMethod -Uri $Url -Method Get -Headers @{"Accept"="application/json"}
}

function Normalize-DeptCode { param([string]$Code)
    return $Code.Trim().ToUpper()
}

function Get-Departments {
    return Get-ApiJson "$SourceApi/departements"
}

function Update-IndexItem { param($Dept,[string]$ListName,[int]$Count)
    $code = Normalize-DeptCode $Dept.code
    $items = Get-PnPListItem -List $ListIndex -PageSize 500 -Fields "Title","CodeDepartement" | Where-Object { "$($_['CodeDepartement'])" -eq $code }
    $values = @{
        "Title" = "$code - $($Dept.nom)"
        "CodeDepartement" = $code
        "NomDepartement" = "$($Dept.nom)"
        "CodeRegion" = "$($Dept.codeRegion)"
        "ListeSharePoint" = $ListName
        "CommunesImportees" = $Count
        "StatutGeo" = "Importe"
        "DateDernierImport" = (Get-Date)
    }
    if ($items.Count -gt 0) {
        Set-PnPListItem -List $ListIndex -Identity $items[0].Id -Values $values | Out-Null
    } else {
        Add-PnPListItem -List $ListIndex -Values $values | Out-Null
    }
}

function Compute-Score { param($Commune)
    $score = 40
    if ($Commune.code) { $score += 15 }
    if ($Commune.codesPostaux -and $Commune.codesPostaux.Count -gt 0) { $score += 15 }
    if ($Commune.population -ne $null) { $score += 10 }
    if ($Commune.siren) { $score += 10 }
    if ($Commune.codeEpci) { $score += 10 }
    if ($score -gt 100) { $score = 100 }
    return $score
}

function Import-Department { param($Dept)
    $code = Normalize-DeptCode $Dept.code
    $listName = "Villes-$code"
    WTitle "DEPARTEMENT $code - $($Dept.nom)"
    Ensure-CityListStructure $listName
    $communes = Get-ApiJson "$SourceApi/departements/$code/communes?fields=nom,code,codeDepartement,codeRegion,codesPostaux,population,siren,codeEpci&format=json"
    $existing = @{}
    Get-PnPListItem -List $listName -PageSize 2000 -Fields "Title","CodeINSEE" | ForEach-Object {
        $ci = "$($_['CodeINSEE'])".Trim()
        if ($ci -and -not $existing.ContainsKey($ci)) { $existing[$ci] = $_ }
    }
    $count = 0
    foreach ($c in $communes) {
        $count++
        $codeInsee = "$($c.code)".Trim()
        $codesPostaux = ""
        if ($c.codesPostaux) { $codesPostaux = ($c.codesPostaux -join "; ") }
        $score = Compute-Score $c
        $values = @{
            "Title" = "$($c.nom)"
            "CodeINSEE" = $codeInsee
            "NomCommune" = "$($c.nom)"
            "CodeDepartement" = $code
            "NomDepartement" = "$($Dept.nom)"
            "CodeRegion" = "$($c.codeRegion)"
            "CodesPostauxTexte" = $codesPostaux
            "Population" = $c.population
            "Siren" = "$($c.siren)"
            "CodeEpci" = "$($c.codeEpci)"
            "StatutGeo" = "Importe"
            "ScoreCompletude" = $score
            "SourceDonnee" = "geo.api.gouv.fr"
            "DateImport" = (Get-Date)
        }
        if ($existing.ContainsKey($codeInsee)) {
            Set-PnPListItem -List $listName -Identity $existing[$codeInsee].Id -Values $values | Out-Null
        } else {
            Add-PnPListItem -List $listName -Values $values | Out-Null
        }
    }
    Update-IndexItem -Dept $Dept -ListName $listName -Count $count
    Add-Journal -TargetList $ListJournalActions -Type "Import" -Objet "Villes-$code" -Message "$count communes traitees pour $code - $($Dept.nom)" -Statut "OK"
    Write-Host "$count communes traitees pour $code - $($Dept.nom)" -ForegroundColor Green
}

function Register-ProjectNote {
    WTitle "NOTE PROJET SHAREPOINT"
    Ensure-List $ListProjets
    Ensure-TextField $ListProjets "Code projet DSE" "CodeProjetDSE"
    Ensure-TextField $ListProjets "Statut projet DSE" "StatutProjetDSE"
    Ensure-MultiLineTextField $ListProjets "Note projet DSE" "NoteProjetDSE"
    $code = "PROJET-GEO-VILLES-PAR-DEPARTEMENT"
    $note = "A prevoir dans DemainSite Ecosysteme : gestion des villes / communes par departement, avec article WordPress obligatoire futur, medias lies, produits lies, filtres, score de completude et liaison SharePoint -> WordPress. Suppression automatique interdite. Premiere etape : creation des sous-listes Villes-01, Villes-02, etc. avant import massif."
    $values = @{
        "Title" = "Geographie - Villes par departement"
        "CodeProjetDSE" = $code
        "StatutProjetDSE" = "SharePoint d'abord - structure des sous-listes"
        "NoteProjetDSE" = $note
    }

    # Correction V1.2 : evite Set-PnPListItem sans identite.
    $items = @(Get-PnPListItem -List $ListProjets -PageSize 500 -Fields "Title","CodeProjetDSE" | Where-Object { "$($_['CodeProjetDSE'])" -eq $code })
    if ($items.Count -gt 0 -and $items[0].Id) {
        Set-PnPListItem -List $ListProjets -Identity $items[0].Id -Values $values | Out-Null
        Write-Host "Projet mis a jour : $code" -ForegroundColor Green
    } else {
        Add-PnPListItem -List $ListProjets -Values $values | Out-Null
        Write-Host "Projet cree : $code" -ForegroundColor Green
    }
}

try {
    WTitle "DEMAINSITE ECOSYSTEME - VILLES PAR DEPARTEMENT V1.2"
    Connect-DSESharePoint
    Ensure-Journals
    Ensure-IndexStructure
    Register-ProjectNote

    $departements = Get-Departments
    $choice = $Choix.Trim().ToUpper()
    # V1.2 : OUI signifie creation de la structure, pas import complet.
    if ($choice -in @("OUI","OK","YES","Y","O","1","STRUCTURE","STRUCT","S")) { $choice = "STRUCTURE" }
    if ($choice -in @("ALL","TOUT","TOUS")) { $choice = "TOUS" }

    if ($choice -eq "STRUCTURE") {
        WTitle "MODE STRUCTURE"
        foreach ($d in $departements) {
            $code = Normalize-DeptCode $d.code
            $listName = "Villes-$code"
            Ensure-CityListStructure $listName
            Update-IndexItem -Dept $d -ListName $listName -Count 0
        }
        Add-Journal -TargetList $ListJournalActions -Type "Structure" -Objet "Villes par departement" -Message "Structure creee sans import massif" -Statut "OK"
    } elseif ($choice -eq "TOUS") {
        WTitle "MODE IMPORT TOUS DEPARTEMENTS"
        foreach ($d in $departements) { Import-Department -Dept $d }
    } else {
        WTitle "MODE IMPORT DEPARTEMENT $choice"
        $dept = $departements | Where-Object { (Normalize-DeptCode $_.code) -eq $choice } | Select-Object -First 1
        if ($null -eq $dept) { throw "Departement introuvable dans l'API : $choice" }
        Import-Department -Dept $dept
    }

    WTitle "TERMINE"
    Write-Host "Log : $LogFile" -ForegroundColor Green
}
catch {
    Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    try { Add-Journal -TargetList $ListJournalErreurs -Type "Erreur" -Objet "Villes par departement" -Message $_.Exception.Message -Statut "ERREUR" } catch {}
    throw
}
finally {
    Stop-Transcript | Out-Null
}
