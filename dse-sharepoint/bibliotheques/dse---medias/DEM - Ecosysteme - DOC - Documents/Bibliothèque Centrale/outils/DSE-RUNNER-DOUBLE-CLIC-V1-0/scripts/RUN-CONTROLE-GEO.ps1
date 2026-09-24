# ============================================================
# DEMAINSITE ECOSYSTEME - CONTROLE GEOGRAPHIE
# V1.3 - Controle manuel et journalisation
# ============================================================

param(
    [ValidateSet("AuditOnly","AutoUpdate")]
    [string]$Mode = "AuditOnly"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$Root\CONFIG.ps1"
. "$Root\steps\DSE-Common.ps1"

$cfg = $global:DSE_GEO_Config
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $Root "logs\DSE-GEO-CONTROLE-$runId.log"
$csvFile = Join-Path $Root "logs\DSE-GEO-CONTROLE-$runId.csv"

Start-Transcript -Path $logFile -Force | Out-Null

try {
    Write-DSETitle "DEMAINSITE - CONTROLE GEOGRAPHIE V1.3"
    Write-Host "Mode : $Mode" -ForegroundColor Cyan

    Connect-DSESharePoint -SiteUrl $cfg.SiteUrl

    Ensure-DSEJournalList -ListName $cfg.ListJournalActions
    Ensure-DSEJournalList -ListName $cfg.ListJournalErreurs

    $lists = @(
        @{ Name = $cfg.ListPays; Min = 1 },
        @{ Name = $cfg.ListRegions; Min = $cfg.ExpectedMinRegions },
        @{ Name = $cfg.ListDepartements; Min = $cfg.ExpectedMinDepartements },
        @{ Name = $cfg.ListVilles; Min = $cfg.ExpectedMinVilles },
        @{ Name = $cfg.ListCodesPostaux; Min = $cfg.ExpectedMinCodesPostaux },
        @{ Name = $cfg.ListCodesPostauxVilles; Min = $cfg.ExpectedMinRelationsCPVilles }
    )

    $report = @()

    Write-DSETitle "COMPTAGE DES LISTES"
    foreach ($entry in $lists) {
        $count = Get-DSEListCount -ListName $entry.Name
        $status = "OK"
        if ($count -lt $entry.Min) { $status = "ALERTE_VOLUME" }
        if ($count -lt 0) { $status = "ERREUR" }

        $line = [PSCustomObject]@{
            DateControle = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Liste = $entry.Name
            Nombre = $count
            MinimumAttendu = $entry.Min
            Statut = $status
        }
        $report += $line

        if ($status -eq "OK") {
            Write-Host "$($entry.Name) : $count elements" -ForegroundColor Green
        }
        else {
            Write-Host "$($entry.Name) : $count elements / minimum attendu $($entry.Min)" -ForegroundColor Red
            Add-DSEJournal -ListName $cfg.ListJournalErreurs -Title "Controle geographie $runId" -TypeJournal "Erreur" -Module "Geographie" -Objet $entry.Name -Message "Volume insuffisant : $count elements pour minimum $($entry.Min)" -Statut "A verifier"
        }
    }

    $report | Export-Csv -Path $csvFile -NoTypeInformation -Encoding UTF8

    Write-DSETitle "CONTROLE DES CHAMPS VIDES"
    $emptyChecks = @(
        @{ List = $cfg.ListDepartements; Field = "CodeRegion"; Label = "Departements sans Code Region" },
        @{ List = $cfg.ListDepartements; Field = "NomRegion"; Label = "Departements sans Nom Region" },
        @{ List = $cfg.ListVilles; Field = "CodeDepartement"; Label = "Villes sans Code Departement" },
        @{ List = $cfg.ListVilles; Field = "NomDepartement"; Label = "Villes sans Nom Departement" },
        @{ List = $cfg.ListVilles; Field = "CodeRegion"; Label = "Villes sans Code Region" },
        @{ List = $cfg.ListVilles; Field = "NomRegion"; Label = "Villes sans Nom Region" },
        @{ List = $cfg.ListCodesPostaux; Field = "CodePostal"; Label = "CodesPostaux sans Code Postal" },
        @{ List = $cfg.ListCodesPostauxVilles; Field = "CodePostal"; Label = "CP/Villes sans Code Postal" },
        @{ List = $cfg.ListCodesPostauxVilles; Field = "CodeINSEE"; Label = "CP/Villes sans Code INSEE" },
        @{ List = $cfg.ListCodesPostauxVilles; Field = "NomVille"; Label = "CP/Villes sans Ville" },
        @{ List = $cfg.ListCodesPostauxVilles; Field = "CodeDepartement"; Label = "CP/Villes sans Departement" },
        @{ List = $cfg.ListCodesPostauxVilles; Field = "CodeRegion"; Label = "CP/Villes sans Region" }
    )

    foreach ($check in $emptyChecks) {
        $emptyCount = Count-DSEEmptyField -ListName $check.List -FieldInternalName $check.Field
        if ($emptyCount -eq 0) {
            Write-Host "$($check.Label) : 0" -ForegroundColor Green
        }
        else {
            Write-Host "$($check.Label) : $emptyCount" -ForegroundColor Yellow
            Add-DSEJournal -ListName $cfg.ListJournalActions -Title "Controle geographie $runId" -TypeJournal "Controle" -Module "Geographie" -Objet $check.Label -Message "Nombre detecte : $emptyCount" -Statut "A verifier"
        }
    }

    Write-DSETitle "CREATION DES VUES DE CONTROLE"
    Ensure-DSEView -ListName $cfg.ListDepartements -ViewName "Departements - Controle complet" -Fields @("Title","IDDepartement","CodeDepartement","NomDepartement","CodeRegion","NomRegion","PaysTexte","StatutGeo")
    Ensure-DSEView -ListName $cfg.ListDepartements -ViewName "Departements - Sans region" -Fields @("Title","CodeDepartement","NomDepartement","CodeRegion","NomRegion","PaysTexte") -Query "<Where><Or><IsNull><FieldRef Name='CodeRegion' /></IsNull><IsNull><FieldRef Name='NomRegion' /></IsNull></Or></Where>"
    Ensure-DSEView -ListName $cfg.ListVilles -ViewName "Villes - Controle complet" -Fields @("Title","IDVille","CodeINSEE","NomVille","NomPostal","CodeDepartement","NomDepartement","CodeRegion","NomRegion","PaysTexte","StatutGeo")
    Ensure-DSEView -ListName $cfg.ListVilles -ViewName "Villes - Sans departement" -Fields @("Title","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion") -Query "<Where><Or><IsNull><FieldRef Name='CodeDepartement' /></IsNull><IsNull><FieldRef Name='NomDepartement' /></IsNull></Or></Where>"
    Ensure-DSEView -ListName $cfg.ListVilles -ViewName "Villes - Sans region" -Fields @("Title","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion") -Query "<Where><Or><IsNull><FieldRef Name='CodeRegion' /></IsNull><IsNull><FieldRef Name='NomRegion' /></IsNull></Or></Where>"
    Ensure-DSEView -ListName $cfg.ListCodesPostaux -ViewName "Codes postaux - Controle complet" -Fields @("Title","IDCodePostal","CodePostal","NombreVilles","DepartementsAssocies","RegionsAssociees","PaysTexte","StatutGeo")
    Ensure-DSEView -ListName $cfg.ListCodesPostaux -ViewName "Codes postaux - Sans code" -Fields @("Title","IDCodePostal","CodePostal","NombreVilles","PaysTexte") -Query "<Where><IsNull><FieldRef Name='CodePostal' /></IsNull></Where>"
    Ensure-DSEView -ListName $cfg.ListCodesPostauxVilles -ViewName "CP Villes - Controle complet" -Fields @("Title","IDCPVille","CleCPVille","CodePostal","CodeINSEE","NomVille","LibelleAcheminement","CodeDepartement","NomDepartement","CodeRegion","NomRegion","PaysTexte","StatutGeo")
    Ensure-DSEView -ListName $cfg.ListCodesPostauxVilles -ViewName "CP Villes - Sans ville" -Fields @("Title","CodePostal","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion") -Query "<Where><Or><IsNull><FieldRef Name='CodeINSEE' /></IsNull><IsNull><FieldRef Name='NomVille' /></IsNull></Or></Where>"
    Ensure-DSEView -ListName $cfg.ListCodesPostauxVilles -ViewName "CP Villes - Sans code postal" -Fields @("Title","CodePostal","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion") -Query "<Where><IsNull><FieldRef Name='CodePostal' /></IsNull></Where>"
    Ensure-DSEView -ListName $cfg.ListCodesPostauxVilles -ViewName "CP Villes - Sans departement ou region" -Fields @("Title","CodePostal","CodeINSEE","NomVille","CodeDepartement","NomDepartement","CodeRegion","NomRegion") -Query "<Where><Or><IsNull><FieldRef Name='CodeDepartement' /></IsNull><IsNull><FieldRef Name='CodeRegion' /></IsNull></Or></Where>"

    Add-DSEJournal -ListName $cfg.ListJournalActions -Title "Controle geographie $runId" -TypeJournal "Controle" -Module "Geographie" -Objet "Controle mensuel/manuelle" -Message "Controle execute. Rapport local : $csvFile" -Statut "Termine"

    Write-DSETitle "RAPPORT FINAL"
    $report | Format-Table -AutoSize
    Write-Host "Rapport CSV : $csvFile" -ForegroundColor Cyan
    Write-Host "Controle termine." -ForegroundColor Green
}
catch {
    Write-Host "ERREUR GENERALE : $($_.Exception.Message)" -ForegroundColor Red
    try { Add-DSEJournal -ListName $cfg.ListJournalErreurs -Title "Controle geographie $runId" -TypeJournal "Erreur" -Module "Geographie" -Objet "Execution" -Message $_.Exception.Message -Statut "Erreur" } catch {}
}
finally {
    Stop-Transcript | Out-Null
}
