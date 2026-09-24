# ============================================================
# DSE COMMON - Fonctions communes geographie
# ============================================================

function Write-DSETitle {
    param([string]$Text)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Connect-DSESharePoint {
    param([string]$SiteUrl)
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

function Get-DSEListCount {
    param([string]$ListName)
    try {
        $list = Get-PnPList -Identity $ListName -Includes ItemCount
        return [int]$list.ItemCount
    }
    catch {
        Write-Host "ERREUR COMPTEUR : $ListName - $($_.Exception.Message)" -ForegroundColor Red
        return -1
    }
}

function Test-DSEField {
    param([string]$ListName, [string]$InternalName)
    try {
        $fields = Get-PnPField -List $ListName
        $field = $fields | Where-Object { $_.InternalName -eq $InternalName }
        return ($null -ne $field)
    }
    catch {
        return $false
    }
}

function Ensure-DSETextField {
    param([string]$ListName, [string]$DisplayName, [string]$InternalName)
    if (-not (Test-DSEField -ListName $ListName -InternalName $InternalName)) {
        Add-PnPField -List $ListName -DisplayName $DisplayName -InternalName $InternalName -Type Text -AddToDefaultView | Out-Null
        Write-Host "Colonne ajoutee : $ListName / $DisplayName" -ForegroundColor Green
    }
}

function Ensure-DSEJournalList {
    param([string]$ListName)
    $list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -eq $list) {
        New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch | Out-Null
        Write-Host "Liste journal creee : $ListName" -ForegroundColor Green
    }
    Ensure-DSETextField -ListName $ListName -DisplayName "Type" -InternalName "TypeJournal"
    Ensure-DSETextField -ListName $ListName -DisplayName "Module" -InternalName "Module"
    Ensure-DSETextField -ListName $ListName -DisplayName "Objet" -InternalName "Objet"
    Ensure-DSETextField -ListName $ListName -DisplayName "Message" -InternalName "Message"
    Ensure-DSETextField -ListName $ListName -DisplayName "Statut" -InternalName "Statut"
}

function Add-DSEJournal {
    param(
        [string]$ListName,
        [string]$Title,
        [string]$TypeJournal,
        [string]$Module,
        [string]$Objet,
        [string]$Message,
        [string]$Statut
    )
    try {
        Add-PnPListItem -List $ListName -Values @{
            "Title" = $Title
            "TypeJournal" = $TypeJournal
            "Module" = $Module
            "Objet" = $Objet
            "Message" = $Message
            "Statut" = $Statut
        } | Out-Null
    }
    catch {
        Write-Host "Journal non ecrit dans $ListName : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Count-DSEEmptyField {
    param([string]$ListName, [string]$FieldInternalName)
    if (-not (Test-DSEField -ListName $ListName -InternalName $FieldInternalName)) { return "Champ absent" }
    try {
        $items = Get-PnPListItem -List $ListName -PageSize 2000 -Fields $FieldInternalName
        $empty = 0
        foreach ($item in $items) {
            $value = $item[$FieldInternalName]
            if ($null -eq $value -or "$value".Trim() -eq "") { $empty++ }
        }
        return $empty
    }
    catch { return "Erreur controle" }
}

function Ensure-DSEView {
    param([string]$ListName, [string]$ViewName, [string[]]$Fields, [string]$Query = "")
    try {
        $existingFields = @()
        $listFields = Get-PnPField -List $ListName
        foreach ($fieldName in $Fields) {
            if ($listFields | Where-Object { $_.InternalName -eq $fieldName }) { $existingFields += $fieldName }
        }
        $view = Get-PnPView -List $ListName -Identity $ViewName -ErrorAction SilentlyContinue
        if ($null -eq $view) {
            Add-PnPView -List $ListName -Title $ViewName -Fields $existingFields -Query $Query -RowLimit 100 -Paged | Out-Null
            Write-Host "Vue creee : $ListName / $ViewName" -ForegroundColor Green
        }
        else {
            Set-PnPView -List $ListName -Identity $ViewName -Fields $existingFields -Values @{ ViewQuery = $Query; RowLimit = 100; Paged = $true } | Out-Null
            Write-Host "Vue mise a jour : $ListName / $ViewName" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Vue non modifiee : $ListName / $ViewName / $($_.Exception.Message)" -ForegroundColor Red
    }
}
