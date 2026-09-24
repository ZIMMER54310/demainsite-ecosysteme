
# DEMAIN_SITE_CREATE_LISTS.ps1
# Crée automatiquement les listes SharePoint DemainSite Écosystème et leurs colonnes.
# Règle : PascARA IA propose, Pascal valide.
# Site cible prérempli d'après l'écran SharePoint actuel.

param(
    [string]$SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque"
)

Write-Host "DemainSite Écosystème - Création automatique des listes SharePoint" -ForegroundColor Cyan
Write-Host "Site cible : $SiteUrl" -ForegroundColor Yellow
Write-Host "Si PnP.PowerShell n'est pas installé, le script propose l'installation." -ForegroundColor Yellow

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Write-Host "Installation du module PnP.PowerShell pour l'utilisateur courant..." -ForegroundColor Yellow
    Install-Module PnP.PowerShell -Scope CurrentUser -Force
}

Import-Module PnP.PowerShell
Connect-PnPOnline -Url $SiteUrl -Interactive

function Ensure-List {
    param([string]$ListTitle)
    $existing = Get-PnPList -Identity $ListTitle -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "Création de la liste : $ListTitle" -ForegroundColor Green
        New-PnPList -Title $ListTitle -Template GenericList -OnQuickLaunch | Out-Null
    } else {
        Write-Host "Liste déjà existante : $ListTitle" -ForegroundColor DarkYellow
    }
}

function XmlEscape([string]$s) {
    return [System.Security.SecurityElement]::Escape($s)
}

function Ensure-Field {
    param(
        [string]$ListTitle,
        [string]$InternalName,
        [string]$DisplayName,
        [string]$Type,
        [string]$Required,
        [string]$Choices
    )
    if ($InternalName -eq "Title") {
        try {
            Set-PnPField -List $ListTitle -Identity "Title" -Values @{Title=$DisplayName; Required=($Required -eq "true")} | Out-Null
            Write-Host "Colonne Titre renommée dans $ListTitle : $DisplayName" -ForegroundColor Gray
        } catch {
            Write-Host "Impossible de renommer Titre dans $ListTitle. Ce n'est pas bloquant." -ForegroundColor DarkYellow
        }
        return
    }

    $field = Get-PnPField -List $ListTitle -Identity $InternalName -ErrorAction SilentlyContinue
    if ($null -ne $field) {
        Write-Host "Colonne déjà existante : $ListTitle / $DisplayName" -ForegroundColor DarkYellow
        return
    }

    $req = if ($Required -eq "true") { "TRUE" } else { "FALSE" }
    $display = XmlEscape $DisplayName
    $internal = XmlEscape $InternalName

    if ($Type -eq "Choice") {
        $choiceXml = ""
        foreach ($c in $Choices.Split('|')) { $choiceXml += "<CHOICE>$(XmlEscape $c)</CHOICE>" }
        $xml = "<Field Type='Choice' DisplayName='$display' Name='$internal' StaticName='$internal' Required='$req' Format='Dropdown'><CHOICES>$choiceXml</CHOICES></Field>"
        Add-PnPFieldFromXml -List $ListTitle -FieldXml $xml | Out-Null
    } elseif ($Type -eq "Note") {
        $xml = "<Field Type='Note' DisplayName='$display' Name='$internal' StaticName='$internal' Required='$req' NumLines='6' RichText='FALSE' />"
        Add-PnPFieldFromXml -List $ListTitle -FieldXml $xml | Out-Null
    } elseif ($Type -eq "Number") {
        $xml = "<Field Type='Number' DisplayName='$display' Name='$internal' StaticName='$internal' Required='$req' />"
        Add-PnPFieldFromXml -List $ListTitle -FieldXml $xml | Out-Null
    } elseif ($Type -eq "DateTime") {
        $xml = "<Field Type='DateTime' DisplayName='$display' Name='$internal' StaticName='$internal' Required='$req' Format='DateOnly' />"
        Add-PnPFieldFromXml -List $ListTitle -FieldXml $xml | Out-Null
    } elseif ($Type -eq "URL") {
        $xml = "<Field Type='URL' DisplayName='$display' Name='$internal' StaticName='$internal' Required='$req' Format='Hyperlink' />"
        Add-PnPFieldFromXml -List $ListTitle -FieldXml $xml | Out-Null
    } else {
        $xml = "<Field Type='Text' DisplayName='$display' Name='$internal' StaticName='$internal' Required='$req' />"
        Add-PnPFieldFromXml -List $ListTitle -FieldXml $xml | Out-Null
    }
    Write-Host "Colonne créée : $ListTitle / $DisplayName" -ForegroundColor Green
}

$schema = Get-Content -Raw -Path ".\schema-listes-demainsite.json" | ConvertFrom-Json
foreach ($listProp in $schema.PSObject.Properties) {
    $listTitle = $listProp.Name
    Ensure-List -ListTitle $listTitle
    foreach ($field in $listProp.Value) {
        Ensure-Field -ListTitle $listTitle -InternalName $field[0] -DisplayName $field[1] -Type $field[2] -Required $field[3] -Choices $field[4]
    }
}

Write-Host "Création terminée. Contrôle visuel recommandé dans SharePoint." -ForegroundColor Cyan
